import Database from "better-sqlite3";
import { StorageError } from "../errors.js";
import { MIGRATIONS } from "./migrations.js";

export class MiniLedgerDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    try {
      this.db = new Database(dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("busy_timeout = 5000");
    } catch (err) {
      throw new StorageError(`Failed to open database: ${err}`);
    }
  }

  /** Run all pending migrations. */
  migrate(): void {
    // Create migrations tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const applied = this.db
      .prepare("SELECT version FROM _migrations ORDER BY version")
      .all() as { version: number }[];
    const appliedVersions = new Set(applied.map((r) => r.version));

    for (const migration of MIGRATIONS) {
      if (!appliedVersions.has(migration.version)) {
        this.db.transaction(() => {
          this.db.exec(migration.sql);
          this.db.prepare("INSERT INTO _migrations (version, applied_at) VALUES (?, ?)").run(
            migration.version,
            Date.now(),
          );
        })();
      }
    }
  }

  /** Get the underlying better-sqlite3 Database instance. */
  raw(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
