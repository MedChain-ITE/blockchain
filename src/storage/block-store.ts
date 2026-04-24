import type Database from "better-sqlite3";
import type { Block } from "../types.js";
import { canonicalize } from "../core/serialization.js";
import { QueryCache } from "./queries.js";

export class BlockStore {
  private q: QueryCache;

  constructor(db: Database.Database) {
    this.q = new QueryCache(db);
  }

  insert(block: Block): void {
    const raw = canonicalize(block);
    this.q
      .prepare(
        `INSERT INTO blocks (height, hash, prev_hash, timestamp, merkle_root, state_root, proposer, signature, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        block.height,
        block.hash,
        block.previousHash,
        block.timestamp,
        block.merkleRoot,
        block.stateRoot,
        block.proposer,
        block.signature,
        raw,
      );

    // Insert transactions
    const txStmt = this.q.prepare(
      `INSERT OR IGNORE INTO transactions (hash, type, sender, nonce, timestamp, payload, signature, block_height, position, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
    );
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i]!;
      txStmt.run(
        tx.hash,
        tx.type,
        tx.sender,
        tx.nonce,
        tx.timestamp,
        canonicalize(tx.payload),
        tx.signature,
        block.height,
        i,
      );
    }
  }

  getByHeight(height: number): Block | null {
    const row = this.q.prepare("SELECT raw FROM blocks WHERE height = ?").get(height) as
      | { raw: string }
      | undefined;
    return row ? (JSON.parse(row.raw) as Block) : null;
  }

  getByHash(hash: string): Block | null {
    const row = this.q.prepare("SELECT raw FROM blocks WHERE hash = ?").get(hash) as
      | { raw: string }
      | undefined;
    return row ? (JSON.parse(row.raw) as Block) : null;
  }

  getLatest(): Block | null {
    const row = this.q
      .prepare("SELECT raw FROM blocks ORDER BY height DESC LIMIT 1")
      .get() as { raw: string } | undefined;
    return row ? (JSON.parse(row.raw) as Block) : null;
  }

  getRange(fromHeight: number, toHeight: number): Block[] {
    const rows = this.q
      .prepare("SELECT raw FROM blocks WHERE height >= ? AND height <= ? ORDER BY height ASC")
      .all(fromHeight, toHeight) as { raw: string }[];
    return rows.map((r) => JSON.parse(r.raw) as Block);
  }

  getHeight(): number {
    const row = this.q.prepare("SELECT MAX(height) as h FROM blocks").get() as
      | { h: number | null }
      | undefined;
    return row?.h ?? -1;
  }
}
