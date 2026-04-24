import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Governor } from "../../../src/governance/governor";
import { ProposalType, ProposalStatus } from "../../../src/governance/proposal";
import { tallyVotes } from "../../../src/governance/voting";
import { MiniLedgerDB } from "../../../src/storage/database";
import { StateStore } from "../../../src/storage/state-store";
import { createTempDir, removeTempDir } from "../../helpers/cleanup";
import * as path from "node:path";

describe("Governance", () => {
  let tmpDir: string;
  let db: MiniLedgerDB;
  let stateStore: StateStore;
  let governor: Governor;

  beforeEach(() => {
    tmpDir = createTempDir();
    db = new MiniLedgerDB(path.join(tmpDir, "test.db"));
    db.migrate();
    stateStore = new StateStore(db.raw());
    governor = new Governor(stateStore);
  });

  afterEach(() => {
    db.close();
    removeTempDir(tmpDir);
  });

  it("creates a proposal", () => {
    const proposal = governor.propose({
      type: ProposalType.Custom,
      title: "Test Proposal",
      description: "A test proposal",
      proposer: "proposer-key",
      action: { doSomething: true },
      blockHeight: 1,
    });

    expect(proposal.id).toBeTruthy();
    expect(proposal.status).toBe(ProposalStatus.Active);
    expect(proposal.votes["proposer-key"]).toBe(true); // Auto-yes vote
  });

  it("records votes", () => {
    const proposal = governor.propose({
      type: ProposalType.AddPeer,
      title: "Add Node X",
      description: "Add a new peer",
      proposer: "node-a",
      action: { peerId: "node-x" },
      blockHeight: 1,
    });

    governor.vote(proposal.id, "node-b", true, 2);
    governor.vote(proposal.id, "node-c", false, 2);

    const updated = governor.getProposal(proposal.id)!;
    expect(updated.votes["node-a"]).toBe(true);
    expect(updated.votes["node-b"]).toBe(true);
    expect(updated.votes["node-c"]).toBe(false);
  });

  it("evaluates proposal as approved when quorum reached", () => {
    const proposal = governor.propose({
      type: ProposalType.Custom,
      title: "Vote Test",
      description: "",
      proposer: "node-a",
      action: { result: "approved" },
      blockHeight: 1,
    });

    governor.vote(proposal.id, "node-b", true, 2);
    governor.vote(proposal.id, "node-c", true, 2);

    const result = governor.evaluate(proposal.id, 5, 3);
    expect(result.status).toBe(ProposalStatus.Approved);
    expect(result.action).toEqual({ result: "approved" });
  });

  it("evaluates proposal as rejected when votes against", () => {
    const proposal = governor.propose({
      type: ProposalType.Custom,
      title: "Bad Idea",
      description: "",
      proposer: "node-a",
      action: {},
      blockHeight: 1,
    });

    governor.vote(proposal.id, "node-b", false, 2);
    governor.vote(proposal.id, "node-c", false, 2);

    const result = governor.evaluate(proposal.id, 3, 3);
    expect(result.status).toBe(ProposalStatus.Rejected);
    expect(result.action).toBeNull();
  });

  it("lists all proposals", () => {
    governor.propose({
      type: ProposalType.Custom,
      title: "P1",
      description: "",
      proposer: "a",
      action: {},
      blockHeight: 1,
    });
    governor.propose({
      type: ProposalType.Custom,
      title: "P2",
      description: "",
      proposer: "b",
      action: {},
      blockHeight: 2,
    });

    const list = governor.listProposals();
    expect(list).toHaveLength(2);
  });

  describe("tallyVotes", () => {
    it("calculates quorum correctly", () => {
      const proposal = governor.propose({
        type: ProposalType.Custom,
        title: "Tally Test",
        description: "",
        proposer: "a",
        action: {},
        blockHeight: 1,
      });

      // 1 vote out of 5 voters, 50% quorum = need 3
      const result = tallyVotes(governor.getProposal(proposal.id)!, 5, 50);
      expect(result.approved).toBe(1);
      expect(result.total).toBe(1);
      expect(result.quorumReached).toBe(false);
    });
  });
});
