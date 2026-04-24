export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS blocks (
        height      INTEGER PRIMARY KEY,
        hash        TEXT UNIQUE NOT NULL,
        prev_hash   TEXT NOT NULL,
        timestamp   INTEGER NOT NULL,
        merkle_root TEXT NOT NULL,
        state_root  TEXT NOT NULL,
        proposer    TEXT NOT NULL,
        signature   TEXT NOT NULL DEFAULT '',
        raw         TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        hash         TEXT PRIMARY KEY,
        type         TEXT NOT NULL,
        sender       TEXT NOT NULL,
        nonce        INTEGER NOT NULL,
        timestamp    INTEGER NOT NULL,
        payload      TEXT NOT NULL,
        signature    TEXT NOT NULL DEFAULT '',
        block_height INTEGER REFERENCES blocks(height),
        position     INTEGER,
        status       TEXT NOT NULL DEFAULT 'confirmed'
      );

      CREATE TABLE IF NOT EXISTS world_state (
        key          TEXT PRIMARY KEY,
        value        TEXT NOT NULL,
        version      INTEGER NOT NULL DEFAULT 1,
        updated_at   INTEGER NOT NULL,
        updated_by   TEXT NOT NULL,
        block_height INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS peers (
        id         TEXT PRIMARY KEY,
        public_key TEXT UNIQUE NOT NULL,
        address    TEXT NOT NULL,
        org_id     TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'validator',
        added_at   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tx_pool (
        hash     TEXT PRIMARY KEY,
        raw      TEXT NOT NULL,
        received INTEGER NOT NULL,
        priority INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS nonces (
        sender TEXT PRIMARY KEY,
        nonce  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tx_sender ON transactions(sender);
      CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(block_height);
      CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_state_updated ON world_state(updated_at);
      CREATE INDEX IF NOT EXISTS idx_state_block ON world_state(block_height);
    `,
  },
];
