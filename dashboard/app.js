// Dashboard — vanilla JS SPA, no build step
const API = window.location.origin;
let refreshTimer = null;
let currentRoute = '';

// ── Fetch helpers ─────────────────────────────────────────────────

async function api(path) {
  try {
    const res = await fetch(API + path);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch { return null; }
}

// ── Formatters ────────────────────────────────────────────────────

function shortHash(h) {
  if (!h) return '\u2014';
  return h.substring(0, 8) + '\u2026' + h.substring(h.length - 6);
}

function timeAgo(ts) {
  if (!ts) return '\u2014';
  const diff = Date.now() - ts;
  if (diff < 1000) return 'just now';
  if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  return Math.floor(diff / 3600000) + 'h ago';
}

function formatUptime(ms) {
  if (!ms) return '\u2014';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

function formatTime(ts) {
  if (!ts) return '\u2014';
  return new Date(ts).toLocaleString();
}

function txTypeBadge(type) {
  const colors = {
    'state:set': 'badge-green',
    'state:delete': 'badge-red',
    'contract:deploy': 'badge-purple',
    'contract:invoke': 'badge-cyan',
    'governance:propose': 'badge-orange',
    'governance:vote': 'badge-yellow',
  };
  return `<span class="badge ${colors[type] || ''}">${type}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function jsonPretty(obj) {
  return escapeHtml(JSON.stringify(obj, null, 2));
}

// ── Router ────────────────────────────────────────────────────────

function navigate(hash) {
  window.location.hash = hash;
}

function getRoute() {
  const h = window.location.hash.slice(1) || '/';
  return h;
}

function matchRoute(route) {
  const patterns = [
    { pattern: /^\/$/, page: 'overview' },
    { pattern: /^\/blocks$/, page: 'blocks' },
    { pattern: /^\/block\/(\d+)$/, page: 'blockDetail', params: m => ({ height: parseInt(m[1]) }) },
    { pattern: /^\/transactions$/, page: 'transactions' },
    { pattern: /^\/tx\/([a-fA-F0-9]+)$/, page: 'txDetail', params: m => ({ hash: m[1] }) },
    { pattern: /^\/address\/([a-fA-F0-9]+)$/, page: 'address', params: m => ({ pubkey: m[1] }) },
    { pattern: /^\/state$/, page: 'state' },
    { pattern: /^\/state\/(.+)$/, page: 'stateDetail', params: m => ({ key: decodeURIComponent(m[1]) }) },
    { pattern: /^\/contracts$/, page: 'contracts' },
    { pattern: /^\/contract\/(.+)$/, page: 'contractDetail', params: m => ({ name: decodeURIComponent(m[1]) }) },
    { pattern: /^\/governance$/, page: 'governance' },
    { pattern: /^\/proposal\/(.+)$/, page: 'proposalDetail', params: m => ({ id: m[1] }) },
    { pattern: /^\/network$/, page: 'network' },
  ];

  for (const p of patterns) {
    const m = route.match(p.pattern);
    if (m) return { page: p.page, params: p.params ? p.params(m) : {} };
  }
  return { page: 'overview', params: {} };
}

async function router() {
  const route = getRoute();
  if (route === currentRoute) return;
  currentRoute = route;

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach(el => {
    const r = el.getAttribute('data-route');
    if (r === route || (r && r !== '/' && route.startsWith(r))) {
      el.classList.add('active');
    } else if (r === '/' && route === '/') {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  const { page, params } = matchRoute(route);
  const el = document.getElementById('app');

  switch (page) {
    case 'overview': await renderOverview(el); break;
    case 'blocks': await renderBlocks(el); break;
    case 'blockDetail': await renderBlockDetail(el, params.height); break;
    case 'transactions': await renderTransactions(el); break;
    case 'txDetail': await renderTxDetail(el, params.hash); break;
    case 'address': await renderAddress(el, params.pubkey); break;
    case 'state': await renderState(el); break;
    case 'stateDetail': await renderStateDetail(el, params.key); break;
    case 'contracts': await renderContracts(el); break;
    case 'contractDetail': await renderContractDetail(el, params.name); break;
    case 'governance': await renderGovernance(el); break;
    case 'proposalDetail': await renderProposalDetail(el, params.id); break;
    case 'network': await renderNetwork(el); break;
    default: await renderOverview(el);
  }
}

// ── Page: Overview ────────────────────────────────────────────────

async function renderOverview(el) {
  el.innerHTML = '<div class="empty-state">Loading...</div>';

  const [status, blocksData, peers, contracts, proposals, consensus] = await Promise.all([
    api('/status'),
    api('/blocks?limit=20'),
    api('/peers'),
    api('/contracts'),
    api('/proposals'),
    api('/consensus'),
  ]);

  const height = status?.chainHeight ?? 0;
  const stateCount = await apiPost('/state/query', { sql: "SELECT COUNT(*) as c FROM world_state WHERE key NOT LIKE '\\_%' ESCAPE '\\'" });
  const stateKeys = stateCount?.results?.[0]?.c ?? 0;
  const contractCount = contracts?.count ?? 0;
  const proposalCount = proposals?.count ?? 0;

  // Compute blocks-per-minute chart data from block timestamps
  const blocks = blocksData?.blocks ?? [];
  const chartBars = [];
  if (blocks.length > 1) {
    const sorted = [...blocks].sort((a, b) => a.height - b.height);
    for (let i = 1; i < sorted.length; i++) {
      const dt = sorted[i].timestamp - sorted[i - 1].timestamp;
      chartBars.push(dt > 0 ? 60000 / dt : 0); // blocks per minute
    }
  }
  const maxBpm = Math.max(...chartBars, 1);

  // Recent 5 blocks, 5 txs
  const recentBlocks = blocks.slice(0, 5);
  const allTx = [];
  for (const b of blocks) {
    for (const tx of b.transactions) {
      allTx.push({ ...tx, blockHeight: b.height });
    }
  }
  allTx.sort((a, b) => b.timestamp - a.timestamp);
  const recentTx = allTx.slice(0, 5);

  let consensusHtml = '';
  if (consensus?.state) {
    const s = consensus.state;
    consensusHtml = `
      <div class="detail-grid" style="margin-top:0">
        <div class="detail-row"><div class="detail-label">Role</div><div class="detail-value text"><span class="badge ${s.role === 'leader' ? 'badge-green' : ''}">${s.role}</span></div></div>
        <div class="detail-row"><div class="detail-label">Term</div><div class="detail-value">${s.term ?? '\u2014'}</div></div>
        <div class="detail-row"><div class="detail-label">Leader</div><div class="detail-value">${s.leaderId || 'none'}</div></div>
      </div>`;
  }

  el.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="stat-value">${height}</div><div class="stat-label">Block Height</div></div>
      <div class="stat"><div class="stat-value">${status?.txPoolSize ?? 0}</div><div class="stat-label">TX Pool</div></div>
      <div class="stat"><div class="stat-value">${status?.peerCount ?? 0}</div><div class="stat-label">Peers</div></div>
      <div class="stat"><div class="stat-value">${stateKeys}</div><div class="stat-label">State Keys</div></div>
      <div class="stat"><div class="stat-value">${contractCount}</div><div class="stat-label">Contracts</div></div>
      <div class="stat"><div class="stat-value">${proposalCount}</div><div class="stat-label">Proposals</div></div>
    </div>

    ${chartBars.length > 0 ? `
    <div class="mini-chart">
      <div class="mini-chart-title">Block Rate (blocks/min, last ${chartBars.length + 1} blocks)</div>
      <div class="chart-bars">
        ${chartBars.map(v => `<div class="chart-bar" style="height:${Math.max(4, (v / maxBpm) * 100)}%" title="${v.toFixed(1)} bpm"></div>`).join('')}
      </div>
    </div>` : ''}

    <div class="grid">
      <div class="card">
        <div class="card-header">Recent Blocks <a class="link" href="#/blocks">View all &rarr;</a></div>
        <div class="card-body">
          ${recentBlocks.length === 0 ? '<div class="empty-state">No blocks yet</div>' :
            recentBlocks.map(b => `
              <div class="list-item">
                <a class="num link" href="#/block/${b.height}">#${b.height}</a>
                <span class="hash">${shortHash(b.hash)}</span>
                <span class="meta">${b.transactions.length} tx &middot; ${timeAgo(b.timestamp)}</span>
              </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">Recent Transactions <a class="link" href="#/transactions">View all &rarr;</a></div>
        <div class="card-body">
          ${recentTx.length === 0 ? '<div class="empty-state">No transactions yet</div>' :
            recentTx.map(tx => `
              <div class="list-item">
                <a class="link mono" href="#/tx/${tx.hash}" style="font-size:12px">${shortHash(tx.hash)}</a>
                ${txTypeBadge(tx.type)}
                <span class="meta">Block #${tx.blockHeight} &middot; ${timeAgo(tx.timestamp)}</span>
              </div>`).join('')}
        </div>
      </div>
    </div>

    ${consensusHtml ? `
    <div style="margin-top:20px">
      <div class="page-title" style="font-size:16px">Consensus Status</div>
      ${consensusHtml}
    </div>` : ''}
  `;
}

// ── Page: Block List ──────────────────────────────────────────────

async function renderBlocks(el, page) {
  const p = page || parseInt(new URLSearchParams(window.location.hash.split('?')[1]).get('page')) || 1;
  el.innerHTML = '<div class="empty-state">Loading blocks...</div>';

  const data = await api(`/blocks?page=${p}&limit=20`);
  if (!data) { el.innerHTML = '<div class="empty-state">Failed to load blocks</div>'; return; }

  el.innerHTML = `
    <div class="page-title">Blocks</div>
    <table class="data-table">
      <thead><tr>
        <th>Height</th><th>Hash</th><th>Proposer</th><th>Txs</th><th>Time</th>
      </tr></thead>
      <tbody>
        ${data.blocks.map(b => `
          <tr class="clickable" onclick="navigate('#/block/${b.height}')">
            <td><a class="link" href="#/block/${b.height}">#${b.height}</a></td>
            <td class="mono dim">${shortHash(b.hash)}</td>
            <td class="mono dim"><a class="link" href="#/address/${b.proposer}">${shortHash(b.proposer)}</a></td>
            <td>${b.transactions.length}</td>
            <td class="dim">${timeAgo(b.timestamp)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="pagination">
      <button onclick="renderBlocks(document.getElementById('app'), ${p - 1})" ${p <= 1 ? 'disabled' : ''}>&larr; Newer</button>
      <span class="page-info">Page ${p} of ${data.totalPages}</span>
      <button onclick="renderBlocks(document.getElementById('app'), ${p + 1})" ${p >= data.totalPages ? 'disabled' : ''}>Older &rarr;</button>
    </div>
  `;
}

// ── Page: Block Detail ────────────────────────────────────────────

async function renderBlockDetail(el, height) {
  el.innerHTML = '<div class="empty-state">Loading block...</div>';

  const block = await api(`/blocks/${height}`);
  if (!block) { el.innerHTML = '<div class="empty-state">Block not found</div>'; return; }

  const maxHeight = (await api('/status'))?.chainHeight ?? height;

  el.innerHTML = `
    <div class="block-nav">
      <button onclick="navigate('#/block/${height - 1}')" ${height <= 0 ? 'disabled' : ''}>&larr; Block ${height - 1}</button>
      <span class="block-nav-info">Block #${height}</span>
      <button onclick="navigate('#/block/${height + 1}')" ${height >= maxHeight ? 'disabled' : ''}>Block ${height + 1} &rarr;</button>
    </div>

    <div class="detail-grid">
      <div class="detail-row"><div class="detail-label">Height</div><div class="detail-value">${block.height}</div></div>
      <div class="detail-row"><div class="detail-label">Hash</div><div class="detail-value">${block.hash}</div></div>
      <div class="detail-row"><div class="detail-label">Previous Hash</div><div class="detail-value">${block.previousHash}</div></div>
      <div class="detail-row"><div class="detail-label">Merkle Root</div><div class="detail-value">${block.merkleRoot}</div></div>
      <div class="detail-row"><div class="detail-label">State Root</div><div class="detail-value">${block.stateRoot}</div></div>
      <div class="detail-row"><div class="detail-label">Proposer</div><div class="detail-value"><a class="link" href="#/address/${block.proposer}">${block.proposer}</a></div></div>
      <div class="detail-row"><div class="detail-label">Signature</div><div class="detail-value">${block.signature}</div></div>
      <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-value text">${formatTime(block.timestamp)}</div></div>
      <div class="detail-row"><div class="detail-label">Transactions</div><div class="detail-value text">${block.transactions.length}</div></div>
    </div>

    ${block.transactions.length > 0 ? `
    <div class="page-title" style="font-size:16px;margin-top:8px">Transactions in Block</div>
    <table class="data-table">
      <thead><tr><th>Hash</th><th>Type</th><th>Sender</th><th>Time</th></tr></thead>
      <tbody>
        ${block.transactions.map(tx => `
          <tr class="clickable" onclick="navigate('#/tx/${tx.hash}')">
            <td class="mono"><a class="link" href="#/tx/${tx.hash}">${shortHash(tx.hash)}</a></td>
            <td>${txTypeBadge(tx.type)}</td>
            <td class="mono dim"><a class="link" href="#/address/${tx.sender}">${shortHash(tx.sender)}</a></td>
            <td class="dim">${timeAgo(tx.timestamp)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state">No transactions in this block</div>'}
  `;
}

// ── Page: Transaction List ────────────────────────────────────────

let txFilter = '';

async function renderTransactions(el, page) {
  const p = page || 1;
  el.innerHTML = '<div class="empty-state">Loading transactions...</div>';

  const typeParam = txFilter ? `&type=${encodeURIComponent(txFilter)}` : '';
  const data = await api(`/tx/recent?page=${p}&limit=20${typeParam}`);
  if (!data) { el.innerHTML = '<div class="empty-state">Failed to load transactions</div>'; return; }

  el.innerHTML = `
    <div class="page-title">Transactions</div>
    <div class="filter-bar">
      <label>Filter by type:</label>
      <select id="tx-type-filter" onchange="txFilter=this.value;renderTransactions(document.getElementById('app'),1)">
        <option value="">All types</option>
        <option value="state:set" ${txFilter === 'state:set' ? 'selected' : ''}>state:set</option>
        <option value="state:delete" ${txFilter === 'state:delete' ? 'selected' : ''}>state:delete</option>
        <option value="contract:deploy" ${txFilter === 'contract:deploy' ? 'selected' : ''}>contract:deploy</option>
        <option value="contract:invoke" ${txFilter === 'contract:invoke' ? 'selected' : ''}>contract:invoke</option>
        <option value="governance:propose" ${txFilter === 'governance:propose' ? 'selected' : ''}>governance:propose</option>
        <option value="governance:vote" ${txFilter === 'governance:vote' ? 'selected' : ''}>governance:vote</option>
      </select>
      <span class="dim" style="font-size:12px">${data.total} total</span>
    </div>
    <table class="data-table">
      <thead><tr><th>Hash</th><th>Type</th><th>Sender</th><th>Block</th><th>Time</th></tr></thead>
      <tbody>
        ${data.transactions.map(tx => `
          <tr class="clickable" onclick="navigate('#/tx/${tx.hash}')">
            <td class="mono"><a class="link" href="#/tx/${tx.hash}">${shortHash(tx.hash)}</a></td>
            <td>${txTypeBadge(tx.type)}</td>
            <td class="mono dim"><a class="link" href="#/address/${tx.sender}">${shortHash(tx.sender)}</a></td>
            <td><a class="link" href="#/block/${tx.blockHeight}">#${tx.blockHeight}</a></td>
            <td class="dim">${timeAgo(tx.timestamp)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${data.totalPages > 1 ? `
    <div class="pagination">
      <button onclick="renderTransactions(document.getElementById('app'), ${p - 1})" ${p <= 1 ? 'disabled' : ''}>&larr; Prev</button>
      <span class="page-info">Page ${p} of ${data.totalPages}</span>
      <button onclick="renderTransactions(document.getElementById('app'), ${p + 1})" ${p >= data.totalPages ? 'disabled' : ''}>Next &rarr;</button>
    </div>` : ''}
  `;
}

// ── Page: Transaction Detail ──────────────────────────────────────

async function renderTxDetail(el, hash) {
  el.innerHTML = '<div class="empty-state">Loading transaction...</div>';

  const tx = await api(`/tx/${hash}`);
  if (!tx) { el.innerHTML = '<div class="empty-state">Transaction not found</div>'; return; }

  // Find the block containing this tx
  let blockHeight = null;
  const search = await apiPost('/state/query', { sql: `SELECT block_height FROM transactions WHERE hash = '${hash}'` });
  if (search?.results?.[0]) blockHeight = search.results[0].block_height;

  el.innerHTML = `
    <div class="page-title">Transaction Detail</div>
    <div class="detail-grid">
      <div class="detail-row"><div class="detail-label">Hash</div><div class="detail-value">${tx.hash}</div></div>
      <div class="detail-row"><div class="detail-label">Type</div><div class="detail-value text">${txTypeBadge(tx.type)}</div></div>
      <div class="detail-row"><div class="detail-label">Sender</div><div class="detail-value"><a class="link" href="#/address/${tx.sender}">${tx.sender}</a></div></div>
      <div class="detail-row"><div class="detail-label">Nonce</div><div class="detail-value">${tx.nonce}</div></div>
      <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-value text">${formatTime(tx.timestamp)}</div></div>
      <div class="detail-row"><div class="detail-label">Signature</div><div class="detail-value">${tx.signature}</div></div>
      ${blockHeight !== null ? `<div class="detail-row"><div class="detail-label">Block</div><div class="detail-value text"><a class="link" href="#/block/${blockHeight}">Block #${blockHeight}</a></div></div>` : ''}
    </div>

    <div class="page-title" style="font-size:16px;margin-top:8px">Payload</div>
    <div class="json-viewer">${jsonPretty(tx.payload)}</div>
  `;
}

// ── Page: Address ─────────────────────────────────────────────────

async function renderAddress(el, pubkey) {
  el.innerHTML = '<div class="empty-state">Loading address...</div>';

  const [txData, stateData] = await Promise.all([
    api(`/tx/sender/${pubkey}`),
    apiPost('/state/query', { sql: `SELECT key, value, version, updated_at, block_height FROM world_state WHERE updated_by = ? AND key NOT LIKE '\\_%' ESCAPE '\\'`, params: [pubkey] }),
  ]);

  const txs = txData?.transactions ?? [];
  const stateEntries = stateData?.results ?? [];

  el.innerHTML = `
    <div class="page-title">Address</div>
    <div class="detail-grid">
      <div class="detail-row"><div class="detail-label">Public Key</div><div class="detail-value">${pubkey}</div></div>
      <div class="detail-row"><div class="detail-label">Node ID</div><div class="detail-value">${shortHash(pubkey)}</div></div>
      <div class="detail-row"><div class="detail-label">Transactions</div><div class="detail-value text">${txs.length}</div></div>
      <div class="detail-row"><div class="detail-label">State Entries</div><div class="detail-value text">${stateEntries.length}</div></div>
    </div>

    <div class="page-title" style="font-size:16px;margin-top:8px">Transaction History</div>
    ${txs.length === 0 ? '<div class="empty-state">No transactions from this address</div>' : `
    <table class="data-table">
      <thead><tr><th>Hash</th><th>Type</th><th>Nonce</th><th>Time</th></tr></thead>
      <tbody>
        ${txs.map(tx => `
          <tr class="clickable" onclick="navigate('#/tx/${tx.hash}')">
            <td class="mono"><a class="link" href="#/tx/${tx.hash}">${shortHash(tx.hash)}</a></td>
            <td>${txTypeBadge(tx.type)}</td>
            <td>${tx.nonce}</td>
            <td class="dim">${timeAgo(tx.timestamp)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}

    ${stateEntries.length > 0 ? `
    <div class="page-title" style="font-size:16px;margin-top:20px">State Entries Owned</div>
    <table class="data-table">
      <thead><tr><th>Key</th><th>Value</th><th>Version</th><th>Block</th></tr></thead>
      <tbody>
        ${stateEntries.map(e => `
          <tr class="clickable" onclick="navigate('#/state/${encodeURIComponent(e.key)}')">
            <td class="mono"><a class="link" href="#/state/${encodeURIComponent(e.key)}">${escapeHtml(e.key)}</a></td>
            <td class="dim" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(String(e.value).substring(0, 80))}</td>
            <td>${e.version}</td>
            <td><a class="link" href="#/block/${e.block_height}">#${e.block_height}</a></td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''}
  `;
}

// ── Page: State Explorer ──────────────────────────────────────────

let stateTab = 'browse';

async function renderState(el, page) {
  const p = page || 1;

  el.innerHTML = `
    <div class="page-title">State Explorer</div>
    <div class="tabs">
      <div class="tab ${stateTab === 'browse' ? 'active' : ''}" onclick="stateTab='browse';renderState(document.getElementById('app'))">Browse</div>
      <div class="tab ${stateTab === 'sql' ? 'active' : ''}" onclick="stateTab='sql';renderState(document.getElementById('app'))">SQL Console</div>
    </div>
    <div id="state-content"></div>
  `;

  const content = document.getElementById('state-content');

  if (stateTab === 'sql') {
    content.innerHTML = `
      <div class="query-area">
        <input type="text" id="sql-input" placeholder="SELECT * FROM world_state LIMIT 20" value="SELECT * FROM world_state ORDER BY updated_at DESC LIMIT 20">
        <button onclick="runSqlQuery()">Run Query</button>
      </div>
      <div id="query-results"><div class="empty-state">Run a query to see results</div></div>
    `;
    document.getElementById('sql-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSqlQuery();
    });
    return;
  }

  content.innerHTML = '<div class="empty-state">Loading state...</div>';
  const data = await api(`/state?page=${p}&limit=20`);
  if (!data) { content.innerHTML = '<div class="empty-state">Failed to load state</div>'; return; }

  content.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Key</th><th>Value</th><th>Version</th><th>Updated By</th><th>Block</th></tr></thead>
      <tbody>
        ${data.entries.map(e => `
          <tr class="clickable" onclick="navigate('#/state/${encodeURIComponent(e.key)}')">
            <td class="mono"><a class="link" href="#/state/${encodeURIComponent(e.key)}">${escapeHtml(e.key)}</a></td>
            <td class="dim" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(JSON.stringify(e.value).substring(0, 80))}</td>
            <td>${e.version}</td>
            <td class="mono dim"><a class="link" href="#/address/${e.updatedBy}">${shortHash(e.updatedBy)}</a></td>
            <td><a class="link" href="#/block/${e.blockHeight}">#${e.blockHeight}</a></td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${data.totalPages > 1 ? `
    <div class="pagination">
      <button onclick="renderState(document.getElementById('app'), ${p - 1})" ${p <= 1 ? 'disabled' : ''}>&larr; Prev</button>
      <span class="page-info">Page ${p} of ${data.totalPages}</span>
      <button onclick="renderState(document.getElementById('app'), ${p + 1})" ${p >= data.totalPages ? 'disabled' : ''}>Next &rarr;</button>
    </div>` : ''}
  `;
}

// ── Page: State Detail ────────────────────────────────────────────

async function renderStateDetail(el, key) {
  el.innerHTML = '<div class="empty-state">Loading...</div>';

  const entry = await api(`/state/${encodeURIComponent(key)}`);
  if (!entry) { el.innerHTML = '<div class="empty-state">State key not found</div>'; return; }

  el.innerHTML = `
    <div class="page-title">State Entry</div>
    <div class="detail-grid">
      <div class="detail-row"><div class="detail-label">Key</div><div class="detail-value">${escapeHtml(entry.key)}</div></div>
      <div class="detail-row"><div class="detail-label">Version</div><div class="detail-value">${entry.version}</div></div>
      <div class="detail-row"><div class="detail-label">Updated By</div><div class="detail-value"><a class="link" href="#/address/${entry.updatedBy}">${entry.updatedBy}</a></div></div>
      <div class="detail-row"><div class="detail-label">Updated At</div><div class="detail-value text">${formatTime(entry.updatedAt)}</div></div>
      <div class="detail-row"><div class="detail-label">Block Height</div><div class="detail-value text"><a class="link" href="#/block/${entry.blockHeight}">Block #${entry.blockHeight}</a></div></div>
    </div>
    <div class="page-title" style="font-size:16px;margin-top:8px">Value</div>
    <div class="json-viewer">${jsonPretty(entry.value)}</div>
  `;
}

// ── Page: Contracts ───────────────────────────────────────────────

async function renderContracts(el) {
  el.innerHTML = '<div class="empty-state">Loading contracts...</div>';

  const data = await api('/contracts');
  if (!data) { el.innerHTML = '<div class="empty-state">Failed to load contracts</div>'; return; }

  const contracts = data.contracts || [];

  el.innerHTML = `
    <div class="page-title">Contracts</div>
    ${contracts.length === 0 ? '<div class="empty-state">No contracts deployed</div>' : `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Version</th><th>Deployed By</th><th>Deployed At</th></tr></thead>
      <tbody>
        ${contracts.map(c => `
          <tr class="clickable" onclick="navigate('#/contract/${encodeURIComponent(c.name)}')">
            <td><a class="link" href="#/contract/${encodeURIComponent(c.name)}">${escapeHtml(c.name)}</a></td>
            <td><span class="badge">${escapeHtml(c.version)}</span></td>
            <td class="mono dim"><a class="link" href="#/address/${c.deployedBy}">${shortHash(c.deployedBy)}</a></td>
            <td class="dim">${formatTime(c.deployedAt)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}
  `;
}

// ── Page: Contract Detail ─────────────────────────────────────────

async function renderContractDetail(el, name) {
  el.innerHTML = '<div class="empty-state">Loading contract...</div>';

  const entry = await api(`/state/_contract:${encodeURIComponent(name)}`);
  const codeEntry = await api(`/state/_contract_code:${encodeURIComponent(name)}`);

  if (!entry) { el.innerHTML = '<div class="empty-state">Contract not found</div>'; return; }

  const meta = entry.value;

  el.innerHTML = `
    <div class="page-title">Contract: ${escapeHtml(name)}</div>
    <div class="detail-grid">
      <div class="detail-row"><div class="detail-label">Name</div><div class="detail-value text">${escapeHtml(meta.name)}</div></div>
      <div class="detail-row"><div class="detail-label">Version</div><div class="detail-value text">${escapeHtml(meta.version)}</div></div>
      <div class="detail-row"><div class="detail-label">Deployed By</div><div class="detail-value"><a class="link" href="#/address/${meta.deployedBy}">${meta.deployedBy}</a></div></div>
      <div class="detail-row"><div class="detail-label">Deployed At</div><div class="detail-value text">${formatTime(meta.deployedAt)}</div></div>
    </div>

    ${codeEntry ? `
    <div class="page-title" style="font-size:16px;margin-top:8px">Contract Code</div>
    <div class="code-view">${escapeHtml(typeof codeEntry.value === 'string' ? codeEntry.value : JSON.stringify(codeEntry.value, null, 2))}</div>` : ''}
  `;
}

// ── Page: Governance ──────────────────────────────────────────────

async function renderGovernance(el) {
  el.innerHTML = '<div class="empty-state">Loading proposals...</div>';

  const data = await api('/proposals');
  if (!data) { el.innerHTML = '<div class="empty-state">Failed to load proposals</div>'; return; }

  const proposals = data.proposals || [];

  const statusBadge = (s) => {
    const map = { active: 'badge-green', approved: 'badge-cyan', rejected: 'badge-red', expired: 'badge-yellow' };
    return `<span class="badge ${map[s] || ''}">${s}</span>`;
  };

  el.innerHTML = `
    <div class="page-title">Governance</div>
    ${proposals.length === 0 ? '<div class="empty-state">No proposals yet</div>' : `
    <table class="data-table">
      <thead><tr><th>Title</th><th>Status</th><th>Votes</th><th>Proposer</th><th>Expires</th></tr></thead>
      <tbody>
        ${proposals.map(p => {
          const voteCount = p.votes ? Object.keys(p.votes).length : 0;
          const yesVotes = p.votes ? Object.values(p.votes).filter(v => v === true).length : 0;
          return `
          <tr class="clickable" onclick="navigate('#/proposal/${p.id}')">
            <td><a class="link" href="#/proposal/${p.id}">${escapeHtml(p.title)}</a></td>
            <td>${statusBadge(p.status)}</td>
            <td>${yesVotes}/${voteCount}</td>
            <td class="mono dim"><a class="link" href="#/address/${p.proposer}">${shortHash(p.proposer)}</a></td>
            <td class="dim">${formatTime(p.expiresAt)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`}
  `;
}

// ── Page: Proposal Detail ─────────────────────────────────────────

async function renderProposalDetail(el, id) {
  el.innerHTML = '<div class="empty-state">Loading proposal...</div>';

  const proposal = await api(`/proposals/${id}`);
  if (!proposal) { el.innerHTML = '<div class="empty-state">Proposal not found</div>'; return; }

  const votes = proposal.votes || {};
  const voters = Object.entries(votes);
  const yesVotes = voters.filter(([, v]) => v === true).length;
  const noVotes = voters.filter(([, v]) => v === false).length;
  const total = voters.length || 1;

  const statusBadge = (s) => {
    const map = { active: 'badge-green', approved: 'badge-cyan', rejected: 'badge-red', expired: 'badge-yellow' };
    return `<span class="badge ${map[s] || ''}">${s}</span>`;
  };

  el.innerHTML = `
    <div class="page-title">Proposal: ${escapeHtml(proposal.title)}</div>
    <div class="detail-grid">
      <div class="detail-row"><div class="detail-label">ID</div><div class="detail-value">${proposal.id}</div></div>
      <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value text">${statusBadge(proposal.status)}</div></div>
      <div class="detail-row"><div class="detail-label">Type</div><div class="detail-value text">${escapeHtml(proposal.type || '\u2014')}</div></div>
      <div class="detail-row"><div class="detail-label">Proposer</div><div class="detail-value"><a class="link" href="#/address/${proposal.proposer}">${proposal.proposer}</a></div></div>
      <div class="detail-row"><div class="detail-label">Description</div><div class="detail-value text">${escapeHtml(proposal.description || '\u2014')}</div></div>
      <div class="detail-row"><div class="detail-label">Created</div><div class="detail-value text">${formatTime(proposal.createdAt)}</div></div>
      <div class="detail-row"><div class="detail-label">Expires</div><div class="detail-value text">${formatTime(proposal.expiresAt)}</div></div>
    </div>

    <div class="page-title" style="font-size:16px;margin-top:8px">Vote Breakdown</div>
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:8px">
      <span class="badge badge-green">Yes: ${yesVotes}</span>
      <span class="badge badge-red">No: ${noVotes}</span>
    </div>
    <div class="vote-bar" style="width:100%;max-width:400px">
      <div class="yes" style="width:${(yesVotes / total) * 100}%"></div>
      <div class="no" style="width:${(noVotes / total) * 100}%"></div>
    </div>

    ${voters.length > 0 ? `
    <table class="data-table" style="margin-top:12px">
      <thead><tr><th>Voter</th><th>Vote</th></tr></thead>
      <tbody>
        ${voters.map(([voter, vote]) => `
          <tr>
            <td class="mono"><a class="link" href="#/address/${voter}">${shortHash(voter)}</a></td>
            <td>${vote ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-red">No</span>'}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state">No votes yet</div>'}

    ${proposal.action ? `
    <div class="page-title" style="font-size:16px;margin-top:20px">Action</div>
    <div class="json-viewer">${jsonPretty(proposal.action)}</div>` : ''}
  `;
}

// ── Page: Network ─────────────────────────────────────────────────

async function renderNetwork(el) {
  el.innerHTML = '<div class="empty-state">Loading network info...</div>';

  const [peers, consensus, identity, status] = await Promise.all([
    api('/peers'),
    api('/consensus'),
    api('/identity'),
    api('/status'),
  ]);

  const peerList = peers?.peers ?? [];

  el.innerHTML = `
    <div class="page-title">Network</div>

    <div class="detail-grid" style="margin-bottom:20px">
      <div class="detail-row"><div class="detail-label">Node ID</div><div class="detail-value">${status?.nodeId || '\u2014'}</div></div>
      <div class="detail-row"><div class="detail-label">Public Key</div><div class="detail-value">${identity?.publicKey || '\u2014'}</div></div>
      <div class="detail-row"><div class="detail-label">Protocol</div><div class="detail-value text">v${status?.version || '\u2014'}</div></div>
    </div>

    ${consensus?.state ? `
    <div class="page-title" style="font-size:16px">Consensus</div>
    <div class="detail-grid" style="margin-bottom:20px">
      <div class="detail-row"><div class="detail-label">Algorithm</div><div class="detail-value text">${consensus.algorithm}</div></div>
      <div class="detail-row"><div class="detail-label">Role</div><div class="detail-value text"><span class="badge ${consensus.state.role === 'leader' ? 'badge-green' : ''}">${consensus.state.role}</span></div></div>
      <div class="detail-row"><div class="detail-label">Term</div><div class="detail-value">${consensus.state.term ?? '\u2014'}</div></div>
      <div class="detail-row"><div class="detail-label">Leader</div><div class="detail-value text">${consensus.state.leaderId || 'none'}</div></div>
    </div>` : `
    <div class="detail-grid" style="margin-bottom:20px">
      <div class="detail-row"><div class="detail-label">Algorithm</div><div class="detail-value text">${consensus?.algorithm || 'solo'}</div></div>
    </div>`}

    <div class="page-title" style="font-size:16px">Peers (${peerList.length})</div>
    ${peerList.length === 0 ? '<div class="empty-state">No peers connected (solo mode)</div>' :
      peerList.map(p => `
        <div class="peer-card">
          <span class="dot ${p.status === 'connected' ? 'green' : 'red'}"></span>
          <div class="peer-info">
            <div class="peer-id">${p.nodeId}</div>
            <div class="peer-meta">${p.address || '\u2014'} &middot; ${p.orgId || '\u2014'}</div>
          </div>
          <div class="peer-height">H:${p.chainHeight}</div>
          <span class="badge ${p.status === 'connected' ? 'badge-green' : 'badge-red'}">${p.status}</span>
        </div>`).join('')}
  `;
}

// ── SQL Query ─────────────────────────────────────────────────────

async function runSqlQuery() {
  const input = document.getElementById('sql-input');
  if (!input) return;
  const sql = input.value.trim();
  if (!sql) return;

  const el = document.getElementById('query-results');
  el.innerHTML = '<div class="empty-state">Running...</div>';

  const data = await apiPost('/state/query', { sql });
  if (!data) { el.innerHTML = '<div class="empty-state" style="color:var(--red)">Query failed</div>'; return; }
  if (data.error) { el.innerHTML = `<div class="empty-state" style="color:var(--red)">${escapeHtml(data.error)}</div>`; return; }
  if (!data.results || data.results.length === 0) { el.innerHTML = '<div class="empty-state">No results</div>'; return; }

  const cols = Object.keys(data.results[0]);
  el.innerHTML = `
    <table class="result-table">
      <thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>${data.results.map(r =>
        '<tr>' + cols.map(c => `<td title="${escapeHtml(String(r[c] ?? ''))}">${escapeHtml(String(r[c] ?? ''))}</td>`).join('') + '</tr>'
      ).join('')}</tbody>
    </table>
  `;
}

// ── Search ────────────────────────────────────────────────────────

async function handleSearch(query) {
  if (!query) return;
  const data = await api(`/search?q=${encodeURIComponent(query)}`);
  if (!data || data.type === 'not_found') {
    const el = document.getElementById('app');
    el.innerHTML = `<div class="page-title">Search Results</div><div class="empty-state">No results found for "${escapeHtml(query)}"</div>`;
    currentRoute = '';
    return;
  }

  switch (data.type) {
    case 'block': navigate(`#/block/${data.height}`); break;
    case 'transaction': navigate(`#/tx/${data.hash}`); break;
    case 'address': navigate(`#/address/${data.pubkey}`); break;
    case 'state': navigate(`#/state/${encodeURIComponent(data.key)}`); break;
    case 'contract': navigate(`#/contract/${encodeURIComponent(data.name)}`); break;
    default:
      const el = document.getElementById('app');
      el.innerHTML = `<div class="page-title">Search Results</div><div class="empty-state">No results found for "${escapeHtml(query)}"</div>`;
      currentRoute = '';
  }
}

document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    handleSearch(e.target.value.trim());
    e.target.blur();
  }
});

// ── Status update (sidebar) ───────────────────────────────────────

async function updateTopBar() {
  const data = await api('/status');
  if (!data) {
    document.getElementById('status-dot').className = 'dot red';
    document.getElementById('status-text').textContent = 'Disconnected';
    return;
  }

  document.getElementById('status-dot').className = 'dot green';
  document.getElementById('status-text').textContent = 'Running';
  document.getElementById('node-id-short').textContent = data.nodeId;
  document.getElementById('tb-height').textContent = data.chainHeight;
  document.getElementById('tb-uptime').textContent = formatUptime(data.uptime);
}

// ── Init ──────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => {
  currentRoute = ''; // force re-render
  router();
});

// Make functions available to onclick handlers
window.navigate = (hash) => { window.location.hash = hash.replace('#', ''); };
window.renderBlocks = renderBlocks;
window.renderTransactions = renderTransactions;
window.renderState = renderState;
window.runSqlQuery = runSqlQuery;

// Initial load
updateTopBar();
router();

// Auto-refresh top bar every 3 seconds
refreshTimer = setInterval(updateTopBar, 3000);
