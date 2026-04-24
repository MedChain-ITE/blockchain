import type { Command } from "commander";
import { DEFAULT_CONFIG } from "../../config/index.js";

interface TxResult {
  hash?: string;
  status?: string;
  error?: string;
}

export function registerTx(program: Command): void {
  const tx = program.command("tx").description("Transaction commands");

  tx.command("submit <data>")
    .description("Submit a transaction (JSON: {key, value})")
    .option("-p, --api-port <port>", "API port", String(DEFAULT_CONFIG.network.apiPort))
    .action(async (data: string, opts) => {
      try {
        const body = JSON.parse(data);
        const res = await fetch(`http://localhost:${opts.apiPort}/tx`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await res.json()) as TxResult;
        if (!res.ok) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
        console.log(`Transaction submitted: ${result.hash}`);
      } catch (err) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  tx.command("get <hash>")
    .description("Get a transaction by hash")
    .option("-p, --api-port <port>", "API port", String(DEFAULT_CONFIG.network.apiPort))
    .action(async (hash: string, opts) => {
      try {
        const res = await fetch(`http://localhost:${opts.apiPort}/tx/${hash}`);
        const result = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          console.error(`Error: ${(result as TxResult).error}`);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
      } catch {
        console.error("Cannot connect to node. Is it running?");
        process.exit(1);
      }
    });
}
