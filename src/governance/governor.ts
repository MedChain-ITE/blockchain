import type { StateStore } from "../storage/state-store.js";
import {
  type Proposal,
  ProposalStatus,
  ProposalType,
  createProposal,
} from "./proposal.js";
import { tallyVotes, addVote, isExpired } from "./voting.js";

const PROPOSAL_PREFIX = "_gov:proposal:";

/**
 * Governor: manages the lifecycle of governance proposals.
 * Proposals are stored in world state with a reserved key prefix.
 */
export class Governor {
  private stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  /** Create and store a new proposal. */
  propose(opts: {
    type: ProposalType;
    title: string;
    description: string;
    proposer: string;
    action: Record<string, unknown>;
    blockHeight: number;
    votingPeriodMs?: number;
  }): Proposal {
    const proposal = createProposal({
      type: opts.type,
      title: opts.title,
      description: opts.description,
      proposer: opts.proposer,
      action: opts.action,
      votingPeriodMs: opts.votingPeriodMs,
    });

    this.stateStore.set(
      `${PROPOSAL_PREFIX}${proposal.id}`,
      proposal,
      opts.proposer,
      opts.blockHeight,
    );

    return proposal;
  }

  /** Cast a vote on a proposal. */
  vote(proposalId: string, voter: string, approve: boolean, blockHeight: number): Proposal {
    const proposal = this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);

    const updated = addVote(proposal, voter, approve);
    this.stateStore.set(
      `${PROPOSAL_PREFIX}${proposalId}`,
      updated,
      voter,
      blockHeight,
    );

    return updated;
  }

  /**
   * Evaluate a proposal: check if it should be approved, rejected, or expired.
   * Returns the action to execute if approved, null otherwise.
   */
  evaluate(proposalId: string, totalVoters: number, blockHeight: number): {
    status: ProposalStatus;
    action: Record<string, unknown> | null;
  } {
    const proposal = this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);

    if (proposal.status !== ProposalStatus.Active) {
      return { status: proposal.status, action: null };
    }

    // Check expiration
    if (isExpired(proposal)) {
      const expired = { ...proposal, status: ProposalStatus.Expired };
      this.stateStore.set(
        `${PROPOSAL_PREFIX}${proposalId}`,
        expired,
        proposal.proposer,
        blockHeight,
      );
      return { status: ProposalStatus.Expired, action: null };
    }

    // Tally votes
    const result = tallyVotes(proposal, totalVoters);

    if (result.quorumReached) {
      const newStatus = result.passed ? ProposalStatus.Approved : ProposalStatus.Rejected;
      const updated = { ...proposal, status: newStatus };
      this.stateStore.set(
        `${PROPOSAL_PREFIX}${proposalId}`,
        updated,
        proposal.proposer,
        blockHeight,
      );

      return {
        status: newStatus,
        action: result.passed ? proposal.action : null,
      };
    }

    return { status: ProposalStatus.Active, action: null };
  }

  /** Get a proposal by ID. */
  getProposal(proposalId: string): Proposal | null {
    const entry = this.stateStore.get(`${PROPOSAL_PREFIX}${proposalId}`);
    return entry ? (entry.value as Proposal) : null;
  }

  /** List all proposals. */
  listProposals(): Proposal[] {
    const results = this.stateStore.query(
      `SELECT value FROM world_state WHERE key LIKE ?`,
      [`${PROPOSAL_PREFIX}%`],
    );
    return results
      .map((r) => {
        try {
          return JSON.parse(r.value as string) as Proposal;
        } catch {
          return null;
        }
      })
      .filter((p): p is Proposal => p !== null);
  }
}
