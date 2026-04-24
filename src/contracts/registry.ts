import type { StateStore } from "../storage/state-store.js";
import type { ContractInstance, ContractModule } from "./types.js";
import { compileContract, executeContract } from "./runtime.js";

const CONTRACT_PREFIX = "_contract:";
const CONTRACT_CODE_PREFIX = "_contract_code:";

/**
 * Manages deployed contracts. Contract metadata and code are stored in world state
 * with reserved key prefixes.
 */
export class ContractRegistry {
  private compiled = new Map<string, ContractModule>();
  private stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  /** Deploy a new contract or upgrade an existing one. */
  deploy(
    name: string,
    version: string,
    code: string,
    deployedBy: string,
    blockHeight: number,
  ): void {
    // Validate by compiling
    const mod = compileContract(code);
    this.compiled.set(name, mod);

    // Store metadata
    const instance: ContractInstance = {
      name,
      version,
      deployedAt: Date.now(),
      deployedBy,
    };
    this.stateStore.set(`${CONTRACT_PREFIX}${name}`, instance, deployedBy, blockHeight);
    this.stateStore.set(`${CONTRACT_CODE_PREFIX}${name}`, code, deployedBy, blockHeight);
  }

  /** Get a compiled contract module, loading from state if needed. */
  getModule(name: string): ContractModule | null {
    // Check cache
    let mod = this.compiled.get(name);
    if (mod) return mod;

    // Load from state
    const codeEntry = this.stateStore.get(`${CONTRACT_CODE_PREFIX}${name}`);
    if (!codeEntry) return null;

    mod = compileContract(codeEntry.value as string);
    this.compiled.set(name, mod);
    return mod;
  }

  /** Get contract metadata. */
  getInstance(name: string): ContractInstance | null {
    const entry = this.stateStore.get(`${CONTRACT_PREFIX}${name}`);
    return entry ? (entry.value as ContractInstance) : null;
  }

  /** Invoke a method on a deployed contract. */
  invoke(
    contractName: string,
    method: string,
    ctx: import("./types.js").ContractContext,
    args: unknown[] = [],
  ): unknown {
    const mod = this.getModule(contractName);
    if (!mod) {
      throw new Error(`Contract "${contractName}" not found`);
    }
    return executeContract(mod, method, ctx, args);
  }

  /** List all deployed contracts. */
  listContracts(): ContractInstance[] {
    const results = this.stateStore.query(
      `SELECT value FROM world_state WHERE key LIKE ?`,
      [`${CONTRACT_PREFIX}%`],
    );
    return results
      .map((r) => {
        try {
          return JSON.parse(r.value as string) as ContractInstance;
        } catch {
          return null;
        }
      })
      .filter((c): c is ContractInstance => c !== null);
  }

  /** Clear compiled cache (useful after chain reorg). */
  clearCache(): void {
    this.compiled.clear();
  }
}
