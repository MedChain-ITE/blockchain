import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigError } from "../errors.js";
import { type MiniLedgerConfig, DEFAULT_CONFIG } from "./defaults.js";
import { configSchema } from "./schema.js";

/** Deep merge two objects (b overrides a). */
function deepMerge<T extends Record<string, unknown>>(a: T, b: Partial<T>): T {
  const result = { ...a };
  for (const key of Object.keys(b) as (keyof T)[]) {
    const val = b[key];
    if (val !== undefined && typeof val === "object" && val !== null && !Array.isArray(val)) {
      result[key] = deepMerge(
        (a[key] ?? {}) as Record<string, unknown>,
        val as Record<string, unknown>,
      ) as T[keyof T];
    } else if (val !== undefined) {
      result[key] = val as T[keyof T];
    }
  }
  return result;
}

/** Load config from file, merging with defaults. */
export function loadConfig(overrides: Partial<MiniLedgerConfig> = {}): MiniLedgerConfig {
  // Start with defaults
  let config = { ...DEFAULT_CONFIG };

  // Check for config file in data dir
  const dataDir = overrides.dataDir ?? config.dataDir;
  const configPath = path.join(dataDir, "miniledger.json");

  if (fs.existsSync(configPath)) {
    try {
      const fileContent = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      config = deepMerge(config, fileContent);
    } catch (err) {
      throw new ConfigError(`Failed to parse config file ${configPath}: ${err}`);
    }
  }

  // Apply overrides
  config = deepMerge(config, overrides as Partial<typeof config>);

  // Validate
  const result = configSchema.safeParse(config);
  if (!result.success) {
    throw new ConfigError(`Invalid configuration: ${result.error.message}`);
  }

  return result.data as MiniLedgerConfig;
}

/** Save config to the data directory. */
export function saveConfig(config: MiniLedgerConfig): void {
  const configPath = path.join(config.dataDir, "miniledger.json");
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
