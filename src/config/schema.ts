import { z } from "zod";

export const configSchema = z.object({
  dataDir: z.string(),
  node: z.object({
    name: z.string(),
    orgId: z.string(),
    role: z.enum(["validator", "observer"]),
  }),
  network: z.object({
    listenAddress: z.string(),
    p2pPort: z.number().int().min(1).max(65535),
    apiPort: z.number().int().min(1).max(65535),
    peers: z.array(z.string()),
    maxPeers: z.number().int().min(1),
  }),
  consensus: z.object({
    algorithm: z.enum(["raft", "solo"]),
    blockTimeMs: z.number().int().min(100),
    maxTxPerBlock: z.number().int().min(1),
  }),
  api: z.object({
    enabled: z.boolean(),
    cors: z.boolean(),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]),
  }),
});
