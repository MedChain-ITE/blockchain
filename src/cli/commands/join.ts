import { serve } from "@hono/node-server";
import type { Command } from "commander";
import { DEFAULT_CONFIG } from "../../config/index.js";
import { MiniLedgerNode } from "../../node.js";
import { createApp } from "../../api/server.js";

export function registerJoin(program: Command): void {
  program
    .command("join <peer-address>")
    .description("Join an existing network (e.g. miniledger join ws://host:4440)")
    .option("-d, --data-dir <path>", "Data directory", DEFAULT_CONFIG.dataDir)
    .option("-p, --api-port <port>", "API port", String(DEFAULT_CONFIG.network.apiPort))
    .option("--p2p-port <port>", "P2P port", String(DEFAULT_CONFIG.network.p2pPort))
    .action(async (peerAddress: string, opts) => {
      const node = await MiniLedgerNode.create({
        dataDir: opts.dataDir,
        config: {
          network: {
            ...DEFAULT_CONFIG.network,
            apiPort: Number.parseInt(opts.apiPort, 10),
            p2pPort: Number.parseInt(opts.p2pPort, 10),
            peers: [peerAddress],
          },
          consensus: {
            ...DEFAULT_CONFIG.consensus,
            algorithm: "raft",
          },
        },
      });

      await node.init();
      await node.start();

      if (node.config.api.enabled) {
        const app = createApp(node);
        serve({
          fetch: app.fetch,
          port: node.config.network.apiPort,
        });
        console.log(`REST API listening on http://localhost:${node.config.network.apiPort}`);
      }

      const status = node.getStatus();
      console.log(`\nMiniLedger node joining network via ${peerAddress}`);
      console.log(`  Node ID:   ${status.nodeId}`);
      console.log(`  P2P Port:  ${node.config.network.p2pPort}`);
      console.log(`  Height:    ${status.chainHeight}`);
      console.log(`\nPress Ctrl+C to stop\n`);

      const shutdown = async () => {
        console.log("\nShutting down...");
        await node.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
}
