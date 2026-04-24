import { Hono } from "hono";
import type { MiniLedgerNode } from "../../node.js";

export function identityRoutes(node: MiniLedgerNode): Hono {
  const app = new Hono();

  app.get("/identity", (c) => {
    const status = node.getStatus();
    return c.json({
      nodeId: status.nodeId,
      publicKey: status.publicKey,
    });
  });

  return app;
}
