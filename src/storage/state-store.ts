import type Database from "better-sqlite3";
import type { StateEntry } from "../types.js";
import { canonicalize } from "../core/serialization.js";
import { sha256Hex } from "../core/hash.js";
import { QueryCache } from "./queries.js";

export class StateStore {
  private q: QueryCache;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.q = new QueryCache(db);
  }

  get(key: string): StateEntry | null {
    const row = this.q.prepare("SELECT * FROM world_state WHERE key = ?").get(key) as
      | {
          key: string;
          value: string;
          version: number;
          updated_at: number;
          updated_by: string;
          block_height: number;
        }
      | undefined;
    if (!row) return null;
    return {
      key: row.key,
      value: JSON.parse(row.value),
      version: row.version,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      blockHeight: row.block_height,
    };
  }

  set(
    key: string,
    value: unknown,
    updatedBy: string,
    blockHeight: number,
  ): void {
    const existing = this.q
      .prepare("SELECT version FROM world_state WHERE key = ?")
      .get(key) as { version: number } | undefined;

    const version = existing ? existing.version + 1 : 1;
    const serialized = canonicalize(value);

    this.q
      .prepare(
        `INSERT INTO world_state (key, value, version, updated_at, updated_by, block_height)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           version = excluded.version,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by,
           block_height = excluded.block_height`,
      )
      .run(key, serialized, version, Date.now(), updatedBy, blockHeight);
  }

  delete(key: string): boolean {
    const result = this.q.prepare("DELETE FROM world_state WHERE key = ?").run(key);
    return result.changes > 0;
  }

  /** Execute a read-only SQL query against the world_state table. */
  query(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    // Only allow SELECT queries for safety
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith("SELECT")) {
      throw new Error("Only SELECT queries are allowed");
    }
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
  }

  /** Compute a hash of the entire world state (for stateRoot). */
  computeStateRoot(): string {
    const rows = this.q
      .prepare("SELECT key, value, version FROM world_state ORDER BY key ASC")
      .all() as { key: string; value: string; version: number }[];

    if (rows.length === 0) {
      return "0".repeat(64);
    }

    const stateString = rows
      .map((r) => `${r.key}:${r.value}:${r.version}`)
      .join("|");
    return sha256Hex(stateString);
  }

  count(): number {
    const row = this.q.prepare("SELECT COUNT(*) as c FROM world_state").get() as { c: number };
    return row.c;
  }
}
