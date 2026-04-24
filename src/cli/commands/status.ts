import type { Command } from "commander";
import type { NodeStatus } from "../../types.js";
import { DEFAULT_CONFIG } from "../../config/index.js";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show node status")
    .option("-p, --api-port <port>", "API port", String(DEFAULT_CONFIG.network.apiPort))
    .action(async (opts) => {
      const port = opts.apiPort;
      try {
        const res = await fetch(`http://localhost:${port}/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const status = (await res.json()) as NodeStatus;
        console.log("Node Status:");
        console.log(`  Node ID:     ${status.nodeId}`);
        console.log(`  Public Key:  ${status.publicKey}`);
        console.log(`  Height:      ${status.chainHeight}`);
        console.log(`  Latest Hash: ${status.latestBlockHash?.substring(0, 16)}...`);
        console.log(`  Peers:       ${status.peerCount}`);
        console.log(`  TX Pool:     ${status.txPoolSize}`);
        console.log(`  Uptime:      ${Math.round(status.uptime / 1000)}s`);
      } catch {
        console.error(`Cannot connect to node at localhost:${port}. Is it running?`);
        process.exit(1);
      }
    });
}
