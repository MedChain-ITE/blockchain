import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { generateKeyPair, encryptKeystore, serializeKeystore } from "../../identity/index.js";
import { DEFAULT_CONFIG } from "../../config/index.js";
import { GENESIS_PROPOSER } from "../../constants.js";
import { MiniLedgerDB } from "../../storage/database.js";
import { BlockStore } from "../../storage/block-store.js";
import { Chain } from "../../core/chain.js";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize a new MiniLedger node")
    .option("-d, --data-dir <path>", "Data directory", DEFAULT_CONFIG.dataDir)
    .option("-n, --name <name>", "Node name", DEFAULT_CONFIG.node.name)
    .option("-o, --org <orgId>", "Organization ID", DEFAULT_CONFIG.node.orgId)
    .action((opts) => {
      const dataDir = opts.dataDir as string;

      if (fs.existsSync(path.join(dataDir, "ledger.db"))) {
        console.log(`Node already initialized at ${dataDir}`);
        return;
      }

      // Create data directory
      fs.mkdirSync(dataDir, { recursive: true });

      // Generate keypair
      const keyPair = generateKeyPair();
      const ks = encryptKeystore(keyPair, "", opts.org, opts.name);
      fs.writeFileSync(path.join(dataDir, "keystore.json"), serializeKeystore(ks));

      // Save config
      const config = {
        ...DEFAULT_CONFIG,
        dataDir,
        node: {
          ...DEFAULT_CONFIG.node,
          name: opts.name,
          orgId: opts.org,
        },
      };
      fs.writeFileSync(path.join(dataDir, "miniledger.json"), JSON.stringify(config, null, 2));

      // Create database and genesis block
      const db = new MiniLedgerDB(path.join(dataDir, "ledger.db"));
      db.migrate();

      const blockStore = new BlockStore(db.raw());
      const chain = new Chain();
      const genesis = chain.createGenesis(GENESIS_PROPOSER);
      blockStore.insert(genesis);
      db.close();

      console.log(`MedChain initialized at ${dataDir}`);
      console.log(`  Node ID:    ${keyPair.publicKey.substring(0, 16)}`);
      console.log(`  Public Key: ${keyPair.publicKey}`);
      console.log(`  Org:        ${opts.org}`);
      console.log(`  Genesis:    ${genesis.hash.substring(0, 16)}...`);
      console.log(`\nStart with: miniledger start -d ${dataDir}`);
    });
}
