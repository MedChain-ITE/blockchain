import type { HexString, Transaction, TxPayload, TxType } from "../types.js";
import { ValidationError } from "../errors.js";
import { nowMs } from "../utils.js";
import { sha256Hex } from "./hash.js";
import { canonicalize } from "./serialization.js";

export interface CreateTxParams {
  type: TxType;
  sender: HexString;
  nonce: number;
  payload: TxPayload;
  timestamp?: number;
}

/** Compute the canonical hash of a transaction (excludes hash and signature fields). */
export function computeTxHash(tx: CreateTxParams): string {
  const canonical = canonicalize({
    type: tx.type,
    sender: tx.sender,
    nonce: tx.nonce,
    timestamp: tx.timestamp,
    payload: tx.payload,
  });
  return sha256Hex(canonical);
}

/** Create an unsigned transaction. Signature must be added separately. */
export function createTransaction(params: CreateTxParams): Omit<Transaction, "signature"> & { signature: "" } {
  const timestamp = params.timestamp ?? nowMs();
  const withTimestamp = { ...params, timestamp };
  const hash = computeTxHash(withTimestamp);
  return {
    hash,
    type: params.type,
    sender: params.sender,
    nonce: params.nonce,
    timestamp,
    payload: params.payload,
    signature: "",
  };
}

/** Validate a transaction's structural integrity (does not check signature). */
export function validateTransaction(tx: Transaction): void {
  if (!tx.hash || tx.hash.length !== 64) {
    throw new ValidationError("Invalid transaction hash");
  }
  if (!tx.sender || tx.sender.length !== 64) {
    throw new ValidationError("Invalid sender public key");
  }
  if (tx.nonce < 0 || !Number.isInteger(tx.nonce)) {
    throw new ValidationError("Invalid nonce");
  }
  if (!tx.payload || !tx.payload.kind) {
    throw new ValidationError("Missing transaction payload");
  }

  // Verify hash matches content
  const expectedHash = computeTxHash({
    type: tx.type,
    sender: tx.sender,
    nonce: tx.nonce,
    timestamp: tx.timestamp,
    payload: tx.payload,
  });
  if (expectedHash !== tx.hash) {
    throw new ValidationError("Transaction hash mismatch");
  }
}
