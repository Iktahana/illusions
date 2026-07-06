/**
 * Dev-only safeguard: `generated/credits.json` is only produced by
 * `generate:credits` (run as part of `build`). Turbopack statically resolves
 * the dynamic import in AboutSection.tsx and hard-fails every request with a
 * 500 if the file is missing, instead of letting the runtime .catch() handle
 * it. Write an empty stub so dev servers can boot; `npm run generate:credits`
 * still produces the real list for production builds.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const outDir = resolve(import.meta.dirname, "..", "generated");
const outPath = resolve(outDir, "credits.json");

if (!existsSync(outPath)) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, "[]\n");
  console.log(
    "Created empty generated/credits.json stub for dev (run `npm run generate:credits` for real data)",
  );
}
