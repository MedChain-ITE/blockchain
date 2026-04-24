import type { ACLPolicy } from "./acl.js";
import { canRead, canWrite } from "./acl.js";
import { generateAESKey, encrypt, decrypt } from "./encryption.js";
import { derivePairwiseSecret, encryptKeyForRecipient, decryptKeyFromSender } from "./key-exchange.js";

export interface EncryptedRecord {
  /** The encrypted value (hex). */
  ciphertext: string;
  /** Per-recipient encrypted AES keys: publicKey -> encryptedAESKey (hex). */
  encryptedKeys: Record<string, string>;
  /** The ACL policy (stored in plaintext for access control). */
  acl: ACLPolicy;
  /** The sender's public key (needed for decryption key derivation). */
  senderPublicKey: string;
}

/**
 * Encrypt a value for a set of authorized readers.
 * Each reader gets a copy of the AES key encrypted with a pairwise secret
 * derived from the sender's and reader's public keys.
 */
export function encryptForACL(
  value: string,
  acl: ACLPolicy,
  _senderPrivateKey: string,
  senderPublicKey?: string,
): EncryptedRecord {
  const aesKey = generateAESKey();
  const ciphertext = encrypt(value, aesKey);
  const pubKey = senderPublicKey ?? acl.owner;

  const encryptedKeys: Record<string, string> = {};

  const allReaders = [acl.owner, ...acl.readers];
  const unique = [...new Set(allReaders)];

  for (const readerPubKey of unique) {
    const pairSecret = derivePairwiseSecret(pubKey, readerPubKey);
    encryptedKeys[readerPubKey] = encryptKeyForRecipient(aesKey, pairSecret);
  }

  return { ciphertext, encryptedKeys, acl, senderPublicKey: pubKey };
}

/**
 * Decrypt a record if the reader has access.
 * Uses the pairwise secret between the sender and reader's public keys.
 */
export function decryptRecord(
  record: EncryptedRecord,
  _readerPrivateKey: string,
  readerPublicKey: string,
): string | null {
  if (!canRead(record.acl, readerPublicKey)) {
    return null;
  }

  const encryptedAESKey = record.encryptedKeys[readerPublicKey];
  if (!encryptedAESKey) {
    return null;
  }

  // Derive the same pairwise secret: hash(sort(senderPub, readerPub))
  const pairSecret = derivePairwiseSecret(record.senderPublicKey, readerPublicKey);
  const aesKey = decryptKeyFromSender(encryptedAESKey, pairSecret);

  return decrypt(record.ciphertext, aesKey);
}

export function hasReadAccess(record: EncryptedRecord, publicKey: string): boolean {
  return canRead(record.acl, publicKey);
}

export function hasWriteAccess(record: EncryptedRecord, publicKey: string): boolean {
  return canWrite(record.acl, publicKey);
}
