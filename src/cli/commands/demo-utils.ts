import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function createTempDir(prefix = "miniledger-demo-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
