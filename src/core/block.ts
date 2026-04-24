import type { Block, HexString, Transaction } from "../types.js";
import { GENESIS_PREVIOUS_HASH, GENESIS_TIMESTAMP, EMPTY_MERKLE_ROOT } from "../constants.js";
import { ValidationError } from "../errors.js";
import { sha256Hex } from "./hash.js";
import { computeMerkleRoot } from "./merkle.js";
import { canonicalize } from "./serialization.js";

export interface CreateBlockParams {
  height: number;
  previousHash: HexString;
  transactions: Transaction[];
  proposer: HexString;
  stateRoot: HexString;
  timestamp?: number;
}

/** Compute the canonical hash of a block header (excludes hash and signature). */
export function computeBlockHash(params: {
  height: number;
  previousHash: string;
  timestamp: number;
  merkleRoot: string;
  stateRoot: string;
  proposer: string;
}): string {
  const canonical = canonicalize({
    height: params.height,
    previousHash: params.previousHash,
    timestamp: params.timestamp,
    merkleRoot: params.merkleRoot,
    stateRoot: params.stateRoot,
    proposer: params.proposer,
  });
  return sha256Hex(canonical);
}

/** Create an unsigned block. Signature must be added separately. */
export function createBlock(params: CreateBlockParams): Omit<Block, "signature"> & { signature: "" } {
  const timestamp = params.timestamp ?? Date.now();
  const merkleRoot = computeMerkleRoot(params.transactions.map((tx) => tx.hash));

  const hash = computeBlockHash({
    height: params.height,
    previousHash: params.previousHash,
    timestamp,
    merkleRoot,
    stateRoot: params.stateRoot,
    proposer: params.proposer,
  });

  return {
    height: params.height,
    hash,
    previousHash: params.previousHash,
    timestamp,
    merkleRoot,
    stateRoot: params.stateRoot,
    proposer: params.proposer,
    signature: "",
    transactions: params.transactions,
  };
}

/** Create the genesis block (height 0, no transactions). */
export function createGenesisBlock(proposer: HexString): Block {
  const merkleRoot = EMPTY_MERKLE_ROOT;
  const stateRoot = EMPTY_MERKLE_ROOT;
  const timestamp = GENESIS_TIMESTAMP;

  const hash = computeBlockHash({
    height: 0,
    previousHash: GENESIS_PREVIOUS_HASH,
    timestamp,
    merkleRoot,
    stateRoot,
    proposer,
  });

  return {
    height: 0,
    hash,
    previousHash: GENESIS_PREVIOUS_HASH,
    timestamp,
    merkleRoot,
    stateRoot,
    proposer,
    signature: "",
    transactions: [],
  };
}

/** Validate a block's structural integrity (does not verify signature). */
export function validateBlock(block: Block, previousBlock?: Block): void {
  if (block.height < 0 || !Number.isInteger(block.height)) {
    throw new ValidationError(`Invalid block height: ${block.height}`);
  }

  if (previousBlock) {
    if (block.height !== previousBlock.height + 1) {
      throw new ValidationError(
        `Block height ${block.height} does not follow ${previousBlock.height}`,
      );
    }
    if (block.previousHash !== previousBlock.hash) {
      throw new ValidationError("Block previousHash does not match previous block hash");
    }
    if (block.timestamp < previousBlock.timestamp) {
      throw new ValidationError("Block timestamp is before previous block");
    }
  }

  // Verify merkle root
  const expectedMerkle = computeMerkleRoot(block.transactions.map((tx) => tx.hash));
  if (expectedMerkle !== block.merkleRoot) {
    throw new ValidationError("Block merkle root mismatch");
  }

  // Verify block hash
  const expectedHash = computeBlockHash({
    height: block.height,
    previousHash: block.previousHash,
    timestamp: block.timestamp,
    merkleRoot: block.merkleRoot,
    stateRoot: block.stateRoot,
    proposer: block.proposer,
  });
  if (expectedHash !== block.hash) {
    throw new ValidationError("Block hash mismatch");
  }
}
