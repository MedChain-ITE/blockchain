import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MiniLedgerNode } from "../../src/node";
import { createTempDir, removeTempDir } from "../helpers/cleanup";

describe("Single Node Integration", () => {
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
  });

  afterEach(async () => {
    await node.stop();
    removeTempDir(tmpDir);
  });

  it("initializes with genesis block", async () => {
    const block = await node.getBlock(0);
    expect(block).not.toBeNull();
    expect(block!.height).toBe(0);
  });

  it("reports correct status", () => {
    const status = node.getStatus();
    expect(status.chainHeight).toBe(0);
    expect(status.publicKey).toHaveLength(64);
    expect(status.version).toBe(1);
  });

  it("submits and confirms a transaction", async () => {
    await node.start();

    const tx = await node.submit({ key: "account:alice", value: { balance: 1000 } });
    expect(tx.hash).toHaveLength(64);
    expect(tx.type).toBe("state:set");

    // Wait for block production
    await new Promise((r) => setTimeout(r, 500));

    // Check state was updated
    const entry = await node.getState("account:alice");
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual({ balance: 1000 });

    // Check chain advanced
    const status = node.getStatus();
    expect(status.chainHeight).toBeGreaterThan(0);
  });

  it("handles multiple transactions in one block", async () => {
    await node.start();

    await node.submit({ key: "a", value: 1 });
    await node.submit({ key: "b", value: 2 });
    await node.submit({ key: "c", value: 3 });

    await new Promise((r) => setTimeout(r, 500));

    const a = await node.getState("a");
    const b = await node.getState("b");
    const c = await node.getState("c");
    expect(a!.value).toBe(1);
    expect(b!.value).toBe(2);
    expect(c!.value).toBe(3);
  });

  it("supports SQL queries on state", async () => {
    await node.start();

    await node.submit({ key: "user:alice", value: { name: "Alice", age: 30 } });
    await node.submit({ key: "user:bob", value: { name: "Bob", age: 25 } });
    await node.submit({ key: "config:version", value: 1 });

    await new Promise((r) => setTimeout(r, 500));

    const results = await node.query("SELECT * FROM world_state WHERE key LIKE ?", ["user:%"]);
    expect(results).toHaveLength(2);
  });

  it("deletes state entries", async () => {
    await node.start();

    await node.submit({ key: "temp", value: "data" });
    await new Promise((r) => setTimeout(r, 500));

    expect(await node.getState("temp")).not.toBeNull();

    await node.submit({ key: "temp", value: null });
    await new Promise((r) => setTimeout(r, 500));

    expect(await node.getState("temp")).toBeNull();
  });

  it("persists and restores chain across restarts", async () => {
    await node.start();
    await node.submit({ key: "persistent", value: "data" });
    await new Promise((r) => setTimeout(r, 500));

    const heightBefore = node.getStatus().chainHeight;
    await node.stop();

    // Restart
    const node2 = await MiniLedgerNode.create({
      dataDir: tmpDir,
      config: { logging: { level: "error" } },
    });
    await node2.init();

    expect(node2.getStatus().chainHeight).toBe(heightBefore);
    const entry = await node2.getState("persistent");
    expect(entry!.value).toBe("data");

    await node2.stop();
  });
});
