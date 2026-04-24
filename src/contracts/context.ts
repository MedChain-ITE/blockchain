import type { StateStore } from "../storage/state-store.js";
import type { ContractContext } from "./types.js";

export interface ContextOptions {
  stateStore: StateStore;
  sender: string;
  blockHeight: number;
  timestamp: number;
}

/**
 * Creates a ContractContext that contracts use to interact with the ledger.
 * All state mutations go through the StateStore.
 */
export function createContractContext(opts: ContextOptions): ContractContext & { getLogs(): string[] } {
  const logs: string[] = [];

  return {
    get(key: string): unknown | null {
      const entry = opts.stateStore.get(key);
      return entry ? entry.value : null;
    },

    set(key: string, value: unknown): void {
      opts.stateStore.set(key, value, opts.sender, opts.blockHeight);
    },

    del(key: string): void {
      opts.stateStore.delete(key);
    },

    get sender() {
      return opts.sender;
    },

    get blockHeight() {
      return opts.blockHeight;
    },

    get timestamp() {
      return opts.timestamp;
    },

    log(message: string): void {
      logs.push(message);
    },

    getLogs(): string[] {
      return logs;
    },
  };
}
