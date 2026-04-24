import type { Command } from "commander";
import { DEFAULT_CONFIG } from "../../config/index.js";

interface QueryResult {
  results: Record<string, unknown>[];
  count: number;
  error?: string;
}

export function registerQuery(program: Command): void {
  program
    .command("query <sql>")
    .description("Query world state with SQL")
    .option("-p, --api-port <port>", "API port", String(DEFAULT_CONFIG.network.apiPort))
    .action(async (sql: string, opts) => {
      try {
        const res = await fetch(`http://localhost:${opts.apiPort}/state/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql }),
        });
        const result = (await res.json()) as QueryResult;
        if (!res.ok) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
        if (result.count === 0) {
          console.log("No results");
          return;
        }
        console.table(result.results);
      } catch {
        console.error("Cannot connect to node. Is it running?");
        process.exit(1);
      }
    });
}
