import { describe, it, expect } from "vitest";
import { computeMerkleRoot } from "../../../src/core/merkle";
import { EMPTY_MERKLE_ROOT } from "../../../src/constants";

describe("Merkle Tree", () => {
  it("returns empty root for no hashes", () => {
    expect(computeMerkleRoot([])).toBe(EMPTY_MERKLE_ROOT);
  });

  it("returns the hash itself for single hash", () => {
    const hash = "a".repeat(64);
    expect(computeMerkleRoot([hash])).toBe(hash);
  });

  it("computes root for two hashes", () => {
    const h1 = "a".repeat(64);
    const h2 = "b".repeat(64);
    const root = computeMerkleRoot([h1, h2]);
    expect(root).toHaveLength(64);
    expect(root).not.toBe(h1);
    expect(root).not.toBe(h2);
  });

  it("produces deterministic results", () => {
    const hashes = ["aa".repeat(32), "bb".repeat(32), "cc".repeat(32)];
    expect(computeMerkleRoot(hashes)).toBe(computeMerkleRoot(hashes));
  });

  it("is order-dependent", () => {
    const h1 = "a".repeat(64);
    const h2 = "b".repeat(64);
    expect(computeMerkleRoot([h1, h2])).not.toBe(computeMerkleRoot([h2, h1]));
  });
});
