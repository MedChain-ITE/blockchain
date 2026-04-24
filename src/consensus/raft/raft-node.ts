import type pino from "pino";
import { EventEmitter } from "node:events";
import type { Block, Transaction } from "../../types.js";
import { RaftRole, type ConsensusState, type IConsensus } from "../types.js";
import { RaftTimer } from "./raft-timer.js";
import { RaftLog } from "./raft-log.js";
import type { PeerManager } from "../../network/peer-manager.js";
import {
  MessageType,
  createMessage,
  type MessageEnvelope,
  type RequestVotePayload,
  type RequestVoteReplyPayload,
  type AppendEntriesPayload,
  type AppendEntriesReplyPayload,
  type RaftLogEntry,
  type TxForwardPayload,
} from "../../network/protocol.js";

export interface RaftNodeOptions {
  nodeId: string;
  peerManager: PeerManager;
  log: pino.Logger;
  blockTimeMs: number;
}

/**
 * Raft consensus implementation.
 *
 * Key simplification: Raft log entries ARE block proposals.
 * A committed entry directly becomes a finalized block.
 */
export class RaftNode extends EventEmitter implements IConsensus {
  private opts: RaftNodeOptions;

  // Raft state
  private role: RaftRole = RaftRole.Follower;
  private currentTerm = 0;
  private votedFor: string | null = null;
  private leaderId: string | null = null;
  private raftLog = new RaftLog();
  private commitIndex = 0;
  private lastApplied = 0;

  // Leader state
  private nextIndex = new Map<string, number>();  // peer -> next log index to send
  private matchIndex = new Map<string, number>(); // peer -> highest replicated log index

  // Components
  private timer: RaftTimer;
  private blockProposalTimer: ReturnType<typeof setInterval> | null = null;

  // Callbacks set by the node orchestrator
  onBlockCommitted: ((block: Block) => void) | null = null;
  onTransactionReceived: ((tx: Transaction) => void) | null = null;

  constructor(opts: RaftNodeOptions) {
    super();
    this.opts = opts;

    this.timer = new RaftTimer({
      onElectionTimeout: () => this.startElection(),
      onHeartbeat: () => this.sendHeartbeats(),
    });

    // Register consensus message handlers
    const router = opts.peerManager.router;
    router.on(MessageType.ConsensusRequestVote, (msg) => this.handleRequestVote(msg));
    router.on(MessageType.ConsensusRequestVoteReply, (msg) => this.handleRequestVoteReply(msg));
    router.on(MessageType.ConsensusAppendEntries, (msg) => this.handleAppendEntries(msg));
    router.on(MessageType.ConsensusAppendEntriesReply, (msg) => this.handleAppendEntriesReply(msg));
    router.on(MessageType.TxForward, (msg, _peer) => {
      const payload = msg.payload as TxForwardPayload;
      if (this.role === RaftRole.Leader && this.onTransactionReceived) {
        this.onTransactionReceived(payload.transaction);
      }
    });
  }

  start(): void {
    this.role = RaftRole.Follower;
    this.timer.resetElectionTimer();
    this.opts.log.info({ nodeId: this.opts.nodeId }, "Raft started as follower");
  }

  stop(): void {
    this.timer.stopAll();
    if (this.blockProposalTimer) {
      clearInterval(this.blockProposalTimer);
      this.blockProposalTimer = null;
    }
  }

  isLeader(): boolean {
    return this.role === RaftRole.Leader;
  }

  getLeaderId(): string | null {
    return this.leaderId;
  }

  getState(): ConsensusState {
    return {
      role: this.role,
      term: this.currentTerm,
      leaderId: this.leaderId,
      votedFor: this.votedFor,
      commitIndex: this.commitIndex,
    };
  }

  /** Called by the node to propose a block (only works when leader). */
  proposeBlock(block: Block): void {
    if (this.role !== RaftRole.Leader) return;

    const entry: RaftLogEntry = {
      term: this.currentTerm,
      index: this.raftLog.getLastIndex() + 1,
      block,
    };

    this.raftLog.append(entry);

    // Update own matchIndex
    this.matchIndex.set(this.opts.nodeId, entry.index);

    // Replicate to peers immediately
    this.sendHeartbeats();

    // Check if we can commit (single-node cluster commits immediately)
    this.advanceCommitIndex();
  }

  /** Forward a transaction to the current leader. */
  forwardToLeader(tx: Transaction): void {
    if (this.leaderId && this.leaderId !== this.opts.nodeId) {
      const payload: TxForwardPayload = { transaction: tx };
      this.opts.peerManager.sendTo(
        this.leaderId,
        createMessage(MessageType.TxForward, this.opts.nodeId, payload),
      );
    }
  }

  // ── Election ────────────────────────────────────────────────────

  private startElection(): void {
    this.currentTerm++;
    this.role = RaftRole.Candidate;
    this.votedFor = this.opts.nodeId;
    this.leaderId = null;

    const peers = this.opts.peerManager.getKnownNodeIds();
    const totalVoters = peers.length + 1; // +1 for self
    let votesReceived = 1; // Vote for self

    this.opts.log.info({ term: this.currentTerm, voters: totalVoters }, "Starting election");

    // Single-node: win immediately
    if (totalVoters === 1) {
      this.becomeLeader();
      return;
    }

    // Store vote handler so we can track votes for this term
    const electionTerm = this.currentTerm;

    // Override the RequestVoteReply handler for this election
    this._voteCallback = (granted: boolean) => {
      if (this.currentTerm !== electionTerm || this.role !== RaftRole.Candidate) return;
      if (granted) votesReceived++;
      const majority = Math.floor(totalVoters / 2) + 1;
      if (votesReceived >= majority) {
        this.becomeLeader();
      }
    };

    // Send RequestVote to all peers
    const payload: RequestVotePayload = {
      term: this.currentTerm,
      candidateId: this.opts.nodeId,
      lastLogIndex: this.raftLog.getLastIndex(),
      lastLogTerm: this.raftLog.getLastTerm(),
    };

    for (const peerId of peers) {
      this.opts.peerManager.sendTo(
        peerId,
        createMessage(MessageType.ConsensusRequestVote, this.opts.nodeId, payload),
      );
    }

    // Reset election timer for next election if this one fails
    this.timer.resetElectionTimer();
  }

  private _voteCallback: ((granted: boolean) => void) | null = null;

  private becomeLeader(): void {
    this.role = RaftRole.Leader;
    this.leaderId = this.opts.nodeId;
    this.timer.stopElectionTimer();
    this.timer.startHeartbeatTimer();

    // Initialize leader state
    const nextIdx = this.raftLog.getLastIndex() + 1;
    const peers = this.opts.peerManager.getKnownNodeIds();
    for (const peerId of peers) {
      this.nextIndex.set(peerId, nextIdx);
      this.matchIndex.set(peerId, 0);
    }
    this.matchIndex.set(this.opts.nodeId, this.raftLog.getLastIndex());

    this.opts.log.info({ term: this.currentTerm }, "Became leader");
    this.emit("leader");

    // Send initial heartbeat immediately
    this.sendHeartbeats();
  }

  private stepDown(newTerm: number): void {
    this.currentTerm = newTerm;
    this.role = RaftRole.Follower;
    this.votedFor = null;
    this.timer.stopHeartbeatTimer();
    if (this.blockProposalTimer) {
      clearInterval(this.blockProposalTimer);
      this.blockProposalTimer = null;
    }
    this.timer.resetElectionTimer();
  }

  // ── RequestVote ─────────────────────────────────────────────────

  private handleRequestVote(msg: MessageEnvelope): void {
    const payload = msg.payload as RequestVotePayload;
    let voteGranted = false;

    // If the request has a higher term, step down
    if (payload.term > this.currentTerm) {
      this.stepDown(payload.term);
    }

    // Grant vote if: same term, haven't voted or voted for this candidate,
    // and candidate's log is at least as up-to-date as ours
    if (
      payload.term === this.currentTerm &&
      (this.votedFor === null || this.votedFor === payload.candidateId) &&
      this.isLogUpToDate(payload.lastLogIndex, payload.lastLogTerm)
    ) {
      voteGranted = true;
      this.votedFor = payload.candidateId;
      this.timer.resetElectionTimer();
    }

    const reply: RequestVoteReplyPayload = {
      term: this.currentTerm,
      voteGranted,
    };

    this.opts.peerManager.sendTo(
      msg.from,
      createMessage(MessageType.ConsensusRequestVoteReply, this.opts.nodeId, reply),
    );
  }

  private handleRequestVoteReply(msg: MessageEnvelope): void {
    const payload = msg.payload as RequestVoteReplyPayload;

    if (payload.term > this.currentTerm) {
      this.stepDown(payload.term);
      return;
    }

    if (this._voteCallback) {
      this._voteCallback(payload.voteGranted);
    }
  }

  private isLogUpToDate(lastLogIndex: number, lastLogTerm: number): boolean {
    const myLastTerm = this.raftLog.getLastTerm();
    const myLastIndex = this.raftLog.getLastIndex();

    if (lastLogTerm !== myLastTerm) {
      return lastLogTerm > myLastTerm;
    }
    return lastLogIndex >= myLastIndex;
  }

  // ── AppendEntries ───────────────────────────────────────────────

  private sendHeartbeats(): void {
    if (this.role !== RaftRole.Leader) return;

    const peers = this.opts.peerManager.getKnownNodeIds();
    for (const peerId of peers) {
      this.sendAppendEntries(peerId);
    }
  }

  private sendAppendEntries(peerId: string): void {
    const nextIdx = this.nextIndex.get(peerId) ?? this.raftLog.getLastIndex() + 1;
    const prevLogIndex = nextIdx - 1;
    const prevLogTerm = this.raftLog.getTermAt(prevLogIndex);
    const entries = this.raftLog.getEntriesFrom(nextIdx);

    const payload: AppendEntriesPayload = {
      term: this.currentTerm,
      leaderId: this.opts.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommit: this.commitIndex,
    };

    this.opts.peerManager.sendTo(
      peerId,
      createMessage(MessageType.ConsensusAppendEntries, this.opts.nodeId, payload),
    );
  }

  private handleAppendEntries(msg: MessageEnvelope): void {
    const payload = msg.payload as AppendEntriesPayload;

    // If the leader has a higher term, update
    if (payload.term > this.currentTerm) {
      this.stepDown(payload.term);
    }

    // Reject if term is outdated
    if (payload.term < this.currentTerm) {
      this.sendAppendEntriesReply(msg.from, false, 0);
      return;
    }

    // Valid leader heartbeat — reset election timer
    this.leaderId = payload.leaderId;
    if (this.role === RaftRole.Candidate) {
      this.role = RaftRole.Follower;
    }
    this.timer.resetElectionTimer();

    // Check log consistency
    if (payload.prevLogIndex > 0) {
      const prevTerm = this.raftLog.getTermAt(payload.prevLogIndex);
      if (prevTerm !== payload.prevLogTerm) {
        // Log inconsistency — tell leader to back up
        this.sendAppendEntriesReply(msg.from, false, 0);
        return;
      }
    }

    // Append new entries
    for (const entry of payload.entries) {
      const existing = this.raftLog.getEntry(entry.index);
      if (existing) {
        if (existing.term !== entry.term) {
          // Conflict: truncate from here
          this.raftLog.truncateFrom(entry.index);
          this.raftLog.append(entry);
        }
        // Else: already have this entry, skip
      } else {
        this.raftLog.append(entry);
      }
    }

    // Update commit index
    if (payload.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(payload.leaderCommit, this.raftLog.getLastIndex());
      this.applyCommitted();
    }

    this.sendAppendEntriesReply(msg.from, true, this.raftLog.getLastIndex());
  }

  private sendAppendEntriesReply(to: string, success: boolean, matchIndex: number): void {
    const reply: AppendEntriesReplyPayload = {
      term: this.currentTerm,
      success,
      matchIndex,
    };
    this.opts.peerManager.sendTo(
      to,
      createMessage(MessageType.ConsensusAppendEntriesReply, this.opts.nodeId, reply),
    );
  }

  private handleAppendEntriesReply(msg: MessageEnvelope): void {
    if (this.role !== RaftRole.Leader) return;

    const payload = msg.payload as AppendEntriesReplyPayload;

    if (payload.term > this.currentTerm) {
      this.stepDown(payload.term);
      return;
    }

    if (payload.success) {
      this.nextIndex.set(msg.from, payload.matchIndex + 1);
      this.matchIndex.set(msg.from, payload.matchIndex);
      this.advanceCommitIndex();
    } else {
      // Decrement nextIndex and retry
      const current = this.nextIndex.get(msg.from) ?? 1;
      this.nextIndex.set(msg.from, Math.max(1, current - 1));
      // Retry immediately
      this.sendAppendEntries(msg.from);
    }
  }

  // ── Commit & Apply ──────────────────────────────────────────────

  private advanceCommitIndex(): void {
    if (this.role !== RaftRole.Leader) return;

    const allNodeIds = [...this.opts.peerManager.getKnownNodeIds(), this.opts.nodeId];
    const total = allNodeIds.length;
    const majority = Math.floor(total / 2) + 1;

    // Find the highest index replicated on a majority
    for (let n = this.raftLog.getLastIndex(); n > this.commitIndex; n--) {
      const entry = this.raftLog.getEntry(n);
      if (!entry || entry.term !== this.currentTerm) continue;

      let replicatedCount = 0;
      for (const nodeId of allNodeIds) {
        const match = nodeId === this.opts.nodeId
          ? this.raftLog.getLastIndex()
          : (this.matchIndex.get(nodeId) ?? 0);
        if (match >= n) replicatedCount++;
      }

      if (replicatedCount >= majority) {
        this.commitIndex = n;
        this.applyCommitted();
        break;
      }
    }
  }

  private applyCommitted(): void {
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const entry = this.raftLog.getEntry(this.lastApplied);
      if (entry && this.onBlockCommitted) {
        this.onBlockCommitted(entry.block);
      }
    }
  }
}
