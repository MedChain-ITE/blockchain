import { describe, it, expect } from "vitest";
import { generateAESKey, encrypt, decrypt } from "../../../src/privacy/encryption";

describe("Encryption", () => {
  it("encrypts and decrypts a message", () => {
    const key = generateAESKey();
    const plaintext = "Hello, encrypted world!";
    const ciphertext = encrypt(plaintext, key);

    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.length).toBeGreaterThan(0);

    const decrypted = decrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong key", () => {
    const key1 = generateAESKey();
    const key2 = generateAESKey();
    const ciphertext = encrypt("secret", key1);

    expect(() => decrypt(ciphertext, key2)).toThrow();
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const key = generateAESKey();
    const ct1 = encrypt("same", key);
    const ct2 = encrypt("same", key);
    expect(ct1).not.toBe(ct2);
  });

  it("handles empty string", () => {
    const key = generateAESKey();
    const ct = encrypt("", key);
    expect(decrypt(ct, key)).toBe("");
  });

  it("handles unicode", () => {
    const key = generateAESKey();
    const text = "Hello 世界 🌍";
    expect(decrypt(encrypt(text, key), key)).toBe(text);
  });
});
