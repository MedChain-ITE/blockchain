import * as path from "node:path";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import pino from "pino";
import type { Block, Transaction, NodeStatus, StateEntry, TxType } from "./types.js";
import { TxType as TxTypeEnum } from "./types.js";
import { PROTOCOL_VERSION, GENESIS_PROPOSER } from "./constants.js";
import { Chain, createTransaction, validateTransaction } from "./core/index.js";
import { MiniLedgerDB, BlockStore, StateStore, TxStore } from "./storage/index.js";
import {
  generateKeyPair,
  sign,
  verify,
  serializeKeystore,
  deserializeKeystore,
  encryptKeystore,
  decryptKeystore,
  type KeyPair,
} from "./identity/index.js";
import { type MiniLedgerConfig, loadConfig } from "./config/index.js";
import { PeerManager } from "./network/peer-manager.js";
import { BlockSync } from "./network/sync.js";
import {
  MessageType,
  createMessage,
  type BlockAnnouncePayload,
  type TxBroadcastPayload,
} from "./network/protocol.js";
import { RaftNode } from "./consensus/raft/raft-node.js";
import { shortId } from "./utils.js";
import { ContractRegistry, createContractContext } from "./contracts/index.js";
import { Governor } from "./governance/governor.js";
import { ProposalType } from "./governance/proposal.js";

// Events: block:created, block:received, tx:submitted, tx:confirmed, started, stopped, error

export interface CreateNodeOptions {
  dataDir?: string;
  config?: Partial<MiniLedgerConfig>;
}

export class MiniLedgerNode extends EventEmitter {
  readonly config: MiniLedgerConfig;
  readonly log: pino.Logger;

  private db!: MiniLedgerDB;
  private blockStore!: BlockStore;
  private stateStore!: StateStore;
  private txStore!: TxStore;
  private chain!: Chain;
  private keyPair!: KeyPair;
  private nodeId!: string;

  // Solo mode timer
  private blockTimer: ReturnType<typeof setInterval> | null = null;

  // Networking (M2)
  private peerManager: PeerManager | null = null;
  private blockSync: BlockSync | null = null;
  private raft: RaftNode | null = null;
  private raftBlockTimer: ReturnType<typeof setInterval> | null = null;

  // M3: Contracts + Governance
  private contractRegistry!: ContractRegistry;
  private governor!: Governor;

  private startedAt = 0;
  private running = false;

  constructor(config: MiniLedgerConfig) {
    super();
    this.config = config;
    this.log = pino({
      level: config.logging.level,
      transport: {
        target: "pino/file",
        options: { destination: 1 }, // stdout
      },
    });
  }

  /** Create a new MiniLedgerNode with optional overrides. */
  static async create(options: CreateNodeOptions = {}): Promise<MiniLedgerNode> {
    const config = loadConfig({
      dataDir: options.dataDir,
      ...options.config,
    });
    const node = new MiniLedgerNode(config);
    return node;
  }

  /** Initialize the node: open DB, load or create identity, restore chain. */
  async init(): Promise<void> {
    // Ensure data directory exists
    fs.mkdirSync(this.config.dataDir, { recursive: true });

    // Open database
    const dbPath = path.join(this.config.dataDir, "ledger.db");
    this.db = new MiniLedgerDB(dbPath);
    this.db.migrate();

    this.blockStore = new BlockStore(this.db.raw());
    this.stateStore = new StateStore(this.db.raw());
    this.txStore = new TxStore(this.db.raw());
    this.contractRegistry = new ContractRegistry(this.stateStore);
    this.governor = new Governor(this.stateStore);

    // Load or create keypair
    const keystorePath = path.join(this.config.dataDir, "keystore.json");
    if (fs.existsSync(keystorePath)) {
      const data = fs.readFileSync(keystorePath, "utf-8");
      const ks = deserializeKeystore(data);
      this.keyPair = decryptKeystore(ks, "");
    } else {
      this.keyPair = generateKeyPair();
      const ks = encryptKeystore(
        this.keyPair,
        "",
        this.config.node.orgId,
        this.config.node.name,
      );
      fs.writeFileSync(keystorePath, serializeKeystore(ks));
    }

    this.nodeId = shortId(this.keyPair.publicKey);

    // Initialize chain
    this.chain = new Chain();
    const latestBlock = this.blockStore.getLatest();
    if (latestBlock) {
      this.chain.init(latestBlock);
      this.log.info({ height: latestBlock.height }, "Restored chain from storage");
    } else {
      // Create genesis block
      const genesis = this.chain.createGenesis(GENESIS_PROPOSER);
      this.db.raw().transaction(() => {
        this.blockStore.insert(genesis);
      })();
      this.log.info("Created genesis block");
    }
  }

  /** Start the node: begin producing blocks and serving API. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();

    if (this.config.consensus.algorithm === "solo") {
      // Solo mode: simple block production timer
      this.blockTimer = setInterval(() => {
        this.produceBlock().catch((err) => {
          this.log.error({ err }, "Block production error");
          this.emit("error", err as Error);
        });
      }, this.config.consensus.blockTimeMs);
    } else if (this.config.consensus.algorithm === "raft") {
      // Raft mode: set up P2P + consensus
      await this.startNetworking();
      this.startRaftConsensus();
    }

    this.log.info(
      {
        nodeId: this.nodeId,
        consensus: this.config.consensus.algorithm,
        apiPort: this.config.api.enabled ? this.config.network.apiPort : "disabled",
        p2pPort: this.config.consensus.algorithm === "raft" ? this.config.network.p2pPort : "disabled",
      },
      "Node started",
    );
    this.emit("started");
  }

  /** Stop the node. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.blockTimer) {
      clearInterval(this.blockTimer);
      this.blockTimer = null;
    }

    if (this.raftBlockTimer) {
      clearInterval(this.raftBlockTimer);
      this.raftBlockTimer = null;
    }

    if (this.raft) {
      this.raft.stop();
      this.raft = null;
    }

    if (this.peerManager) {
      this.peerManager.stop();
      this.peerManager = null;
    }

    this.blockSync = null;

    this.db.close();
    this.log.info("Node stopped");
    this.emit("stopped");
  }

  // ── Networking ──────────────────────────────────────────────────

  private async startNetworking(): Promise<void> {
    this.peerManager = new PeerManager({
      nodeId: this.nodeId,
      publicKey: this.keyPair.publicKey,
      orgId: this.config.node.orgId,
      p2pPort: this.config.network.p2pPort,
      listenAddress: this.config.network.listenAddress,
      log: this.log,
      getChainHeight: () => this.chain.getHeight(),
    });

    // Set up block announce handler
    this.peerManager.router.on(MessageType.BlockAnnounce, (msg) => {
      const payload = msg.payload as BlockAnnouncePayload;
      this.handleBlockAnnounce(payload.block);
    });

    // Set up tx broadcast handler
    this.peerManager.router.on(MessageType.TxBroadcast, (msg) => {
      const payload = msg.payload as TxBroadcastPayload;
      this.handleTxBroadcast(payload.transaction);
    });

    // Set up peer events
    this.peerManager.on("peer:connected", (peerId: string) => {
      this.log.info({ peerId }, "Peer connected");
      // Trigger sync if the new peer might have blocks we don't
      if (this.blockSync) {
        this.blockSync.syncFromPeers().catch((err) => {
          this.log.warn({ err }, "Sync after peer connect failed");
        });
      }
    });

    // Set up block sync
    this.blockSync = new BlockSync({
      nodeId: this.nodeId,
      log: this.log,
      peerManager: this.peerManager,
      getChainHeight: () => this.chain.getHeight(),
      getBlocks: (from, to) => this.blockStore.getRange(from, to),
      applyBlock: (block) => this.applyReceivedBlock(block),
    });

    await this.peerManager.start();

    // Connect to initial peers
    for (const addr of this.config.network.peers) {
      this.peerManager.connectTo(addr);
    }
  }

  private startRaftConsensus(): void {
    if (!this.peerManager) return;

    this.raft = new RaftNode({
      nodeId: this.nodeId,
      peerManager: this.peerManager,
      log: this.log,
      blockTimeMs: this.config.consensus.blockTimeMs,
    });

    // When raft commits a block, apply it
    this.raft.onBlockCommitted = (block: Block) => {
      this.applyReceivedBlock(block);
    };

    // When raft receives a forwarded tx, add to pending pool
    this.raft.onTransactionReceived = (tx: Transaction) => {
      this.txStore.addToPending(tx);
    };

    // When we become leader, start block production
    this.raft.on("leader", () => {
      this.log.info("This node is now the Raft leader — starting block production");
      if (this.raftBlockTimer) clearInterval(this.raftBlockTimer);
      this.raftBlockTimer = setInterval(() => {
        this.produceRaftBlock().catch((err) => {
          this.log.error({ err }, "Raft block production error");
        });
      }, this.config.consensus.blockTimeMs);
    });

    this.raft.start();
  }

  // ── Block handling ──────────────────────────────────────────────

  private handleBlockAnnounce(block: Block): void {
    // In Raft mode, blocks come through consensus, not direct announce
    // This handler is for future non-Raft modes
    if (this.config.consensus.algorithm !== "raft") {
      this.applyReceivedBlock(block);
    }
  }

  private handleTxBroadcast(tx: Transaction): void {
    // Don't re-add if we already have it
    const existing = this.txStore.getByHash(tx.hash);
    if (existing) return;

    // Validate
    try {
      validateTransaction(tx);
      if (!verify(tx.hash, tx.signature, tx.sender)) return;
    } catch {
      return;
    }

    this.txStore.addToPending(tx);
  }

  /** Apply a block received from network/consensus. */
  private applyReceivedBlock(block: Block): void {
    try {
      // Apply transactions to state
      this.db.raw().transaction(() => {
        for (const tx of block.transactions) {
          this.applyTransaction(tx, block.height);
        }

        this.chain.appendBlock(block);
        this.blockStore.insert(block);

        // Remove confirmed tx from pending pool
        this.txStore.removePending(block.transactions.map((tx) => tx.hash));
        for (const tx of block.transactions) {
          this.txStore.updateNonce(tx.sender, tx.nonce);
        }
      })();

      this.log.info({ height: block.height, txCount: block.transactions.length }, "Block applied");
      this.emit("block:received", block);
    } catch (err) {
      this.log.warn({ err, height: block.height }, "Failed to apply received block");
    }
  }

  // ── Transaction submission ──────────────────────────────────────

  /** Submit a transaction to the node. */
  async submit(params: {
    type?: TxType;
    key?: string;
    value?: unknown;
    payload?: Transaction["payload"];
  }): Promise<Transaction> {
    const sender = this.keyPair.publicKey;
    const nonce = this.txStore.getNextNonce(sender);

    let payload: Transaction["payload"];
    if (params.payload) {
      payload = params.payload;
    } else if (params.key !== undefined) {
      if (params.value === undefined || params.value === null) {
        payload = { kind: "state:delete", key: params.key };
      } else {
        payload = { kind: "state:set", key: params.key, value: params.value };
      }
    } else {
      throw new Error("Either payload or key must be provided");
    }

    const txType = params.type ?? (payload.kind === "state:delete" ? TxTypeEnum.StateDelete : TxTypeEnum.StateSet);

    const unsignedTx = createTransaction({
      type: txType,
      sender,
      nonce,
      payload,
    });

    // Sign
    const signature = sign(unsignedTx.hash, this.keyPair.privateKey);
    const tx: Transaction = { ...unsignedTx, signature };

    // Validate
    validateTransaction(tx);

    // Verify signature
    if (!verify(tx.hash, tx.signature, tx.sender)) {
      throw new Error("Transaction signature verification failed");
    }

    // Add to pending pool
    this.txStore.addToPending(tx);

    // In Raft mode, if we're not the leader, forward to leader
    if (this.raft && !this.raft.isLeader()) {
      this.raft.forwardToLeader(tx);
    }

    // Broadcast to peers
    if (this.peerManager) {
      this.peerManager.broadcast(
        createMessage(MessageType.TxBroadcast, this.nodeId, { transaction: tx } as TxBroadcastPayload),
      );
    }

    this.emit("tx:submitted", tx);
    this.log.debug({ hash: tx.hash, type: tx.type }, "Transaction submitted");

    return tx;
  }

  // ── Block production ────────────────────────────────────────────

  /** Produce a block in solo mode. */
  private async produceBlock(): Promise<Block | null> {
    const pending = this.txStore.getPending(this.config.consensus.maxTxPerBlock);

    const applied: Transaction[] = [];
    this.db.raw().transaction(() => {
      for (const tx of pending) {
        try {
          this.applyTransaction(tx, this.chain.getHeight() + 1);
          applied.push(tx);
        } catch (err) {
          this.log.warn({ hash: tx.hash, err }, "Failed to apply transaction");
        }
      }

      if (applied.length === 0) return;

      const stateRoot = this.stateStore.computeStateRoot();
      const block = this.chain.proposeBlock(applied, this.keyPair.publicKey, stateRoot);
      const signature = sign(block.hash, this.keyPair.privateKey);
      const signedBlock: Block = { ...block, signature };

      this.chain.appendBlock(signedBlock);
      this.blockStore.insert(signedBlock);
      this.txStore.removePending(applied.map((tx) => tx.hash));

      for (const tx of applied) {
        this.txStore.updateNonce(tx.sender, tx.nonce);
      }

      this.log.info({ height: signedBlock.height, txCount: applied.length }, "Block produced");
      this.emit("block:created", signedBlock);
    })();

    return this.chain.getTip();
  }

  /** Produce a block as Raft leader — propose it through consensus. */
  private async produceRaftBlock(): Promise<void> {
    if (!this.raft || !this.raft.isLeader()) return;

    const pending = this.txStore.getPending(this.config.consensus.maxTxPerBlock);
    if (pending.length === 0) return;

    // Build the block
    const stateRoot = this.stateStore.computeStateRoot();
    const block = this.chain.proposeBlock(pending, this.keyPair.publicKey, stateRoot);
    const signature = sign(block.hash, this.keyPair.privateKey);
    const signedBlock: Block = { ...block, signature };

    // Propose through Raft — will be applied when committed via onBlockCommitted callback
    this.raft.proposeBlock(signedBlock);
  }

  // ── State application ───────────────────────────────────────────

  /** Apply a single transaction to the world state. */
  private applyTransaction(tx: Transaction, blockHeight: number): void {
    const { payload } = tx;

    switch (payload.kind) {
      case "state:set":
        this.stateStore.set(payload.key, payload.value, tx.sender, blockHeight);
        break;
      case "state:delete":
        this.stateStore.delete(payload.key);
        break;
      case "contract:deploy":
        this.contractRegistry.deploy(
          payload.name,
          payload.version,
          payload.code,
          tx.sender,
          blockHeight,
        );
        this.log.info({ contract: payload.name, version: payload.version }, "Contract deployed");
        break;
      case "contract:invoke": {
        const ctx = createContractContext({
          stateStore: this.stateStore,
          sender: tx.sender,
          blockHeight,
          timestamp: tx.timestamp,
        });
        this.contractRegistry.invoke(payload.contract, payload.method, ctx, payload.args);
        break;
      }
      case "governance:propose":
        this.governor.propose({
          type: (payload.action?.type as ProposalType) ?? ProposalType.Custom,
          title: payload.title,
          description: payload.description,
          proposer: tx.sender,
          action: payload.action,
          blockHeight,
        });
        this.log.info({ title: payload.title }, "Proposal created");
        break;
      case "governance:vote":
        this.governor.vote(payload.proposalId, tx.sender, payload.vote, blockHeight);
        break;
      default:
        this.log.warn({ type: tx.type }, "Unhandled transaction type");
    }
  }

  // ── Queries ─────────────────────────────────────────────────────

  async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    return this.stateStore.query(sql, params);
  }

  async getState(key: string): Promise<StateEntry | null> {
    return this.stateStore.get(key);
  }

  async getBlock(height: number): Promise<Block | null> {
    return this.blockStore.getByHeight(height);
  }

  async getLatestBlock(): Promise<Block | null> {
    return this.blockStore.getLatest();
  }

  async getTransaction(hash: string): Promise<Transaction | null> {
    return this.txStore.getByHash(hash);
  }

  getStatus(): NodeStatus {
    const tip = this.chain.getTip();
    return {
      nodeId: this.nodeId,
      publicKey: this.keyPair.publicKey,
      chainHeight: this.chain.getHeight(),
      latestBlockHash: tip?.hash ?? "",
      peerCount: this.peerManager?.getPeerCount() ?? 0,
      txPoolSize: this.txStore.pendingCount(),
      uptime: this.running ? Date.now() - this.startedAt : 0,
      version: PROTOCOL_VERSION,
    };
  }

  getPublicKey(): string {
    return this.keyPair.publicKey;
  }

  getNodeId(): string {
    return this.nodeId;
  }

  getStores() {
    return {
      blocks: this.blockStore,
      state: this.stateStore,
      txs: this.txStore,
    };
  }

  getDatabase() {
    return this.db;
  }

  getPeerManager(): PeerManager | null {
    return this.peerManager;
  }

  getRaft(): RaftNode | null {
    return this.raft;
  }

  getContractRegistry(): ContractRegistry {
    return this.contractRegistry;
  }

  getGovernor(): Governor {
    return this.governor;
  }

  isRunning(): boolean {
    return this.running;
  }
}
