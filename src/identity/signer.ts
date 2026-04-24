import * as ed from "@noble/ed25519";
import { fromHex, toHex } from "../utils.js";

/** Sign a message (hex string or raw string) with a private key. Returns hex signature. */
export function sign(message: string, privateKeyHex: string): string {
  const msgBytes = new TextEncoder().encode(message);
  const sig = ed.sign(msgBytes, fromHex(privateKeyHex));
  return toHex(sig);
}

/** Verify a signature against a message and public key. */
export function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message);
    return ed.verify(fromHex(signatureHex), msgBytes, fromHex(publicKeyHex));
  } catch {
    return false;
  }
}
