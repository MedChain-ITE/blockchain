import { serve } from "@hono/node-server";
import type { Command } from "commander";
import { DEFAULT_CONFIG } from "../../config/index.js";
import { MiniLedgerNode } from "../../node.js";
import { createApp } from "../../api/server.js";

export function registerStart(program: Command): void {
  program
    .command("start")
    .description("Start the MiniLedger node")
    .option("-d, --data-dir <path>", "Data directory", DEFAULT_CONFIG.dataDir)
    .option("-p, --api-port <port>", "API port", String(DEFAULT_CONFIG.network.apiPort))
    .option("--p2p-port <port>", "P2P port", String(DEFAULT_CONFIG.network.p2pPort))
    .option("--peers <addresses>", "Comma-separated peer addresses (ws://host:port)")
    .option("--consensus <algo>", "Consensus algorithm (solo|raft)", DEFAULT_CONFIG.consensus.algorithm)
    .option("--no-api", "Disable REST API")
    .action(async (opts) => {
      const peers = opts.peers ? (opts.peers as string).split(",").map((s: string) => s.trim()) : [];

      const node = await MiniLedgerNode.create({
        dataDir: opts.dataDir,
        config: {
          network: {
            ...DEFAULT_CONFIG.network,
            apiPort: Number.parseInt(opts.apiPort, 10),
            p2pPort: Number.parseInt(opts.p2pPort, 10),
            peers,
          },
          consensus: {
            ...DEFAULT_CONFIG.consensus,
            algorithm: opts.consensus as "solo" | "raft",
          },
          api: {
            ...DEFAULT_CONFIG.api,
            enabled: opts.api !== false,
          },
        },
      });

      await node.init();
      await node.start();

      // Start HTTP API
      if (node.config.api.enabled) {
        const app = createApp(node);
        serve({
          fetch: app.fetch,
          port: node.config.network.apiPort,
        });

        console.log(`REST API listening on http://localhost:${node.config.network.apiPort}`);
      }

      const status = node.getStatus();
      console.log(`\nMiniLedger node running`);
      console.log(`  Node ID:    ${status.nodeId}`);
      console.log(`  Consensus:  ${node.config.consensus.algorithm}`);
      console.log(`  Height:     ${status.chainHeight}`);
      if (node.config.consensus.algorithm === "raft") {
        console.log(`  P2P Port:   ${node.config.network.p2pPort}`);
        if (peers.length > 0) console.log(`  Peers:      ${peers.join(", ")}`);
      }
      console.log(`\nPress Ctrl+C to stop\n`);

      // Graceful shutdown
      const shutdown = async () => {
        console.log("\nShutting down...");
        await node.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
}
