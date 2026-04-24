export enum ProposalType {
  AddPeer = "add-peer",
  RemovePeer = "remove-peer",
  UpdateConfig = "update-config",
  UpgradeContract = "upgrade-contract",
  Custom = "custom",
}

export enum ProposalStatus {
  Active = "active",
  Approved = "approved",
  Rejected = "rejected",
  Expired = "expired",
}

export interface Proposal {
  id: string;
  type: ProposalType;
  title: string;
  description: string;
  proposer: string; // public key
  action: Record<string, unknown>; // type-specific action data
  status: ProposalStatus;
  createdAt: number;
  expiresAt: number;
  votes: Record<string, boolean>; // publicKey -> approve/reject
}

export function createProposal(opts: {
  type: ProposalType;
  title: string;
  description: string;
  proposer: string;
  action: Record<string, unknown>;
  votingPeriodMs?: number;
}): Proposal {
  const now = Date.now();
  const votingPeriod = opts.votingPeriodMs ?? 24 * 60 * 60 * 1000; // 24 hours default

  return {
    id: `proposal:${now}:${Math.random().toString(36).slice(2, 8)}`,
    type: opts.type,
    title: opts.title,
    description: opts.description,
    proposer: opts.proposer,
    action: opts.action,
    status: ProposalStatus.Active,
    createdAt: now,
    expiresAt: now + votingPeriod,
    votes: { [opts.proposer]: true }, // Proposer auto-votes yes
  };
}
