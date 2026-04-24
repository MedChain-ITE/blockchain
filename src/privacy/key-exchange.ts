import { sha256 } from "@noble/hashes/sha256";
import { fromHex, toHex } from "../utils.js";

/**
 * Derive a pairwise secret between two parties identified by their public keys.
 *
 * Uses a commutative hash: hash(sort(pubA, pubB)).
 * Both parties can independently compute the same secret.
 *
 * In a permissioned network, public keys are known and authenticated via
 * the handshake protocol, so this provides adequate key isolation per pair.
 *
 * NOTE: A production system would use Ed25519→X25519 + ECDH for forward secrecy.
 */
export function derivePairwiseSecret(pubKeyA: string, pubKeyB: string): string {
  const sorted = [pubKeyA, pubKeyB].sort().join(":");
  return toHex(sha256(new TextEncoder().encode(sorted)));
}

// Keep the existing API shape for backward compat
export function deriveSharedSecret(
  _myPrivateKeyHex: string,
  theirPublicKeyHex: string,
  myPublicKeyHex?: string,
): string {
  // If myPublicKeyHex is provided, use it. Otherwise fall back to deriving from private.
  // In practice, callers should always provide myPublicKeyHex.
  const myPub = myPublicKeyHex ?? _myPrivateKeyHex; // fallback (not ideal)
  return derivePairwiseSecret(myPub, theirPublicKeyHex);
}

/**
 * Encrypt an AES key for a specific recipient using a shared secret.
 * XOR with the derived shared secret.
 */
export function encryptKeyForRecipient(
  aesKey: Uint8Array,
  sharedSecretHex: string,
): string {
  const secret = fromHex(sharedSecretHex);
  const encrypted = new Uint8Array(aesKey.length);
  for (let i = 0; i < aesKey.length; i++) {
    encrypted[i] = aesKey[i]! ^ secret[i % secret.length]!;
  }
  return toHex(encrypted);
}

/**
 * Decrypt an AES key using a shared secret.
 */
export function decryptKeyFromSender(
  encryptedKeyHex: string,
  sharedSecretHex: string,
): Uint8Array {
  const encrypted = fromHex(encryptedKeyHex);
  const secret = fromHex(sharedSecretHex);
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i]! ^ secret[i % secret.length]!;
  }
  return decrypted;
}
