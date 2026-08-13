import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = [
  "src/app",
  "src/application",
  "src/components",
  "src/contexts",
  "src/features",
  "src/lib",
  "src/platform",
  "src/shared",
  "packages",
];
const sourceExtension = /\.(?:js|mjs|ts|tsx)$/;

/**
 * Exact exceptions inherited from the pre-refactor package boundary.
 * Entries may be removed but must not be broadened. The final target is empty.
 */
export const LEGACY_PACKAGE_IMPORTS = new Map();

/**
 * Exact browser-adapter imports that predate the Electron-only boundary.
 * Entries may be removed as callers are migrated, but neither file paths nor
 * specifiers may be broadened. The final target is empty.
 */
export const LEGACY_BROWSER_PLATFORM_IMPORTS = new Map([
  [
    "lib/editor-page/__tests__/project-search-vfs-integration.test.ts",
    new Set(["@/platform/browser/vfs"]),
  ],
  ["lib/nlp-client/nlp-client.ts", new Set(["@/platform/browser/nlp-client"])],
  ["lib/project/project-manager.ts", new Set(["@/platform/browser/storage"])],
  ["lib/storage/__tests__/storage-service.test.ts", new Set(["@/platform/browser/storage"])],
  ["lib/storage/storage-service.ts", new Set(["@/platform/browser/storage"])],
  ["lib/vfs/index.ts", new Set(["@/platform/browser/vfs"])],
  ["platform/browser/__tests__/storage.test.ts", new Set(["@/platform/browser/storage"])],
  ["platform/browser/__tests__/vfs-exists.test.ts", new Set(["@/platform/browser/vfs"])],
]);

/**
 * Boundary rules are expressed against layout-agnostic prefixes (lib/, shared/,
 * packages/, …). Only a leading "src/" is stripped: application code lives under
 * src/ on disk, while packages/ stays at the repository root.
 */
export function normalizeSourcePath(filePath) {
  return filePath.replace(/^src\//, "");
}

export function extractModuleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)[^;]*?from\s*["']([^"']+)["']/gs,
    /import\s*["']([^"']+)["']/g,
    /import\(\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))\s*)*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /(?:vi|jest)\.(?:doMock|mock)\(\s*["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }

  return [...new Set(specifiers)];
}

function featureName(filePath) {
  const match = filePath.match(/^features\/([^/]+)\//);
  return match?.[1] ?? null;
}

function importsBrowserPlatform(filePath, specifier) {
  if (specifier.startsWith("@/")) {
    const normalizedAlias = path.posix.normalize(specifier.slice(2));
    if (normalizedAlias === "platform/browser" || normalizedAlias.startsWith("platform/browser/")) {
      return true;
    }
  }

  if (!specifier.startsWith(".")) return false;

  const physicalFilePath =
    filePath.startsWith("src/") || filePath.startsWith("packages/") ? filePath : `src/${filePath}`;
  const resolved = normalizeSourcePath(
    path.posix.normalize(path.posix.join(path.posix.dirname(physicalFilePath), specifier)),
  );
  return resolved === "platform/browser" || resolved.startsWith("platform/browser/");
}

export function validateImportBoundary(filePath, specifier) {
  const importsBrowserAdapter = importsBrowserPlatform(filePath, specifier);
  filePath = normalizeSourcePath(filePath);
  const isApplicationSource =
    /^(?:app|application|components|contexts|features|lib|packages|platform|shared)\//.test(
      filePath,
    );

  if (isApplicationSource && specifier === "@illusions-lab/mdi-core") {
    return "application code must use the public @illusions-lab/mdi APIs, not private mdi-core";
  }

  if (
    isApplicationSource &&
    (specifier === "milkdown-plugin-japanese-novel" ||
      specifier.startsWith("milkdown-plugin-japanese-novel/"))
  ) {
    return "removed Japanese-novel editor package must not be reintroduced";
  }

  if (filePath.startsWith("packages/") && specifier.startsWith("@/")) {
    const allowed = LEGACY_PACKAGE_IMPORTS.get(filePath);
    if (!allowed?.has(specifier)) {
      return "package code must not import application-root aliases";
    }
  }

  if (isApplicationSource && importsBrowserAdapter) {
    const allowed = LEGACY_BROWSER_PLATFORM_IMPORTS.get(filePath);
    if (!allowed?.has(specifier)) {
      return "renderer/application code must not add browser-platform adapter imports";
    }
  }

  if (isApplicationSource && (specifier === "@/electron" || specifier.startsWith("@/electron/"))) {
    return "renderer/shared code must access Electron through preload adapters, not main modules";
  }

  if (
    filePath.startsWith("shared/") &&
    (/^@\/(?:application|features|electron)(?:\/|$)/.test(specifier) ||
      /^(?:\.\.\/)+(?:application|features|electron)(?:\/|$)/.test(specifier))
  ) {
    return "shared code must not depend on application, feature, or Electron-main code";
  }

  const owner = featureName(filePath);
  const privateFeatureImport = specifier.match(
    /^@\/features\/([^/]+)\/(?:model|ui|worker|internal)(?:\/|$)/,
  );
  if (owner && privateFeatureImport && privateFeatureImport[1] !== owner) {
    return `feature '${owner}' must import feature '${privateFeatureImport[1]}' through its public entrypoint`;
  }

  return null;
}

function collectSourceFiles() {
  const files = [];
  const pending = sourceRoots
    .map((root) => path.join(projectRoot, root))
    .filter((root) => fs.existsSync(root));

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (sourceExtension.test(entry.name)) files.push(entryPath);
    }
  }

  return files;
}

export function checkRepositoryBoundaries() {
  const violations = [];
  for (const absolutePath of collectSourceFiles()) {
    const filePath = normalizeSourcePath(
      path.relative(projectRoot, absolutePath).split(path.sep).join("/"),
    );
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const specifier of extractModuleSpecifiers(source)) {
      const reason = validateImportBoundary(filePath, specifier);
      if (reason) violations.push({ filePath, specifier, reason });
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkRepositoryBoundaries();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.filePath}: ${violation.specifier} — ${violation.reason}`);
    }
    process.exitCode = 1;
  } else {
    const legacyCount = [...LEGACY_PACKAGE_IMPORTS.values()].reduce(
      (count, entries) => count + entries.size,
      0,
    );
    const browserLegacyCount = [...LEGACY_BROWSER_PLATFORM_IMPORTS.values()].reduce(
      (count, entries) => count + entries.size,
      0,
    );
    console.log(
      `Import boundaries valid (${legacyCount} explicit package exceptions and ${browserLegacyCount} browser-platform exceptions remain).`,
    );
  }
}
