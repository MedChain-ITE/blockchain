import { Hono } from "hono";
import type { MiniLedgerNode } from "../../node.js";

export function networkRoutes(node: MiniLedgerNode): Hono {
  const app = new Hono();

  app.get("/peers", (c) => {
    const pm = node.getPeerManager();
    if (!pm) {
      return c.json({ peers: [], count: 0 });
    }
    const peers = pm.getPeerStates().map((p) => ({
      nodeId: p.nodeId,
      publicKey: p.publicKey,
      address: p.address,
      orgId: p.orgId,
      status: p.status,
      chainHeight: p.chainHeight,
      lastSeen: p.lastSeen,
    }));
    return c.json({ peers, count: peers.length });
  });

  app.get("/consensus", (c) => {
    const raft = node.getRaft();
    if (!raft) {
      return c.json({ algorithm: node.config.consensus.algorithm, state: null });
    }
    return c.json({
      algorithm: "raft",
      state: raft.getState(),
    });
  });

  return app;
}
