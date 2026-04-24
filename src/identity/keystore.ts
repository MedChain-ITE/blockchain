import { sha256 } from "@noble/hashes/sha256";
import { toHex, fromHex } from "../utils.js";
import type { KeyPair } from "./keypair.js";

interface KeystoreFile {
  version: 1;
  publicKey: string;
  encryptedPrivateKey: string;
  salt: string;
  orgId: string;
  name: string;
}

/**
 * Simple keystore: XOR the private key with a password-derived key.
 * This is a minimal implementation for M1. A production version would use
 * AES-256-GCM with scrypt key derivation.
 */
function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  // Simple PBKDF: hash(password + salt) repeated
  let key = sha256(new TextEncoder().encode(password + toHex(salt)));
  for (let i = 0; i < 10000; i++) {
    key = sha256(key);
  }
  return key;
}

export function encryptKeystore(
  keyPair: KeyPair,
  password: string,
  orgId: string,
  name: string,
): KeystoreFile {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = deriveKey(password, salt);
  const privBytes = fromHex(keyPair.privateKey);
  const encrypted = new Uint8Array(privBytes.length);
  for (let i = 0; i < privBytes.length; i++) {
    encrypted[i] = privBytes[i]! ^ derived[i % derived.length]!;
  }

  return {
    version: 1,
    publicKey: keyPair.publicKey,
    encryptedPrivateKey: toHex(encrypted),
    salt: toHex(salt),
    orgId,
    name,
  };
}

export function decryptKeystore(keystore: KeystoreFile, password: string): KeyPair {
  const salt = fromHex(keystore.salt);
  const derived = deriveKey(password, salt);
  const encrypted = fromHex(keystore.encryptedPrivateKey);
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i]! ^ derived[i % derived.length]!;
  }

  return {
    publicKey: keystore.publicKey,
    privateKey: toHex(decrypted),
  };
}

export function serializeKeystore(keystore: KeystoreFile): string {
  return JSON.stringify(keystore, null, 2);
}

export function deserializeKeystore(data: string): KeystoreFile {
  return JSON.parse(data) as KeystoreFile;
}
