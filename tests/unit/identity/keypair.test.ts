import { describe, it, expect } from "vitest";
import { generateKeyPair, getPublicKey } from "../../../src/identity/keypair";

describe("KeyPair", () => {
  it("generates a valid keypair", () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toHaveLength(64);
    expect(kp.privateKey).toHaveLength(64);
  });

  it("generates unique keypairs", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });

  it("derives correct public key from private key", () => {
    const kp = generateKeyPair();
    const derivedPub = getPublicKey(kp.privateKey);
    expect(derivedPub).toBe(kp.publicKey);
  });
});
