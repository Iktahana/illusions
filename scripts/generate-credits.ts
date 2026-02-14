/**
 * Generates credits.json from production dependency licenses.
 * Usage: npx tsx scripts/generate-credits.ts
 */

import checker from "license-checker";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

interface CreditEntry {
  name: string;
  version: string;
  license: string;
  repository: string;
}

const projectRoot = resolve(__dirname, "..");

checker.init(
  {
    start: projectRoot,
    production: true,
    excludePrivatePackages: true,
  },
  (err, packages) => {
    if (err) {
      console.error("Failed to check licenses:", err);
      process.exit(1);
    }

    const credits: CreditEntry[] = Object.entries(packages)
      .map(([key, info]) => {
        const atIndex = key.lastIndexOf("@");
        const name = atIndex > 0 ? key.slice(0, atIndex) : key;
        const version = atIndex > 0 ? key.slice(atIndex + 1) : "unknown";

        return {
          name,
          version,
          license: (info.licenses as string) || "Unknown",
          repository:
            (info.repository as string) ||
            (info.url as string) ||
            "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const outDir = resolve(projectRoot, "generated");
    mkdirSync(outDir, { recursive: true });

    const outPath = resolve(outDir, "credits.json");
    writeFileSync(outPath, JSON.stringify(credits, null, 2) + "\n");
    console.log(`Generated ${credits.length} credits → ${outPath}`);
  }
);
