import * as crypto from "node:crypto";
import { toHex, fromHex } from "../utils.js";

/**
 * Generate a random AES-256 key (32 bytes).
 */
export function generateAESKey(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(32));
}

/**
 * Encrypt data with AES-256-GCM.
 * Returns hex-encoded: iv (12 bytes) + ciphertext + authTag (16 bytes).
 */
export function encrypt(plaintext: string, key: Uint8Array): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine: iv + ciphertext + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return toHex(new Uint8Array(combined));
}

/**
 * Decrypt data encrypted with AES-256-GCM.
 * Input is hex-encoded: iv (12 bytes) + ciphertext + authTag (16 bytes).
 */
export function decrypt(ciphertextHex: string, key: Uint8Array): string {
  const combined = Buffer.from(fromHex(ciphertextHex));
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(12, combined.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
