import { Hono } from "hono";
import type { MiniLedgerNode } from "../../node.js";

export function stateRoutes(node: MiniLedgerNode): Hono {
  const app = new Hono();

  app.get("/state", async (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "20", 10) || 20));
    const offset = (page - 1) * limit;

    try {
      const db = node.getDatabase().raw();
      const countRow = db.prepare("SELECT COUNT(*) as total FROM world_state WHERE key NOT LIKE '\\_%' ESCAPE '\\'").get() as { total: number };
      const rows = db.prepare(
        "SELECT key, value, version, updated_at, updated_by, block_height FROM world_state WHERE key NOT LIKE '\\_%' ESCAPE '\\' ORDER BY updated_at DESC LIMIT ? OFFSET ?",
      ).all(limit, offset) as { key: string; value: string; version: number; updated_at: number; updated_by: string; block_height: number }[];

      const entries = rows.map((r) => ({
        key: r.key,
        value: JSON.parse(r.value),
        version: r.version,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        blockHeight: r.block_height,
      }));

      const totalPages = Math.ceil(countRow.total / limit);
      return c.json({ entries, total: countRow.total, page, limit, totalPages });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      return c.json({ error: message }, 500);
    }
  });

  app.get("/state/:key", async (c) => {
    const key = c.req.param("key");
    const entry = await node.getState(key);
    if (!entry) return c.json({ error: "Key not found" }, 404);
    return c.json(entry);
  });

  /** Execute a SQL query against the world state. The killer feature. */
  app.post("/state/query", async (c) => {
    try {
      const body = await c.req.json();
      const { sql, params = [] } = body as { sql: string; params?: unknown[] };
      if (!sql) return c.json({ error: "Missing sql field" }, 400);
      const results = await node.query(sql, params);
      return c.json({ results, count: results.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      return c.json({ error: message }, 400);
    }
  });

  return app;
}
