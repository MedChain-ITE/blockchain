import type { Block, HexString, Transaction } from "../types.js";
import { ChainError } from "../errors.js";
import { createGenesisBlock, createBlock, validateBlock } from "./block.js";

/**
 * In-memory chain manager. Tracks the current chain tip and validates new blocks.
 * Backed by a storage layer for persistence.
 */
export class Chain {
  private tip: Block | null = null;
  private height = -1;

  /** Initialize chain with genesis block or restore from latest block. */
  init(latestBlock?: Block): void {
    if (latestBlock) {
      this.tip = latestBlock;
      this.height = latestBlock.height;
    }
  }

  /** Create and return a genesis block. */
  createGenesis(proposer: HexString): Block {
    if (this.height >= 0) {
      throw new ChainError("Chain already initialized");
    }
    const genesis = createGenesisBlock(proposer);
    this.tip = genesis;
    this.height = 0;
    return genesis;
  }

  /** Propose a new block with the given transactions. Returns unsigned block. */
  proposeBlock(
    transactions: Transaction[],
    proposer: HexString,
    stateRoot: HexString,
  ): Block {
    if (!this.tip) {
      throw new ChainError("Chain not initialized");
    }
    const block = createBlock({
      height: this.tip.height + 1,
      previousHash: this.tip.hash,
      transactions,
      proposer,
      stateRoot,
    });
    return block as Block;
  }

  /** Validate and append a block to the chain. */
  appendBlock(block: Block): void {
    validateBlock(block, this.tip ?? undefined);
    this.tip = block;
    this.height = block.height;
  }

  getTip(): Block | null {
    return this.tip;
  }

  getHeight(): number {
    return this.height;
  }
}
