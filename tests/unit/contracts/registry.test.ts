import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ContractRegistry } from "../../../src/contracts/registry";
import { createContractContext } from "../../../src/contracts/context";
import { TRANSFER_CONTRACT } from "../../../src/contracts/builtins";
import { MiniLedgerDB } from "../../../src/storage/database";
import { StateStore } from "../../../src/storage/state-store";
import { createTempDir, removeTempDir } from "../../helpers/cleanup";
import * as path from "node:path";

describe("Contract Registry", () => {
  let tmpDir: string;
  let db: MiniLedgerDB;
  let stateStore: StateStore;
  let registry: ContractRegistry;

  beforeEach(() => {
    tmpDir = createTempDir();
    db = new MiniLedgerDB(path.join(tmpDir, "test.db"));
    db.migrate();
    stateStore = new StateStore(db.raw());
    registry = new ContractRegistry(stateStore);
  });

  afterEach(() => {
    db.close();
    removeTempDir(tmpDir);
  });

  it("deploys and retrieves a contract", () => {
    const code = `return { hello(ctx) { return "world"; } }`;
    registry.deploy("test", "1.0", code, "deployer", 1);

    const instance = registry.getInstance("test");
    expect(instance).not.toBeNull();
    expect(instance!.name).toBe("test");
    expect(instance!.version).toBe("1.0");
  });

  it("invokes a deployed contract method", () => {
    const code = `return {
      add(ctx, a, b) {
        const sum = a + b;
        ctx.set("result", sum);
        return sum;
      }
    }`;

    registry.deploy("math", "1.0", code, "deployer", 1);

    const ctx = createContractContext({
      stateStore,
      sender: "user1",
      blockHeight: 2,
      timestamp: Date.now(),
    });

    const result = registry.invoke("math", "add", ctx, [3, 4]);
    expect(result).toBe(7);
    expect(stateStore.get("result")?.value).toBe(7);
  });

  it("runs the built-in transfer contract", () => {
    registry.deploy("token", "1.0", TRANSFER_CONTRACT, "deployer", 1);

    const minter = "minter-pubkey";
    const recipient = "recipient-pubkey";

    // Mint tokens
    const ctx1 = createContractContext({
      stateStore,
      sender: minter,
      blockHeight: 2,
      timestamp: Date.now(),
    });
    registry.invoke("token", "mint", ctx1, [1000]);

    // Check balance
    const bal = registry.invoke("token", "balance", ctx1, [minter]);
    expect(bal).toBe(1000);

    // Transfer
    registry.invoke("token", "transfer", ctx1, [recipient, 300]);

    // Check balances
    expect(registry.invoke("token", "balance", ctx1, [minter])).toBe(700);
    expect(registry.invoke("token", "balance", ctx1, [recipient])).toBe(300);
  });

  it("throws on insufficient balance in transfer", () => {
    registry.deploy("token", "1.0", TRANSFER_CONTRACT, "deployer", 1);

    const ctx = createContractContext({
      stateStore,
      sender: "poor-user",
      blockHeight: 2,
      timestamp: Date.now(),
    });

    registry.invoke("token", "mint", ctx, [10]);
    expect(() => registry.invoke("token", "transfer", ctx, ["someone", 100])).toThrow(
      "Insufficient balance",
    );
  });

  it("lists deployed contracts", () => {
    registry.deploy("a", "1.0", `return { x(ctx) {} }`, "d", 1);
    registry.deploy("b", "2.0", `return { y(ctx) {} }`, "d", 1);

    const list = registry.listContracts();
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.name).sort()).toEqual(["a", "b"]);
  });

  it("throws on unknown contract", () => {
    const ctx = createContractContext({
      stateStore,
      sender: "s",
      blockHeight: 1,
      timestamp: Date.now(),
    });
    expect(() => registry.invoke("nonexistent", "foo", ctx)).toThrow("not found");
  });
});
