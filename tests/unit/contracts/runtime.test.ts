import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { compileContract, executeContract } from "../../../src/contracts/runtime";
import { createContractContext } from "../../../src/contracts/context";
import { MiniLedgerDB } from "../../../src/storage/database";
import { StateStore } from "../../../src/storage/state-store";
import { createTempDir, removeTempDir } from "../../helpers/cleanup";
import * as path from "node:path";

describe("Contract Runtime", () => {
  let tmpDir: string;
  let db: MiniLedgerDB;
  let stateStore: StateStore;

  beforeEach(() => {
    tmpDir = createTempDir();
    db = new MiniLedgerDB(path.join(tmpDir, "test.db"));
    db.migrate();
    stateStore = new StateStore(db.raw());
  });

  afterEach(() => {
    db.close();
    removeTempDir(tmpDir);
  });

  it("compiles and executes a simple contract", () => {
    const source = `return {
      greet(ctx, name) {
        ctx.set("greeting", "Hello, " + name);
        return "Hello, " + name;
      }
    }`;

    const mod = compileContract(source);
    expect(mod.greet).toBeDefined();

    const ctx = createContractContext({
      stateStore,
      sender: "abc123",
      blockHeight: 1,
      timestamp: Date.now(),
    });

    const result = executeContract(mod, "greet", ctx, ["World"]);
    expect(result).toBe("Hello, World");
    expect(stateStore.get("greeting")?.value).toBe("Hello, World");
  });

  it("provides sender and blockHeight in context", () => {
    const source = `return {
      whoami(ctx) {
        ctx.set("caller", ctx.sender);
        ctx.set("height", ctx.blockHeight);
      }
    }`;

    const mod = compileContract(source);
    const ctx = createContractContext({
      stateStore,
      sender: "sender123",
      blockHeight: 42,
      timestamp: Date.now(),
    });

    executeContract(mod, "whoami", ctx);
    expect(stateStore.get("caller")?.value).toBe("sender123");
    expect(stateStore.get("height")?.value).toBe(42);
  });

  it("supports get/set/del operations", () => {
    const source = `return {
      setVal(ctx, key, val) { ctx.set(key, val); },
      getVal(ctx, key) { return ctx.get(key); },
      delVal(ctx, key) { ctx.del(key); }
    }`;

    const mod = compileContract(source);
    const ctx = createContractContext({
      stateStore,
      sender: "s",
      blockHeight: 1,
      timestamp: Date.now(),
    });

    executeContract(mod, "setVal", ctx, ["mykey", 123]);
    expect(executeContract(mod, "getVal", ctx, ["mykey"])).toBe(123);

    executeContract(mod, "delVal", ctx, ["mykey"]);
    expect(executeContract(mod, "getVal", ctx, ["mykey"])).toBeNull();
  });

  it("rejects contract with non-function exports", () => {
    expect(() => compileContract(`return { notAFunc: 42 }`)).toThrow("must be a function");
  });

  it("rejects contract that returns non-object", () => {
    expect(() => compileContract(`return 42`)).toThrow("must return an object");
  });

  it("throws on unknown method", () => {
    const mod = compileContract(`return { foo(ctx) {} }`);
    const ctx = createContractContext({
      stateStore,
      sender: "s",
      blockHeight: 1,
      timestamp: Date.now(),
    });
    expect(() => executeContract(mod, "bar", ctx)).toThrow('method "bar" not found');
  });

  it("captures logs", () => {
    const source = `return {
      doLog(ctx) {
        ctx.log("step 1");
        ctx.log("step 2");
      }
    }`;

    const mod = compileContract(source);
    const ctx = createContractContext({
      stateStore,
      sender: "s",
      blockHeight: 1,
      timestamp: Date.now(),
    });

    executeContract(mod, "doLog", ctx);
    expect(ctx.getLogs()).toEqual(["step 1", "step 2"]);
  });
});
