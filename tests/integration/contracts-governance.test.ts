import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MiniLedgerNode } from "../../src/node";
import { TxType } from "../../src/types";
import { TRANSFER_CONTRACT } from "../../src/contracts/builtins";
import { createTempDir, removeTempDir } from "../helpers/cleanup";

const WAIT = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Contracts & Governance Integration", () => {
  let tmpDir: string;
  let node: MiniLedgerNode;

  beforeEach(async () => {
    tmpDir = createTempDir();
    node = await MiniLedgerNode.create({
      dataDir: tmpDir,
      config: {
        consensus: { algorithm: "solo", blockTimeMs: 200, maxTxPerBlock: 500 },
        logging: { level: "error" },
      },
    });
    await node.init();
    await node.start();
  });

  afterEach(async () => {
    await node.stop();
    removeTempDir(tmpDir);
  });

  it("deploys and invokes a custom contract", async () => {
    const code = `return {
      init(ctx) { ctx.set("counter", 0); },
      increment(ctx, amount) {
        const val = ctx.get("counter") || 0;
        ctx.set("counter", val + amount);
        return val + amount;
      }
    }`;

    // Deploy
    await node.submit({
      type: TxType.ContractDeploy,
      payload: { kind: "contract:deploy", name: "counter", version: "1.0", code },
    });

    await WAIT(500);

    // Invoke init
    await node.submit({
      type: TxType.ContractInvoke,
      payload: { kind: "contract:invoke", contract: "counter", method: "init", args: [] },
    });

    await WAIT(500);

    // Invoke increment
    await node.submit({
      type: TxType.ContractInvoke,
      payload: { kind: "contract:invoke", contract: "counter", method: "increment", args: [5] },
    });

    await WAIT(500);

    const state = await node.getState("counter");
    expect(state).not.toBeNull();
    expect(state!.value).toBe(5);
  });

  it("deploys the built-in transfer contract and moves tokens", async () => {
    // Deploy
    await node.submit({
      type: TxType.ContractDeploy,
      payload: {
        kind: "contract:deploy",
        name: "token",
        version: "1.0",
        code: TRANSFER_CONTRACT,
      },
    });

    await WAIT(500);

    // Mint tokens
    await node.submit({
      type: TxType.ContractInvoke,
      payload: { kind: "contract:invoke", contract: "token", method: "mint", args: [1000] },
    });

    await WAIT(500);

    // Check balance
    const senderKey = node.getPublicKey();
    const balanceEntry = await node.getState(`balance:${senderKey}`);
    expect(balanceEntry).not.toBeNull();
    expect(balanceEntry!.value).toBe(1000);
  });

  it("creates and votes on a governance proposal", async () => {
    // Create proposal
    await node.submit({
      type: TxType.GovernancePropose,
      payload: {
        kind: "governance:propose",
        title: "Increase block size",
        description: "Increase max tx per block to 1000",
        action: { type: "update-config", maxTxPerBlock: 1000 },
      },
    });

    await WAIT(500);

    // Check proposal was created
    const proposals = node.getGovernor().listProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.title).toBe("Increase block size");
    expect(proposals[0]!.status).toBe("active");

    // Vote on it
    await node.submit({
      type: TxType.GovernanceVote,
      payload: {
        kind: "governance:vote",
        proposalId: proposals[0]!.id,
        vote: true,
      },
    });

    await WAIT(500);

    // Check vote was recorded
    const updated = node.getGovernor().getProposal(proposals[0]!.id);
    expect(updated).not.toBeNull();
    const voterKey = node.getPublicKey();
    expect(updated!.votes[voterKey]).toBe(true);
  });

  it("contracts listed via API", async () => {
    const code = `return { noop(ctx) {} }`;
    await node.submit({
      type: TxType.ContractDeploy,
      payload: { kind: "contract:deploy", name: "mycontract", version: "0.1", code },
    });

    await WAIT(500);

    const contracts = node.getContractRegistry().listContracts();
    expect(contracts).toHaveLength(1);
    expect(contracts[0]!.name).toBe("mycontract");
  });
});
