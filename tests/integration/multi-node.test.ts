import { describe, it, expect, afterEach } from "vitest";
import { MiniLedgerNode } from "../../src/node";
import { createTempDir, removeTempDir } from "../helpers/cleanup";

const WAIT = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Multi-Node Integration", () => {
  const tempDirs: string[] = [];
  const nodes: MiniLedgerNode[] = [];

  async function createNode(
    p2pPort: number,
    apiPort: number,
    peers: string[] = [],
  ): Promise<MiniLedgerNode> {
    const dir = createTempDir();
    tempDirs.push(dir);

    const node = await MiniLedgerNode.create({
      dataDir: dir,
      config: {
        network: {
          listenAddress: "127.0.0.1",
          p2pPort,
          apiPort,
          peers,
          maxPeers: 50,
        },
        consensus: {
          algorithm: "raft",
          blockTimeMs: 500,
          maxTxPerBlock: 500,
        },
        logging: { level: "warn" },
      },
    });

    await node.init();
    nodes.push(node);
    return node;
  }

  afterEach(async () => {
    // Stop all nodes
    for (const node of nodes) {
      await node.stop();
    }
    nodes.length = 0;

    // Cleanup temp dirs
    for (const dir of tempDirs) {
      removeTempDir(dir);
    }
    tempDirs.length = 0;
  });

  it("two nodes connect via WebSocket and complete handshake", async () => {
    const node1 = await createNode(14440, 14441);
    const node2 = await createNode(14442, 14443, ["ws://127.0.0.1:14440"]);

    await node1.start();
    await node2.start();

    // Wait for handshake
    await WAIT(2000);

    const status1 = node1.getStatus();
    const status2 = node2.getStatus();

    expect(status1.peerCount).toBe(1);
    expect(status2.peerCount).toBe(1);
  });

  it("three nodes form a cluster and elect a Raft leader", async () => {
    const node1 = await createNode(14450, 14451);
    const node2 = await createNode(14452, 14453, ["ws://127.0.0.1:14450"]);
    const node3 = await createNode(14454, 14455, ["ws://127.0.0.1:14450"]);

    await node1.start();
    await WAIT(500); // Let node1 start first
    await node2.start();
    await node3.start();

    // Wait for peer discovery + leader election (Raft needs time for
    // peer list exchange, then election timeout, then voting)
    await WAIT(8000);

    // At least one node should be leader
    const rafts = nodes.map((n) => n.getRaft());
    const leaders = rafts.filter((r) => r?.isLeader());
    expect(leaders.length).toBeGreaterThanOrEqual(1);

    // All nodes should have peers
    for (const node of nodes) {
      expect(node.getStatus().peerCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("transactions submitted to leader get included in blocks", async () => {
    const node1 = await createNode(14460, 14461);
    const node2 = await createNode(14462, 14463, ["ws://127.0.0.1:14460"]);

    await node1.start();
    await node2.start();

    // Wait for cluster formation + leader election
    await WAIT(5000);

    // Find the leader node
    const leader = nodes.find((n) => n.getRaft()?.isLeader());
    expect(leader).toBeDefined();

    // Submit a transaction to the leader
    await leader!.submit({ key: "test:multi", value: { data: "hello from cluster" } });

    // Wait for block production + replication
    await WAIT(3000);

    // Leader should have the state
    const state = await leader!.getState("test:multi");
    expect(state).not.toBeNull();
    expect(state!.value).toEqual({ data: "hello from cluster" });
  });

  it("transactions submitted to follower get forwarded to leader", async () => {
    const node1 = await createNode(14470, 14471);
    const node2 = await createNode(14472, 14473, ["ws://127.0.0.1:14470"]);

    await node1.start();
    await node2.start();

    await WAIT(5000);

    const leader = nodes.find((n) => n.getRaft()?.isLeader());
    const follower = nodes.find((n) => !n.getRaft()?.isLeader());
    expect(leader).toBeDefined();
    expect(follower).toBeDefined();

    // Submit to follower — should be forwarded to leader
    await follower!.submit({ key: "forwarded:tx", value: { origin: "follower" } });

    await WAIT(3000);

    // Leader should have produced a block with this tx
    const state = await leader!.getState("forwarded:tx");
    expect(state).not.toBeNull();
    expect(state!.value).toEqual({ origin: "follower" });
  });
});
