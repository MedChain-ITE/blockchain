import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    outDir: "dist",
    external: ["better-sqlite3"],
  },
  {
    entry: ["bin/medchain.ts"],
    format: ["cjs"],
    outDir: "dist/bin",
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
    external: ["better-sqlite3"],
  },
]);
