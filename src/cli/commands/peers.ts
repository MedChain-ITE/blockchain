import type { Command } from "commander";
import { DEFAULT_CONFIG } from "../../config/index.js";

interface PeersResult {
  peers: { nodeId: string; address: string; orgId: string; status: string; chainHeight: number }[];
  count: number;
}

export function registerPeers(program: Command): void {
  const peers = program.command("peers").description("Peer management");

  peers
    .command("list")
    .description("List connected peers")
    .option("-p, --api-port <port>", "API port", String(DEFAULT_CONFIG.network.apiPort))
    .action(async (opts) => {
      try {
        const res = await fetch(`http://localhost:${opts.apiPort}/peers`);
        const data = (await res.json()) as PeersResult;
        if (data.count === 0) {
          console.log("No connected peers");
          return;
        }
        console.table(data.peers);
      } catch {
        console.error("Cannot connect to node. Is it running?");
        process.exit(1);
      }
    });
}
