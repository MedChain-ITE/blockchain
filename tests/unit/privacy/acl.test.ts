import { describe, it, expect } from "vitest";
import { createACL, canRead, canWrite } from "../../../src/privacy/acl";
import { generateKeyPair } from "../../../src/identity/keypair";
import { encryptForACL, decryptRecord } from "../../../src/privacy/policy";

describe("ACL", () => {
  const owner = generateKeyPair();
  const reader = generateKeyPair();
  const stranger = generateKeyPair();

  it("owner can read and write", () => {
    const acl = createACL(owner.publicKey);
    expect(canRead(acl, owner.publicKey)).toBe(true);
    expect(canWrite(acl, owner.publicKey)).toBe(true);
  });

  it("stranger cannot read private record", () => {
    const acl = createACL(owner.publicKey);
    expect(canRead(acl, stranger.publicKey)).toBe(false);
    expect(canWrite(acl, stranger.publicKey)).toBe(false);
  });

  it("authorized reader can read", () => {
    const acl = createACL(owner.publicKey, { readers: [reader.publicKey] });
    expect(canRead(acl, reader.publicKey)).toBe(true);
    expect(canWrite(acl, reader.publicKey)).toBe(false);
  });

  it("public records are readable by anyone", () => {
    const acl = createACL(owner.publicKey, { public: true });
    expect(canRead(acl, stranger.publicKey)).toBe(true);
    expect(canWrite(acl, stranger.publicKey)).toBe(false);
  });

  it("authorized writer can write", () => {
    const acl = createACL(owner.publicKey, { writers: [reader.publicKey] });
    expect(canWrite(acl, reader.publicKey)).toBe(true);
  });
});

describe("Encrypted Records", () => {
  const owner = generateKeyPair();
  const reader = generateKeyPair();
  const stranger = generateKeyPair();

  it("encrypts and decrypts for owner", () => {
    const acl = createACL(owner.publicKey);
    const record = encryptForACL(
      JSON.stringify({ secret: "data" }),
      acl,
      owner.privateKey,
      owner.publicKey,
    );

    expect(record.ciphertext).toBeTruthy();
    expect(record.encryptedKeys[owner.publicKey]).toBeTruthy();

    const decrypted = decryptRecord(record, owner.privateKey, owner.publicKey);
    expect(decrypted).not.toBeNull();
    expect(JSON.parse(decrypted!)).toEqual({ secret: "data" });
  });

  it("encrypts for owner and authorized reader", () => {
    const acl = createACL(owner.publicKey, { readers: [reader.publicKey] });
    const record = encryptForACL(
      "shared secret",
      acl,
      owner.privateKey,
      owner.publicKey,
    );

    // Owner can decrypt
    const ownerDecrypted = decryptRecord(record, owner.privateKey, owner.publicKey);
    expect(ownerDecrypted).toBe("shared secret");

    // Reader can decrypt
    const readerDecrypted = decryptRecord(record, reader.privateKey, reader.publicKey);
    expect(readerDecrypted).toBe("shared secret");
  });

  it("stranger cannot decrypt", () => {
    const acl = createACL(owner.publicKey);
    const record = encryptForACL("secret", acl, owner.privateKey, owner.publicKey);

    const result = decryptRecord(record, stranger.privateKey, stranger.publicKey);
    expect(result).toBeNull();
  });
});
