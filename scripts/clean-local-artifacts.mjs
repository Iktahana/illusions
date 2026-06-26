#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

const generatedDirectories = [".next", "coverage", "dist-electron", "dist-main", "out", "reviews"];

const sourceRoots = [
  "app",
  "assets",
  "build",
  "components",
  "docs",
  "electron",
  "lib",
  "packages",
  "public",
];

const candidates = generatedDirectories
  .map((relativePath) => path.join(projectRoot, relativePath))
  .filter((targetPath) => fs.existsSync(targetPath));

for (const sourceRoot of sourceRoots) {
  const absoluteRoot = path.join(projectRoot, sourceRoot);
  if (!fs.existsSync(absoluteRoot)) continue;

  const pending = [absoluteRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.name === ".DS_Store") {
        candidates.push(entryPath);
      }
    }
  }
}

if (candidates.length === 0) {
  console.log("No local artifacts found.");
  process.exit(0);
}

for (const targetPath of candidates) {
  console.log(`${apply ? "remove" : "would remove"}: ${path.relative(projectRoot, targetPath)}`);
  if (apply) fs.rmSync(targetPath, { recursive: true, force: true });
}

if (!apply) {
  console.log("Dry run only. Re-run with: npm run clean:local -- --apply");
}
