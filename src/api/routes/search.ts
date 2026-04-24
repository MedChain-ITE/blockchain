import { Hono } from "hono";
import type { MiniLedgerNode } from "../../node.js";

export function searchRoutes(node: MiniLedgerNode): Hono {
  const app = new Hono();

  app.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ error: "Missing query parameter q" }, 400);

    const stores = node.getStores();

    // Try block height (pure number)
    if (/^\d+$/.test(q)) {
      const height = Number.parseInt(q, 10);
      const block = stores.blocks.getByHeight(height);
      if (block) {
        return c.json({ type: "block", height: block.height, hash: block.hash });
      }
    }

    // Try tx hash (hex string)
    if (/^[0-9a-fA-F]{16,}$/.test(q)) {
      const tx = stores.txs.getByHash(q);
      if (tx) {
        return c.json({ type: "transaction", hash: tx.hash });
      }

      // Try block hash
      const block = stores.blocks.getByHash(q);
      if (block) {
        return c.json({ type: "block", height: block.height, hash: block.hash });
      }

      // Try as address — check if any txs by this sender
      const senderTxs = stores.txs.getBySender(q, 1);
      if (senderTxs.length > 0) {
        return c.json({ type: "address", pubkey: q });
      }
    }

    // Try state key (exact match)
    const stateEntry = stores.state.get(q);
    if (stateEntry) {
      return c.json({ type: "state", key: stateEntry.key });
    }

    // Try contract name
    const contract = node.getContractRegistry().getInstance(q);
    if (contract) {
      return c.json({ type: "contract", name: contract.name });
    }

    return c.json({ type: "not_found", query: q }, 404);
  });

  return app;
}
