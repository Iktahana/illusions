import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Guard against broken relative require()/import paths in the Electron main
 * process. These are plain CommonJS files: tsc does not resolve their module
 * specifiers, so a directory move (e.g. the src/ layout migration, where
 * lib/ became src/lib/ while electron/lib/ stayed put) can silently break
 * them until runtime. This test statically resolves every literal relative
 * specifier — including JSDoc `import("...")` type references — against the
 * importing file's directory and fails on any that no longer exist.
 */

const electronDir = path.resolve(__dirname, "..");

const RESOLVABLE_SUFFIXES = ["", ".js", ".ts", ".tsx", ".json", "/index.js", "/index.ts"];

function collectProductionSources(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop() as string;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (/\.(?:js|mjs|ts)$/.test(entry.name)) files.push(entryPath);
    }
  }
  return files;
}

function extractRelativeSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /require\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g,
    /(?:import|export)[^;]*?from\s*["'](\.\.?\/[^"']+)["']/g,
    /import\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function resolves(baseDir: string, specifier: string): boolean {
  return RESOLVABLE_SUFFIXES.some((suffix) => {
    const candidate = path.resolve(baseDir, specifier + suffix);
    return fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory();
  });
}

describe("electron main process module resolution", () => {
  const sources = collectProductionSources(electronDir);

  it("scans a non-trivial set of production files", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it("every literal relative require/import resolves to an existing file", () => {
    const broken: string[] = [];
    for (const file of sources) {
      const source = fs.readFileSync(file, "utf8");
      for (const specifier of extractRelativeSpecifiers(source)) {
        if (!resolves(path.dirname(file), specifier)) {
          broken.push(`${path.relative(electronDir, file)} → ${specifier}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("cross-boundary requires into renderer code go through src/", () => {
    // electron/lib/ is Electron's own utility directory; renderer code must be
    // reached via ../src/lib (top-level) or ../../src/lib (one level deep).
    // A bare ../lib from a top-level electron file predates the src/ layout
    // and would resolve to a directory that no longer exists.
    const offenders: string[] = [];
    for (const file of sources) {
      if (path.dirname(file) !== electronDir) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const specifier of extractRelativeSpecifiers(source)) {
        if (/^\.\.\/(?:lib|shared|components|app|contexts|platform|types)\//.test(specifier)) {
          offenders.push(`${path.basename(file)} → ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
