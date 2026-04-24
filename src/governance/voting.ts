import type { Proposal } from "./proposal.js";
import { ProposalStatus } from "./proposal.js";

export interface VoteResult {
  approved: number;
  rejected: number;
  total: number;
  quorumReached: boolean;
  passed: boolean;
}

/**
 * Tally votes on a proposal.
 * @param proposal - The proposal to tally
 * @param totalVoters - Total number of eligible voters in the network
 * @param quorumPercent - Minimum percentage of voters required (default 50%)
 */
export function tallyVotes(
  proposal: Proposal,
  totalVoters: number,
  quorumPercent = 50,
): VoteResult {
  const votes = Object.values(proposal.votes);
  const approved = votes.filter((v) => v === true).length;
  const rejected = votes.filter((v) => v === false).length;
  const total = votes.length;

  const quorumNeeded = Math.ceil((totalVoters * quorumPercent) / 100);
  const quorumReached = total >= quorumNeeded;
  const passed = quorumReached && approved > rejected;

  return { approved, rejected, total, quorumReached, passed };
}

/** Add a vote to a proposal. Returns updated proposal. */
export function addVote(
  proposal: Proposal,
  voter: string,
  vote: boolean,
): Proposal {
  if (proposal.status !== ProposalStatus.Active) {
    throw new Error(`Proposal ${proposal.id} is not active (status: ${proposal.status})`);
  }
  if (Date.now() > proposal.expiresAt) {
    throw new Error(`Proposal ${proposal.id} has expired`);
  }

  return {
    ...proposal,
    votes: { ...proposal.votes, [voter]: vote },
  };
}

/** Check if a proposal has expired. */
export function isExpired(proposal: Proposal): boolean {
  return Date.now() > proposal.expiresAt;
}
