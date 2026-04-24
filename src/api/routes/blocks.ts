import { Hono } from "hono";
import type { MiniLedgerNode } from "../../node.js";

export function blockRoutes(node: MiniLedgerNode): Hono {
  const app = new Hono();

  app.get("/blocks/latest", async (c) => {
    const block = await node.getLatestBlock();
    if (!block) return c.json({ error: "No blocks" }, 404);
    return c.json(block);
  });

  app.get("/blocks/:height", async (c) => {
    const height = Number.parseInt(c.req.param("height"), 10);
    if (Number.isNaN(height)) return c.json({ error: "Invalid height" }, 400);
    const block = await node.getBlock(height);
    if (!block) return c.json({ error: "Block not found" }, 404);
    return c.json(block);
  });

  app.get("/blocks", async (c) => {
    const stores = node.getStores();
    const currentHeight = stores.blocks.getHeight();
    const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "20", 10) || 20));

    // page 1 = newest blocks, descending
    const toHeight = currentHeight - (page - 1) * limit;
    const fromHeight = Math.max(0, toHeight - limit + 1);

    if (toHeight < 0) {
      return c.json({ blocks: [], height: currentHeight, page, limit, totalPages: Math.ceil((currentHeight + 1) / limit) });
    }

    const blocks = stores.blocks.getRange(fromHeight, toHeight).reverse(); // newest first
    const totalPages = Math.ceil((currentHeight + 1) / limit);
    return c.json({ blocks, height: currentHeight, page, limit, totalPages });
  });

  return app;
}
