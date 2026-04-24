import { serve } from "@hono/node-server";
import { exec } from "node:child_process";
import type { Command } from "commander";
import { MiniLedgerNode } from "../../node.js";
import { TxType } from "../../types.js";
import { createApp } from "../../api/server.js";
import { MEDCHAIN_CONTRACT } from "../../../examples/medchain/contracts.js"; // ✅ use your new contract
import { createTempDir } from "./demo-utils.js";

export function registerDemo(program: Command): void {
  program
      .command("demo")
      .description("Run a 3-node MedChain demo cluster")
      .option("-p, --port <port>", "API port", "4441")
      .action(async (opts) => {
        const apiPort = Number.parseInt(opts.port, 10);

        console.log("\n🏥 MedChain Demo Cluster\n");

        const dirs: string[] = [];
        const nodes: MiniLedgerNode[] = [];

        try {
          // ----------------------
          // CREATE NODES
          // ----------------------
          for (let i = 0; i < 3; i++) {
            const dir = createTempDir(`medchain-node${i + 1}-`);
            dirs.push(dir);

            const peers = i > 0 ? [`ws://127.0.0.1:${5440}`] : [];

            const node = await MiniLedgerNode.create({
              dataDir: dir,
              config: {
                node: {
                  name: `node-${i + 1}`,
                  orgId: `hospital-${i + 1}`,
                  role: "validator",
                },
                network: {
                  listenAddress: "127.0.0.1",
                  p2pPort: 5440 + i * 2,
                  apiPort: apiPort + i * 2,
                  peers,
                  maxPeers: 50,
                },
                consensus: {
                  algorithm: "raft",
                  blockTimeMs: 1000,
                  maxTxPerBlock: 500,
                },
                logging: { level: "warn" },
                api: { enabled: true, cors: true },
              },
            });

            await node.init();
            nodes.push(node);
          }

          // ----------------------
          // START NODES
          // ----------------------
          for (let i = 0; i < nodes.length; i++) {
            await nodes[i]!.start();
            const app = createApp(nodes[i]!);

            serve({ fetch: app.fetch, port: apiPort + i * 2 });

            console.log(
                `Node ${i + 1}: http://localhost:${apiPort + i * 2}`
            );

            if (i === 0) await sleep(500);
          }

          console.log("\n⏳ Waiting for leader election...");
          await sleep(5000);

          const leader =
              nodes.find((n) => n.getRaft()?.isLeader()) ?? nodes[0]!;

          console.log(`✅ Leader: Node ${nodes.indexOf(leader) + 1}\n`);

          // ----------------------
          // MEDCHAIN SETUP
          // ----------------------
          console.log("📦 Deploying MedChain contract...");

          await leader.submit({
            type: TxType.ContractDeploy,
            payload: {
              kind: "contract:deploy",
              name: "medchain",
              version: "1.0",
              code: MEDCHAIN_CONTRACT,
            },
          });

          await sleep(1500);

          // ----------------------
          // REGISTER PATIENT
          // ----------------------
          console.log("👤 Register patient...");

          await leader.submit({
            type: TxType.ContractInvoke,
            payload: {
              kind: "contract:invoke",
              contract: "medchain",
              method: "registerPatient",
              args: [
                "PAT-001",
                {
                  name: "La Seavyong",
                  age: 22,
                  bloodType: "O+",
                },
              ],
            },
          });

          await sleep(1500);

          // ----------------------
          // GRANT ACCESS
          // ----------------------
          const doctor = "doctor-0xabc";

          console.log("🔐 Grant doctor access...");

          await leader.submit({
            type: TxType.ContractInvoke,
            payload: {
              kind: "contract:invoke",
              contract: "medchain",
              method: "grantAccess",
              args: ["PAT-001", doctor],
            },
          });

          await sleep(1500);

          // ----------------------
          // ADD RECORDS
          // ----------------------
          console.log("📝 Add medical records...");

          const records = [
            ["REC-001", { diagnosis: "Fever", treatment: "Paracetamol" }],
            ["REC-002", { diagnosis: "Flu", treatment: "Rest" }],
            ["REC-003", { diagnosis: "Checkup", result: "Healthy" }],
          ];

          for (const [id, data] of records) {
            await leader.submit({
              type: TxType.ContractInvoke,
              payload: {
                kind: "contract:invoke",
                contract: "medchain",
                method: "addRecord",
                args: ["PAT-001", id, data],
              },
            });

            await sleep(1000);
          }

          // ----------------------
          // STATUS
          // ----------------------
          const status = leader.getStatus();

          console.log("\n✅ MedChain running!");
          console.log(`Chain height: ${status.chainHeight}`);
          console.log(`Peers: ${status.peerCount}`);

          console.log(`\n🌐 Dashboard: http://localhost:${apiPort}/dashboard`);
          console.log("\nPress Ctrl+C to stop\n");

          openBrowser(`http://localhost:${apiPort}/dashboard`);

          // ----------------------
          // SHUTDOWN
          // ----------------------
          const shutdown = async () => {
            console.log("\nShutting down...");
            for (const node of nodes) await node.stop();

            process.exit(0);
          };

          process.on("SIGINT", shutdown);
          process.on("SIGTERM", shutdown);
        } catch (err) {
          console.error("❌ Demo failed:", err);
          for (const node of nodes) await node.stop().catch(() => {});
          process.exit(1);
        }
      });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function openBrowser(url: string) {
  const cmd =
      process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
              ? "start"
              : "xdg-open";

  exec(`${cmd} ${url}`);
}