import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractModuleSpecifiers } from "./check-import-boundaries.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtension = /\.(?:js|mjs|ts|tsx)$/;

const retiredEditorPaths = [
  "packages/milkdown-plugin-japanese-novel",
  "src/components/BubbleMenu.tsx",
  "src/components/EditorContextMenu.tsx",
  "src/components/SelectionCounter.tsx",
  "src/lib/editor-page/linting-plugin/index.ts",
  "src/lib/editor-page/novel-editor-features",
  "src/lib/editor-page/pos-highlight",
  "src/lib/editor-page/search-highlight-plugin.ts",
  "src/lib/editor-page/use-selection-tracking.ts",
  "src/lib/editor-page/vertical-wheel-scroll.ts",
];

const forbiddenCoreImports = [
  "linting-plugin",
  "novel-editor-features",
  "pos-highlight",
  "search-highlight-plugin",
  "use-selection-tracking",
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function collectSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (sourceExtension.test(entry.name)) files.push(entryPath);
    }
  }
  return files;
}

export function checkEditorArchitecture() {
  const violations = [];
  const fail = (message) => violations.push(message);
  const manifest = readJson("package.json");
  const lock = readJson("package-lock.json");

  if (manifest.dependencies?.["@illusions-lab/milkdown-plugin-vertical-writing"] !== "1.0.1") {
    fail("vertical-writing must remain pinned to the audited 1.0.1 release");
  }
  if (!manifest.dependencies?.["@illusions-lab/milkdown-plugin-mdi"]) {
    fail("milkdown-plugin-mdi must be a runtime dependency");
  }

  for (const retiredPath of retiredEditorPaths) {
    if (fs.existsSync(path.join(repositoryRoot, retiredPath))) {
      fail(`retired editor implementation reappeared: ${retiredPath}`);
    }
  }

  const coreFiles = ["src/components/Editor.tsx", "src/components/editor/MilkdownEditor.tsx"];
  const coreSources = [];
  for (const relativePath of coreFiles) {
    const source = fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    coreSources.push(source);
    for (const specifier of extractModuleSpecifiers(source)) {
      if (forbiddenCoreImports.some((fragment) => specifier.includes(fragment))) {
        fail(`${relativePath} imports deferred application feature: ${specifier}`);
      }
    }
  }
  if (/addEventListener\([^\n]*["']wheel["']|\bonWheel\s*=/.test(coreSources.join("\n"))) {
    fail("editor core must leave wheel handling to vertical-writing");
  }

  for (const absolutePath of collectSourceFiles(path.join(repositoryRoot, "src"))) {
    const source = fs.readFileSync(absolutePath, "utf8");
    if (extractModuleSpecifiers(source).includes("@illusions-lab/mdi-core")) {
      fail(`${path.relative(repositoryRoot, absolutePath)} imports private mdi-core directly`);
    }
  }

  const packageRecord = (name) => lock.packages?.[`node_modules/${name}`];
  const mdiPlugin = packageRecord("@illusions-lab/milkdown-plugin-mdi");
  const verticalPlugin = packageRecord("@illusions-lab/milkdown-plugin-vertical-writing");
  if (!mdiPlugin || !verticalPlugin) {
    fail("official editor plugin records are missing from package-lock.json");
  } else {
    const mdiPluginEdges = { ...mdiPlugin.dependencies, ...mdiPlugin.peerDependencies };
    const verticalPluginEdges = {
      ...verticalPlugin.dependencies,
      ...verticalPlugin.peerDependencies,
    };
    if ("@illusions-lab/milkdown-plugin-vertical-writing" in mdiPluginEdges) {
      fail("milkdown-plugin-mdi must not depend on vertical-writing");
    }
    if (
      Object.keys(verticalPluginEdges).some(
        (name) => name === "@illusions-lab/mdi" || name === "@illusions-lab/milkdown-plugin-mdi",
      )
    ) {
      fail("vertical-writing must remain presentation-only and MDI-independent");
    }
  }

  for (const packageName of [
    "@illusions-lab/mdi",
    "@illusions-lab/mdi-core",
    "@milkdown/core",
    "@milkdown/ctx",
    "@milkdown/prose",
    "@milkdown/utils",
  ]) {
    const suffix = `/node_modules/${packageName}`;
    const records = Object.keys(lock.packages ?? {}).filter(
      (entry) => entry === `node_modules/${packageName}` || entry.endsWith(suffix),
    );
    if (records.length !== 1) {
      fail(`${packageName} must resolve to one runtime copy (found ${records.length})`);
    }
  }

  const globals = fs.readFileSync(path.join(repositoryRoot, "src/app/globals.css"), "utf8");
  if (!globals.includes("@illusions-lab/milkdown-plugin-vertical-writing/style.css")) {
    fail("the official vertical-writing stylesheet must be imported globally");
  }
  const typography = fs.readFileSync(
    path.join(repositoryRoot, "src/app/editor-typography.css"),
    "utf8",
  );
  if (/\bwriting-mode\s*:/.test(typography)) {
    fail("application typography must not reimplement writing-mode");
  }

  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkEditorArchitecture();
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
  } else {
    console.log("Editor architecture valid (official packages own MDI and vertical layout).");
  }
}
