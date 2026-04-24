import { Hono } from "hono";
import type { MiniLedgerNode } from "../../node.js";

export function healthRoutes(node: MiniLedgerNode): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({
      status: node.isRunning() ? "ok" : "stopped",
      timestamp: Date.now(),
    });
  });

  app.get("/status", (c) => {
    return c.json(node.getStatus());
  });

  return app;
}
