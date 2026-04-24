import {
  DEFAULT_API_PORT,
  DEFAULT_DATA_DIR,
  DEFAULT_P2P_PORT,
  BLOCK_TIME_MS,
  MAX_TX_PER_BLOCK,
} from "../constants.js";

export interface MiniLedgerConfig {
  dataDir: string;
  node: {
    name: string;
    orgId: string;
    role: "validator" | "observer";
  };
  network: {
    listenAddress: string;
    p2pPort: number;
    apiPort: number;
    peers: string[];
    maxPeers: number;
  };
  consensus: {
    algorithm: "raft" | "solo";
    blockTimeMs: number;
    maxTxPerBlock: number;
  };
  api: {
    enabled: boolean;
    cors: boolean;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}

export const DEFAULT_CONFIG: MiniLedgerConfig = {
  dataDir: DEFAULT_DATA_DIR,
  node: {
    name: "node-1",
    orgId: "org-1",
    role: "validator",
  },
  network: {
    listenAddress: "0.0.0.0",
    p2pPort: DEFAULT_P2P_PORT,
    apiPort: DEFAULT_API_PORT,
    peers: [],
    maxPeers: 50,
  },
  consensus: {
    algorithm: "solo",
    blockTimeMs: BLOCK_TIME_MS,
    maxTxPerBlock: MAX_TX_PER_BLOCK,
  },
  api: {
    enabled: true,
    cors: true,
  },
  logging: {
    level: "info",
  },
};
