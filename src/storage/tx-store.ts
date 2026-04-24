import type Database from "better-sqlite3";
import type { Transaction } from "../types.js";
import { canonicalize } from "../core/serialization.js";
import { QueryCache } from "./queries.js";

export class TxStore {
  private q: QueryCache;

  constructor(db: Database.Database) {
    this.q = new QueryCache(db);
  }

  getByHash(hash: string): Transaction | null {
    const row = this.q.prepare("SELECT * FROM transactions WHERE hash = ?").get(hash) as
      | {
          hash: string;
          type: string;
          sender: string;
          nonce: number;
          timestamp: number;
          payload: string;
          signature: string;
          block_height: number | null;
          position: number | null;
          status: string;
        }
      | undefined;
    if (!row) return null;
    return {
      hash: row.hash,
      type: row.type as Transaction["type"],
      sender: row.sender,
      nonce: row.nonce,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload),
      signature: row.signature,
    };
  }

  getBySender(sender: string, limit = 100): Transaction[] {
    const rows = this.q
      .prepare(
        "SELECT * FROM transactions WHERE sender = ? ORDER BY timestamp DESC LIMIT ?",
      )
      .all(sender, limit) as {
      hash: string;
      type: string;
      sender: string;
      nonce: number;
      timestamp: number;
      payload: string;
      signature: string;
    }[];

    return rows.map((r) => ({
      hash: r.hash,
      type: r.type as Transaction["type"],
      sender: r.sender,
      nonce: r.nonce,
      timestamp: r.timestamp,
      payload: JSON.parse(r.payload),
      signature: r.signature,
    }));
  }

  /** Add a transaction to the pending pool. */
  addToPending(tx: Transaction): void {
    this.q
      .prepare("INSERT OR IGNORE INTO tx_pool (hash, raw, received, priority) VALUES (?, ?, ?, 0)")
      .run(tx.hash, canonicalize(tx), Date.now());
  }

  /** Get all pending transactions, ordered by received time. */
  getPending(limit = 500): Transaction[] {
    const rows = this.q
      .prepare("SELECT raw FROM tx_pool ORDER BY priority DESC, received ASC LIMIT ?")
      .all(limit) as { raw: string }[];
    return rows.map((r) => JSON.parse(r.raw) as Transaction);
  }

  /** Remove transactions from the pending pool (after inclusion in a block). */
  removePending(hashes: string[]): void {
    if (hashes.length === 0) return;
    const placeholders = hashes.map(() => "?").join(",");
    this.q.prepare(`DELETE FROM tx_pool WHERE hash IN (${placeholders})`).run(...hashes);
  }

  pendingCount(): number {
    const row = this.q.prepare("SELECT COUNT(*) as c FROM tx_pool").get() as { c: number };
    return row.c;
  }

  /** Get the next nonce for a sender. */
  getNextNonce(sender: string): number {
    const row = this.q.prepare("SELECT nonce FROM nonces WHERE sender = ?").get(sender) as
      | { nonce: number }
      | undefined;
    return row ? row.nonce + 1 : 0;
  }

  /** Update the nonce tracker for a sender. */
  updateNonce(sender: string, nonce: number): void {
    this.q
      .prepare(
        "INSERT INTO nonces (sender, nonce) VALUES (?, ?) ON CONFLICT(sender) DO UPDATE SET nonce = excluded.nonce",
      )
      .run(sender, nonce);
  }
}
