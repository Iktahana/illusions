#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = [
  "app",
  "application",
  "components",
  "contexts",
  "features",
  "lib",
  "packages",
  "platform",
  "shared",
];
const sourceExtension = /\.(?:js|mjs|ts|tsx)$/;

/**
 * Exact exceptions inherited from the pre-refactor package boundary.
 * Entries may be removed but must not be broadened. The final target is empty.
 */
export const LEGACY_PACKAGE_IMPORTS = new Map([
  [
    "packages/milkdown-plugin-japanese-novel/__tests__/paragraph-blank-roundtrip.test.ts",
    new Set(["@/lib/tab-manager/types"]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/linting-plugin/decoration-plugin.ts",
    new Set([
      "@/lib/linting",
      "@/lib/nlp-client/types",
      "@/lib/project/project-types",
      "@/shared/lib/hash-string",
      "@/shared/lib/lru-cache",
    ]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/linting-plugin/index.ts",
    new Set([
      "@/lib/linting",
      "@/lib/linting/correction-config",
      "@/lib/nlp-client/types",
      "@/lib/project/project-types",
    ]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/linting-plugin/types.ts",
    new Set([
      "@/lib/linting",
      "@/lib/linting/correction-config",
      "@/lib/nlp-client/types",
      "@/lib/project/project-types",
    ]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/linting-plugin/worker/__tests__/proxy.test.ts",
    new Set(["@/lib/linting/types", "@/lib/nlp-client/types"]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/linting-plugin/worker/linting.worker.ts",
    new Set([
      "@/lib/linting/lint-presets",
      "@/lib/linting/registry/ruleset-context-factory",
      "@/lib/linting/registry/ruleset-registry",
      "@/lib/linting/rule-registry",
      "@/lib/linting/rule-runner",
      "@/lib/linting/sdk/ruleset-types",
      "@/lib/linting/types",
    ]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/linting-plugin/worker/protocol.ts",
    new Set(["@/lib/linting/types", "@/lib/nlp-client/types"]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/linting-plugin/worker/rule-runner-proxy.ts",
    new Set([
      "@/lib/linting/lint-presets",
      "@/lib/linting/rule-registry",
      "@/lib/linting/rule-runner",
      "@/lib/linting/types",
    ]),
  ],
  [
    "packages/milkdown-plugin-japanese-novel/pos-highlight/decoration-plugin.ts",
    new Set(["@/lib/nlp-client/nlp-client", "@/lib/nlp-client/types", "@/shared/lib/lru-cache"]),
  ],
]);

export function extractModuleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)[^;]*?from\s*["']([^"']+)["']/gs,
    /import\s*["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
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

export function validateImportBoundary(filePath, specifier) {
  if (filePath.startsWith("packages/") && specifier.startsWith("@/")) {
    const allowed = LEGACY_PACKAGE_IMPORTS.get(filePath);
    if (!allowed?.has(specifier)) {
      return "package code must not import application-root aliases";
    }
  }

  if (
    /^(?:app|application|components|contexts|features|lib|packages|platform|shared)\//.test(
      filePath,
    ) &&
    (specifier === "@/electron" || specifier.startsWith("@/electron/"))
  ) {
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
    const filePath = path.relative(projectRoot, absolutePath).split(path.sep).join("/");
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
    console.log(`Import boundaries valid (${legacyCount} explicit package exceptions remain).`);
  }
}
