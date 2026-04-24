import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MiniLedgerDB } from "../../../src/storage/database";
import { StateStore } from "../../../src/storage/state-store";
import { createTempDir, removeTempDir } from "../../helpers/cleanup";
import * as path from "node:path";

describe("StateStore", () => {
  let tmpDir: string;
  let db: MiniLedgerDB;
  let store: StateStore;

  beforeEach(() => {
    tmpDir = createTempDir();
    db = new MiniLedgerDB(path.join(tmpDir, "test.db"));
    db.migrate();
    store = new StateStore(db.raw());
  });

  afterEach(() => {
    db.close();
    removeTempDir(tmpDir);
  });

  it("sets and gets a value", () => {
    store.set("foo", { bar: 42 }, "sender1", 1);
    const entry = store.get("foo");
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual({ bar: 42 });
    expect(entry!.version).toBe(1);
  });

  it("increments version on update", () => {
    store.set("foo", "v1", "sender1", 1);
    store.set("foo", "v2", "sender1", 2);
    const entry = store.get("foo");
    expect(entry!.version).toBe(2);
    expect(entry!.value).toBe("v2");
  });

  it("deletes a value", () => {
    store.set("foo", "bar", "sender1", 1);
    expect(store.delete("foo")).toBe(true);
    expect(store.get("foo")).toBeNull();
  });

  it("queries with SQL", () => {
    store.set("user:alice", { name: "Alice" }, "s", 1);
    store.set("user:bob", { name: "Bob" }, "s", 1);
    store.set("config:version", 1, "s", 1);

    const results = store.query("SELECT * FROM world_state WHERE key LIKE ?", ["user:%"]);
    expect(results).toHaveLength(2);
  });

  it("rejects non-SELECT queries", () => {
    expect(() => store.query("DELETE FROM world_state")).toThrow("SELECT");
  });

  it("computes state root", () => {
    store.set("a", 1, "s", 1);
    const root1 = store.computeStateRoot();
    expect(root1).toHaveLength(64);

    store.set("b", 2, "s", 1);
    const root2 = store.computeStateRoot();
    expect(root2).not.toBe(root1);
  });

  it("counts entries", () => {
    expect(store.count()).toBe(0);
    store.set("a", 1, "s", 1);
    store.set("b", 2, "s", 1);
    expect(store.count()).toBe(2);
  });
});
