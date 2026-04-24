export { MiniLedgerNode, type CreateNodeOptions } from "./node.js";
export type {
  Block,
  Transaction,
  StateEntry,
  NodeStatus,
  NodeIdentity,
  PeerInfo,
  TxPayload,
  HexString,
} from "./types.js";
export { TxType } from "./types.js";
export { generateKeyPair, sign, verify, type KeyPair } from "./identity/index.js";
export { Chain } from "./core/chain.js";

// M3: Contracts
export { ContractRegistry, compileContract, executeContract, createContractContext } from "./contracts/index.js";
export type { ContractContext, ContractModule, ContractInstance } from "./contracts/index.js";
export { TRANSFER_CONTRACT, KV_STORE_CONTRACT } from "./contracts/index.js";

// M3: Privacy
export { createACL, canRead, canWrite, encryptForACL, decryptRecord } from "./privacy/index.js";
export type { ACLPolicy, EncryptedRecord } from "./privacy/index.js";

// M3: Governance
export { Governor, ProposalType, ProposalStatus } from "./governance/index.js";
export type { Proposal, GovernancePolicy } from "./governance/index.js";

// Convenience alias
export { MiniLedgerNode as MiniLedger } from "./node.js";
