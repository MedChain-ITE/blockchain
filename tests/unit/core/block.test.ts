import { describe, it, expect } from "vitest";
import {
  createBlock,
  createGenesisBlock,
  validateBlock,
  computeBlockHash,
} from "../../../src/core/block";
import { createTestKeyPair, createTestTransaction } from "../../helpers/fixtures";
import { GENESIS_PREVIOUS_HASH, EMPTY_MERKLE_ROOT } from "../../../src/constants";

describe("Block", () => {
  const kp = createTestKeyPair();

  describe("createGenesisBlock", () => {
    it("creates a valid genesis block", () => {
      const genesis = createGenesisBlock(kp.publicKey);
      expect(genesis.height).toBe(0);
      expect(genesis.previousHash).toBe(GENESIS_PREVIOUS_HASH);
      expect(genesis.transactions).toHaveLength(0);
      expect(genesis.merkleRoot).toBe(EMPTY_MERKLE_ROOT);
      expect(genesis.proposer).toBe(kp.publicKey);
      expect(genesis.hash).toHaveLength(64);
    });

    it("genesis block passes validation", () => {
      const genesis = createGenesisBlock(kp.publicKey);
      expect(() => validateBlock(genesis)).not.toThrow();
    });
  });

  describe("createBlock", () => {
    it("creates a block with transactions", () => {
      const tx = createTestTransaction();
      const block = createBlock({
        height: 1,
        previousHash: "a".repeat(64),
        transactions: [tx],
        proposer: kp.publicKey,
        stateRoot: "b".repeat(64),
      });

      expect(block.height).toBe(1);
      expect(block.transactions).toHaveLength(1);
      expect(block.hash).toHaveLength(64);
    });
  });

  describe("validateBlock", () => {
    it("validates block chain linkage", () => {
      const genesis = createGenesisBlock(kp.publicKey);
      const block = createBlock({
        height: 1,
        previousHash: genesis.hash,
        transactions: [],
        proposer: kp.publicKey,
        stateRoot: EMPTY_MERKLE_ROOT,
      });

      expect(() => validateBlock(block, genesis)).not.toThrow();
    });

    it("rejects block with wrong previous hash", () => {
      const genesis = createGenesisBlock(kp.publicKey);
      const block = createBlock({
        height: 1,
        previousHash: "wrong".padEnd(64, "0"),
        transactions: [],
        proposer: kp.publicKey,
        stateRoot: EMPTY_MERKLE_ROOT,
      });

      expect(() => validateBlock(block, genesis)).toThrow("previousHash");
    });

    it("rejects block with wrong height", () => {
      const genesis = createGenesisBlock(kp.publicKey);
      const block = createBlock({
        height: 5,
        previousHash: genesis.hash,
        transactions: [],
        proposer: kp.publicKey,
        stateRoot: EMPTY_MERKLE_ROOT,
      });

      expect(() => validateBlock(block, genesis)).toThrow("height");
    });
  });

  describe("computeBlockHash", () => {
    it("produces deterministic hash", () => {
      const params = {
        height: 1,
        previousHash: "a".repeat(64),
        timestamp: 1000,
        merkleRoot: "b".repeat(64),
        stateRoot: "c".repeat(64),
        proposer: kp.publicKey,
      };
      const hash1 = computeBlockHash(params);
      const hash2 = computeBlockHash(params);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});
