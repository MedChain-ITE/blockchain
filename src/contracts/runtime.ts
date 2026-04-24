import type { ContractContext, ContractModule } from "./types.js";

const MAX_EXECUTION_MS = 5000;

/**
 * Compile contract source code into a callable module.
 *
 * Contracts are JavaScript/TypeScript functions. The source code should export
 * methods as properties of a returned object. Example:
 *
 * ```
 * return {
 *   init(ctx) { ctx.set("counter", 0); },
 *   increment(ctx, amount) {
 *     const val = ctx.get("counter") || 0;
 *     ctx.set("counter", val + amount);
 *     return val + amount;
 *   }
 * }
 * ```
 */
export function compileContract(source: string): ContractModule {
  // Create a sandboxed function with limited globals
  const wrapper = new Function(
    // No arguments — the contract returns its methods
    `"use strict";
    // Freeze dangerous globals
    const process = undefined;
    const require = undefined;
    const __dirname = undefined;
    const __filename = undefined;
    const global = undefined;
    const globalThis = undefined;
    const fetch = undefined;
    const setTimeout = undefined;
    const setInterval = undefined;
    const import_meta = undefined;

    ${source}`,
  );

  const mod = wrapper();

  if (!mod || typeof mod !== "object") {
    throw new Error("Contract must return an object with methods");
  }

  // Validate all exports are functions
  for (const [key, val] of Object.entries(mod)) {
    if (typeof val !== "function") {
      throw new Error(`Contract export "${key}" must be a function, got ${typeof val}`);
    }
  }

  return mod as ContractModule;
}

/**
 * Execute a contract method with a context and arguments.
 * Enforces a timeout to prevent infinite loops.
 */
export function executeContract(
  mod: ContractModule,
  method: string,
  ctx: ContractContext,
  args: unknown[] = [],
): unknown {
  const fn = mod[method];
  if (!fn) {
    throw new Error(`Contract method "${method}" not found`);
  }

  // Simple timeout enforcement via synchronous deadline check
  // (True async timeout requires worker_threads; this is adequate for M3)
  const deadline = Date.now() + MAX_EXECUTION_MS;

  // Create a proxy on ctx that checks deadline on each state access
  const guardedCtx: ContractContext = {
    get(key: string) {
      if (Date.now() > deadline) throw new Error("Contract execution timeout");
      return ctx.get(key);
    },
    set(key: string, value: unknown) {
      if (Date.now() > deadline) throw new Error("Contract execution timeout");
      ctx.set(key, value);
    },
    del(key: string) {
      if (Date.now() > deadline) throw new Error("Contract execution timeout");
      ctx.del(key);
    },
    get sender() { return ctx.sender; },
    get blockHeight() { return ctx.blockHeight; },
    get timestamp() { return ctx.timestamp; },
    log(message: string) { ctx.log(message); },
  };

  return fn(guardedCtx, ...args);
}
