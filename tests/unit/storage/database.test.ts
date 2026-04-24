import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MiniLedgerDB } from "../../../src/storage/database";
import { createTempDir, removeTempDir } from "../../helpers/cleanup";
import * as path from "node:path";

describe("MiniLedgerDB", () => {
  let tmpDir: string;
  let db: MiniLedgerDB;

  beforeEach(() => {
    tmpDir = createTempDir();
    db = new MiniLedgerDB(path.join(tmpDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    removeTempDir(tmpDir);
  });

  it("opens and migrates database", () => {
    db.migrate();
    // Check tables exist
    const tables = db
      .raw()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("blocks");
    expect(names).toContain("transactions");
    expect(names).toContain("world_state");
    expect(names).toContain("tx_pool");
    expect(names).toContain("peers");
  });

  it("uses WAL mode", () => {
    const result = db.raw().pragma("journal_mode") as { journal_mode: string }[];
    expect(result[0]?.journal_mode).toBe("wal");
  });

  it("runs migrations idempotently", () => {
    db.migrate();
    db.migrate(); // Should not throw
  });
});
