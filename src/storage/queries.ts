import type Database from "better-sqlite3";

/**
 * Cached prepared statement helper.
 * Lazily prepares and caches statements for reuse.
 */
export class QueryCache {
  private cache = new Map<string, Database.Statement>();

  constructor(private db: Database.Database) {}

  prepare(sql: string): Database.Statement {
    let stmt = this.cache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.cache.set(sql, stmt);
    }
    return stmt;
  }

  clear(): void {
    this.cache.clear();
  }
}
