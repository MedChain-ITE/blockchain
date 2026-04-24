import { EMPTY_MERKLE_ROOT } from "../constants.js";
import { sha256Hex } from "./hash.js";

/** Compute Merkle root from a list of transaction hashes. */
export function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return EMPTY_MERKLE_ROOT;
  if (hashes.length === 1) return hashes[0]!;

  let level = [...hashes];

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left;
      next.push(sha256Hex(left + right));
    }
    level = next;
  }

  return level[0]!;
}
