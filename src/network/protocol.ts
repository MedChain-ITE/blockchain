import type { Block, Transaction, HexString } from "../types.js";
import { PROTOCOL_VERSION } from "../constants.js";

// ── Message types ──────────────────────────────────────────────────

export enum MessageType {
  // Handshake
  Handshake = "HANDSHAKE",
  HandshakeAck = "HANDSHAKE_ACK",

  // Block propagation
  BlockAnnounce = "BLOCK_ANNOUNCE",
  BlockRequest = "BLOCK_REQUEST",
  BlockResponse = "BLOCK_RESPONSE",

  // Transaction propagation
  TxBroadcast = "TX_BROADCAST",
  TxForward = "TX_FORWARD", // Forward tx to leader

  // Consensus (Raft)
  ConsensusRequestVote = "CONSENSUS_REQUEST_VOTE",
  ConsensusRequestVoteReply = "CONSENSUS_REQUEST_VOTE_REPLY",
  ConsensusAppendEntries = "CONSENSUS_APPEND_ENTRIES",
  ConsensusAppendEntriesReply = "CONSENSUS_APPEND_ENTRIES_REPLY",

  // Sync
  SyncRequest = "SYNC_REQUEST",
  SyncResponse = "SYNC_RESPONSE",

  // Peer management
  PeerList = "PEER_LIST",

  // Heartbeat
  Ping = "PING",
  Pong = "PONG",
}

// ── Message envelope ───────────────────────────────────────────────

export interface MessageEnvelope<T = unknown> {
  version: number;
  type: MessageType;
  from: string; // sender nodeId (short 16-char)
  timestamp: number;
  payload: T;
}

export function createMessage<T>(type: MessageType, from: string, payload: T): MessageEnvelope<T> {
  return {
    version: PROTOCOL_VERSION,
    type,
    from,
    timestamp: Date.now(),
    payload,
  };
}

export function serializeMessage(msg: MessageEnvelope): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(data: string): MessageEnvelope {
  const msg = JSON.parse(data) as MessageEnvelope;
  if (!msg.type || !msg.from || msg.version === undefined) {
    throw new Error("Invalid message format");
  }
  return msg;
}

// ── Payload types ──────────────────────────────────────────────────

export interface HandshakePayload {
  nodeId: string;
  publicKey: HexString;
  orgId: string;
  chainHeight: number;
  listenPort: number;
  listenAddress?: string;
}

export interface HandshakeAckPayload {
  nodeId: string;
  publicKey: HexString;
  orgId: string;
  chainHeight: number;
  accepted: boolean;
  reason?: string;
}

export interface BlockAnnouncePayload {
  block: Block;
}

export interface BlockRequestPayload {
  fromHeight: number;
  toHeight: number;
}

export interface BlockResponsePayload {
  blocks: Block[];
}

export interface TxBroadcastPayload {
  transaction: Transaction;
}

export interface TxForwardPayload {
  transaction: Transaction;
}

export interface SyncRequestPayload {
  fromHeight: number;
  toHeight: number;
}

export interface SyncResponsePayload {
  blocks: Block[];
  hasMore: boolean;
}

export interface PeerListPayload {
  peers: {
    nodeId: string;
    publicKey: HexString;
    address: string;
    orgId: string;
  }[];
}

export interface PingPayload {
  chainHeight: number;
}

export interface PongPayload {
  chainHeight: number;
}

// ── Raft consensus payloads ────────────────────────────────────────

export interface RequestVotePayload {
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface RequestVoteReplyPayload {
  term: number;
  voteGranted: boolean;
}

export interface AppendEntriesPayload {
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: RaftLogEntry[];
  leaderCommit: number;
}

export interface AppendEntriesReplyPayload {
  term: number;
  success: boolean;
  matchIndex: number;
}

export interface RaftLogEntry {
  term: number;
  index: number;
  block: Block;
}
