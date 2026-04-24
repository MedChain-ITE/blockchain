import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MiniLedgerDB } from "../../../src/storage/database";
import { BlockStore } from "../../../src/storage/block-store";
import { createGenesisBlock, createBlock } from "../../../src/core/block";
import { createTestKeyPair } from "../../helpers/fixtures";
import { createTempDir, removeTempDir } from "../../helpers/cleanup";
import { EMPTY_MERKLE_ROOT } from "../../../src/constants";
import * as path from "node:path";

describe("BlockStore", () => {
  let tmpDir: string;
  let db: MiniLedgerDB;
  let store: BlockStore;
  const kp = createTestKeyPair();

  beforeEach(() => {
    tmpDir = createTempDir();
    db = new MiniLedgerDB(path.join(tmpDir, "test.db"));
    db.migrate();
    store = new BlockStore(db.raw());
  });

  afterEach(() => {
    db.close();
    removeTempDir(tmpDir);
  });

  it("inserts and retrieves genesis block", () => {
    const genesis = createGenesisBlock(kp.publicKey);
    store.insert(genesis);

    const retrieved = store.getByHeight(0);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.hash).toBe(genesis.hash);
    expect(retrieved!.height).toBe(0);
  });

  it("retrieves by hash", () => {
    const genesis = createGenesisBlock(kp.publicKey);
    store.insert(genesis);

    const retrieved = store.getByHash(genesis.hash);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.height).toBe(0);
  });

  it("gets latest block", () => {
    const genesis = createGenesisBlock(kp.publicKey);
    store.insert(genesis);

    const block1 = createBlock({
      height: 1,
      previousHash: genesis.hash,
      transactions: [],
      proposer: kp.publicKey,
      stateRoot: EMPTY_MERKLE_ROOT,
    });
    store.insert(block1);

    const latest = store.getLatest();
    expect(latest!.height).toBe(1);
  });

  it("gets range of blocks", () => {
    const genesis = createGenesisBlock(kp.publicKey);
    store.insert(genesis);

    let prev = genesis;
    for (let i = 1; i <= 5; i++) {
      const block = createBlock({
        height: i,
        previousHash: prev.hash,
        transactions: [],
        proposer: kp.publicKey,
        stateRoot: EMPTY_MERKLE_ROOT,
      });
      store.insert(block);
      prev = block;
    }

    const range = store.getRange(2, 4);
    expect(range).toHaveLength(3);
    expect(range[0]!.height).toBe(2);
    expect(range[2]!.height).toBe(4);
  });

  it("returns correct height", () => {
    expect(store.getHeight()).toBe(-1);
    store.insert(createGenesisBlock(kp.publicKey));
    expect(store.getHeight()).toBe(0);
  });
});
