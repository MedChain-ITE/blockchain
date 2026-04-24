import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { toHex, fromHex } from "../utils.js";

// ed25519 requires sha512
ed.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  for (const msg of m) h.update(msg);
  return h.digest();
};

export interface KeyPair {
  publicKey: string; // hex
  privateKey: string; // hex
}

/** Generate a new Ed25519 keypair. */
export function generateKeyPair(): KeyPair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return {
    publicKey: toHex(publicKey),
    privateKey: toHex(privateKey),
  };
}

/** Derive public key from a private key. */
export function getPublicKey(privateKeyHex: string): string {
  return toHex(ed.getPublicKey(fromHex(privateKeyHex)));
}

/** Export keypair to JSON-serializable format. */
export function exportKeyPair(kp: KeyPair): { publicKey: string; privateKey: string } {
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/** Import keypair from hex strings. */
export function importKeyPair(publicKey: string, privateKey: string): KeyPair {
  return { publicKey, privateKey };
}
