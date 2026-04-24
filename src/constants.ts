export const PROTOCOL_VERSION = 1;
export const GENESIS_PREVIOUS_HASH = "0".repeat(64);
export const GENESIS_TIMESTAMP = 0;

export const DEFAULT_P2P_PORT = 4440;
export const DEFAULT_API_PORT = 4441;
export const DEFAULT_DATA_DIR = "./medchain-data";

export const MAX_TX_PER_BLOCK = 500;
export const BLOCK_TIME_MS = 1000;
export const MAX_TX_SIZE_BYTES = 1024 * 256; // 256KB
export const MAX_BLOCK_SIZE_BYTES = 1024 * 1024 * 10; // 10MB

export const EMPTY_MERKLE_ROOT = "0".repeat(64);

// Fixed genesis proposer key so all nodes produce identical genesis blocks
export const GENESIS_PROPOSER = "0".repeat(64);

export const NONCE_TABLE = "_miniledger_nonces";
export const META_TABLE = "_miniledger_meta";
