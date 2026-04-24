import type { NodeIdentity } from "../types.js";
import { shortId, nowMs } from "../utils.js";

export function createIdentity(
  publicKey: string,
  orgId: string,
  name: string,
  role: "admin" | "member" | "observer" = "admin",
): NodeIdentity {
  return {
    publicKey,
    nodeId: shortId(publicKey),
    orgId,
    name,
    role,
    createdAt: nowMs(),
  };
}
