import type { Block, Transaction } from "../types.js";

export enum RaftRole {
  Follower = "follower",
  Candidate = "candidate",
  Leader = "leader",
}

export interface ConsensusState {
  role: RaftRole;
  term: number;
  leaderId: string | null;
  votedFor: string | null;
  commitIndex: number;
}

/**
 * Interface that consensus implementations must satisfy.
 * The node orchestrator interacts with consensus through this interface.
 */
export interface IConsensus {
  /** Start the consensus engine. */
  start(): void;
  /** Stop the consensus engine. */
  stop(): void;
  /** Check if this node is the current leader. */
  isLeader(): boolean;
  /** Get the current leader's node ID (if known). */
  getLeaderId(): string | null;
  /** Get current consensus state for status reporting. */
  getState(): ConsensusState;
  /** Propose a block with pending transactions. Called by the node when it's time to produce a block. */
  proposeBlock(block: Block): void;
  /** Handle a received block from consensus (called when a committed entry needs to be applied). */
  onBlockCommitted: ((block: Block) => void) | null;
  /** Handle transaction received — if leader, include in next block; if follower, forward to leader. */
  onTransactionReceived: ((tx: Transaction) => void) | null;
}
