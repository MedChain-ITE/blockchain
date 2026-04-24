export type HexString = string;

export enum TxType {
  StateSet = "state:set",
  StateDelete = "state:delete",
  ContractDeploy = "contract:deploy",
  ContractInvoke = "contract:invoke",
  GovernancePropose = "governance:propose",
  GovernanceVote = "governance:vote",
}

export interface StateSetPayload {
  kind: "state:set";
  key: string;
  value: unknown;
}

export interface StateDeletePayload {
  kind: "state:delete";
  key: string;
}

export interface ContractDeployPayload {
  kind: "contract:deploy";
  name: string;
  version: string;
  code: string;
}

export interface ContractInvokePayload {
  kind: "contract:invoke";
  contract: string;
  method: string;
  args: unknown[];
}

export interface GovernanceProposePayload {
  kind: "governance:propose";
  title: string;
  description: string;
  action: Record<string, unknown>;
}

export interface GovernanceVotePayload {
  kind: "governance:vote";
  proposalId: string;
  vote: boolean;
}

export type TxPayload =
  | StateSetPayload
  | StateDeletePayload
  | ContractDeployPayload
  | ContractInvokePayload
  | GovernanceProposePayload
  | GovernanceVotePayload;

export interface Transaction {
  hash: HexString;
  type: TxType;
  sender: HexString;
  nonce: number;
  timestamp: number;
  payload: TxPayload;
  signature: HexString;
}

export interface Block {
  height: number;
  hash: HexString;
  previousHash: HexString;
  timestamp: number;
  merkleRoot: HexString;
  stateRoot: HexString;
  proposer: HexString;
  signature: HexString;
  transactions: Transaction[];
}

export interface StateEntry {
  key: string;
  value: unknown;
  version: number;
  updatedAt: number;
  updatedBy: HexString;
  blockHeight: number;
}

export interface PeerInfo {
  id: string;
  publicKey: HexString;
  address: string;
  orgId: string;
  role: "validator" | "observer";
  status: "connected" | "disconnected" | "syncing";
  lastSeen: number;
  chainHeight: number;
}

export interface NodeIdentity {
  publicKey: HexString;
  nodeId: string;
  orgId: string;
  name: string;
  role: "admin" | "member" | "observer";
  createdAt: number;
}

export interface NodeStatus {
  nodeId: string;
  publicKey: HexString;
  chainHeight: number;
  latestBlockHash: HexString;
  peerCount: number;
  txPoolSize: number;
  uptime: number;
  version: number;
}
