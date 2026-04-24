import { sha256 } from "@noble/hashes/sha256";
import { toHex } from "../utils.js";

export function sha256Hex(data: string | Uint8Array): string {
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(sha256(input));
}

export function sha256Bytes(data: string | Uint8Array): Uint8Array {
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return sha256(input);
}
