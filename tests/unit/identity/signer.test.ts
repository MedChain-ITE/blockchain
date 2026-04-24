import { describe, it, expect } from "vitest";
import { sign, verify } from "../../../src/identity/signer";
import { generateKeyPair } from "../../../src/identity/keypair";

describe("Signer", () => {
  const kp = generateKeyPair();

  it("signs and verifies a message", () => {
    const message = "hello world";
    const sig = sign(message, kp.privateKey);
    expect(sig).toHaveLength(128); // 64 bytes hex
    expect(verify(message, sig, kp.publicKey)).toBe(true);
  });

  it("rejects invalid signature", () => {
    const message = "hello world";
    const fakeSig = "0".repeat(128);
    expect(verify(message, fakeSig, kp.publicKey)).toBe(false);
  });

  it("rejects tampered message", () => {
    const sig = sign("original", kp.privateKey);
    expect(verify("tampered", sig, kp.publicKey)).toBe(false);
  });

  it("rejects wrong public key", () => {
    const otherKp = generateKeyPair();
    const sig = sign("message", kp.privateKey);
    expect(verify("message", sig, otherKp.publicKey)).toBe(false);
  });
});
