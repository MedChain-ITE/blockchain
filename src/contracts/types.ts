export interface ContractDefinition {
  name: string;
  version: string;
  code: string; // TypeScript/JavaScript source
}

export interface ContractInstance {
  name: string;
  version: string;
  deployedAt: number;
  deployedBy: string;
}

/**
 * The context object passed to contract functions.
 * Contracts interact with state exclusively through this interface.
 */
export interface ContractContext {
  /** Read a value from world state. */
  get(key: string): unknown | null;
  /** Write a value to world state. */
  set(key: string, value: unknown): void;
  /** Delete a key from world state. */
  del(key: string): void;
  /** Get the sender (public key) of the current transaction. */
  readonly sender: string;
  /** Get the current block height. */
  readonly blockHeight: number;
  /** Get current timestamp. */
  readonly timestamp: number;
  /** Emit a log entry (stored in tx receipt). */
  log(message: string): void;
}

export type ContractFunction = (ctx: ContractContext, ...args: unknown[]) => unknown;

export interface ContractModule {
  [methodName: string]: ContractFunction;
}
