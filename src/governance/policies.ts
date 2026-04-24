import { ProposalType } from "./proposal.js";

export interface GovernancePolicy {
  /** Minimum quorum percentage (0-100) for proposals to pass. */
  quorumPercent: number;
  /** Default voting period in milliseconds. */
  votingPeriodMs: number;
  /** Proposal types that any member can create. */
  allowedProposalTypes: ProposalType[];
}

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicy = {
  quorumPercent: 50,
  votingPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
  allowedProposalTypes: [
    ProposalType.AddPeer,
    ProposalType.RemovePeer,
    ProposalType.UpdateConfig,
    ProposalType.UpgradeContract,
    ProposalType.Custom,
  ],
};
