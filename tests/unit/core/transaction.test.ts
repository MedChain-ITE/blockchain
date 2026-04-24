import { describe, it, expect } from "vitest";
import { createTransaction, validateTransaction, computeTxHash } from "../../../src/core/transaction";
import { TxType } from "../../../src/types";
import { createTestKeyPair } from "../../helpers/fixtures";
import { sign } from "../../../src/identity/signer";

describe("Transaction", () => {
  const kp = createTestKeyPair();

  describe("createTransaction", () => {
    it("creates a transaction with correct hash", () => {
      const tx = createTransaction({
        type: TxType.StateSet,
        sender: kp.publicKey,
        nonce: 0,
        payload: { kind: "state:set", key: "foo", value: "bar" },
      });

      expect(tx.hash).toHaveLength(64);
      expect(tx.sender).toBe(kp.publicKey);
      expect(tx.nonce).toBe(0);
      expect(tx.signature).toBe("");
    });
  });

  describe("computeTxHash", () => {
    it("produces deterministic hash", () => {
      const params = {
        type: TxType.StateSet,
        sender: kp.publicKey,
        nonce: 0,
        payload: { kind: "state:set" as const, key: "foo", value: "bar" },
        timestamp: 1000,
      };
      expect(computeTxHash(params)).toBe(computeTxHash(params));
    });
  });

  describe("validateTransaction", () => {
    it("validates a correctly formed transaction", () => {
      const unsigned = createTransaction({
        type: TxType.StateSet,
        sender: kp.publicKey,
        nonce: 0,
        payload: { kind: "state:set", key: "foo", value: "bar" },
      });
      const sig = sign(unsigned.hash, kp.privateKey);
      const tx = { ...unsigned, signature: sig };

      expect(() => validateTransaction(tx)).not.toThrow();
    });

    it("rejects transaction with tampered hash", () => {
      const unsigned = createTransaction({
        type: TxType.StateSet,
        sender: kp.publicKey,
        nonce: 0,
        payload: { kind: "state:set", key: "foo", value: "bar" },
      });
      const tx = { ...unsigned, signature: "a".repeat(128), hash: "0".repeat(64) };

      expect(() => validateTransaction(tx)).toThrow("hash mismatch");
    });

    it("rejects transaction with negative nonce", () => {
      const unsigned = createTransaction({
        type: TxType.StateSet,
        sender: kp.publicKey,
        nonce: -1,
        payload: { kind: "state:set", key: "foo", value: "bar" },
      });

      expect(() => validateTransaction({ ...unsigned, signature: "a".repeat(128) })).toThrow("nonce");
    });
  });
});
