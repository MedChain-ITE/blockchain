import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { generateKeyPair, deserializeKeystore, decryptKeystore } from "../../identity/index.js";
import { DEFAULT_CONFIG } from "../../config/index.js";

export function registerKeys(program: Command): void {
  const keys = program.command("keys").description("Key management");

  keys
    .command("generate")
    .description("Generate a new keypair")
    .action(() => {
      const kp = generateKeyPair();
      console.log(`Public Key:  ${kp.publicKey}`);
      console.log(`Private Key: ${kp.privateKey}`);
    });

  keys
    .command("show")
    .description("Show the node's public key")
    .option("-d, --data-dir <path>", "Data directory", DEFAULT_CONFIG.dataDir)
    .action((opts) => {
      const keystorePath = path.join(opts.dataDir, "keystore.json");
      if (!fs.existsSync(keystorePath)) {
        console.error("No keystore found. Run 'miniledger init' first.");
        process.exit(1);
      }
      const ks = deserializeKeystore(fs.readFileSync(keystorePath, "utf-8"));
      const kp = decryptKeystore(ks, "");
      console.log(`Public Key: ${kp.publicKey}`);
      console.log(`Node ID:    ${kp.publicKey.substring(0, 16)}`);
    });
}
