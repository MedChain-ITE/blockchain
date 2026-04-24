import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "miniledger-test-"));
}

export function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
