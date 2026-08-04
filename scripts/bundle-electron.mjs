#!/usr/bin/env node
/**
 * Bundle Electron main and preload scripts with esbuild
 * This dramatically reduces the number of files in the app bundle,
 * which speeds up code signing and notarization.
 */

import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { execFileSync, execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// On Windows, npx is a .cmd shim; execFileSync (unlike execSync) doesn't
// go through a shell, so it needs the literal .cmd extension to resolve it.
const NPX_CMD = process.platform === "win32" ? "npx.cmd" : "npx";

const targetArchIndex = process.argv.indexOf("--target-arch");
const targetArch = targetArchIndex !== -1 ? process.argv[targetArchIndex + 1] : process.arch;
console.log(`🏗️  Target architecture: ${targetArch}`);

const outDir = join(projectRoot, "dist-main");

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log("📦 Bundling Electron main process...");

// Bundle main process
await esbuild.build({
  entryPoints: [join(projectRoot, "electron", "main.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: join(outDir, "main.js"),
  external: [
    "electron",
    // kuromoji needs to load dictionary files at runtime
    // We'll copy them separately as extraResources
    "kuromoji",
    // better-sqlite3 is a native module
    "better-sqlite3",
    // node-pty is a native module for terminal support
    "node-pty",
    // macOS-only native bridge for ASWebAuthenticationSession
    "@illusions/as-web-authentication",
    // wasm-pack's Node loader resolves mdi_core_bg.wasm relative to its own
    // package directory. Keep that loader external so esbuild does not flatten
    // __dirname to dist-main/ and separate it from the WASM asset.
    "@illusions-lab/mdi-core",
  ],
  define: {
    "process.env.APTABASE_APP_KEY": JSON.stringify(process.env.APTABASE_APP_KEY || ""),
    "process.env.APTABASE_HOST": JSON.stringify(process.env.APTABASE_HOST || ""),
    "process.env.ERROR_REPORT_DSN": JSON.stringify(process.env.ERROR_REPORT_DSN || ""),
  },
  format: "cjs",
  minify: false, // Keep readable for debugging
  sourcemap: true,
  logLevel: "info",
});

console.log("✅ Main process bundled to dist-main/main.js");

// Guard the asset boundary itself: if mdi-core is accidentally bundled again,
// wasm-pack will resolve its WASM relative to dist-main/main.js in packaged apps.
const mainBundleSource = fs.readFileSync(join(outDir, "main.js"), "utf-8");
if (!mainBundleSource.includes('require("@illusions-lab/mdi-core")')) {
  throw new Error("Electron main bundle did not preserve @illusions-lab/mdi-core as external");
}
if (mainBundleSource.includes("/mdi_core_bg.wasm")) {
  throw new Error("Electron main bundle flattened the mdi-core WASM loader");
}

console.log("📦 Bundling Electron preload script...");

// Bundle preload script
await esbuild.build({
  entryPoints: [join(projectRoot, "electron", "preload.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: join(outDir, "preload.js"),
  external: ["electron"],
  format: "cjs",
  minify: false,
  sourcemap: true,
  logLevel: "info",
});

console.log("✅ Preload script bundled to dist-main/preload.js");

// Copy runtime dependencies that cannot be bundled
console.log("📦 Copying runtime dependencies for external modules...");

const nodeModulesDest = join(outDir, "node_modules");

// Clean destination to prevent stale binaries from a previous arch
if (fs.existsSync(nodeModulesDest)) {
  fs.rmSync(nodeModulesDest, { recursive: true });
}
fs.mkdirSync(nodeModulesDest, { recursive: true });

/**
 * Collect a package and all its production dependencies (transitive).
 * Handles hoisted dependencies by searching from the project root node_modules.
 * @param {string} pkgName
 * @param {Set<string>} collected
 */
function collectDepsRecursive(pkgName, collected) {
  if (collected.has(pkgName)) return;
  collected.add(pkgName);

  // Try nested node_modules first (for version-conflicting deps), then hoisted
  const pkgJsonPaths = [join(projectRoot, "node_modules", pkgName, "package.json")];
  // Also check if the package is nested inside any of its dependents
  for (const parent of collected) {
    if (parent !== pkgName) {
      pkgJsonPaths.unshift(
        join(projectRoot, "node_modules", parent, "node_modules", pkgName, "package.json"),
      );
    }
  }

  for (const pkgJsonPath of pkgJsonPaths) {
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
        const deps = pkg.dependencies || {};
        for (const dep of Object.keys(deps)) {
          collectDepsRecursive(dep, collected);
        }
      } catch {
        // Ignore unreadable package.json
      }
      return;
    }
  }
}

// Root external modules that cannot be bundled by esbuild
// kuromoji: dictionary loading at runtime; better-sqlite3: native addon
// node-pty: terminal support, but the MAS build gates it out entirely at
// runtime (electron/ipc/pty-ipc.js), so it's excluded from the MAS bundle
// too — App Store review treats bundled shell-spawn binaries as a rejection
// risk even when the code path is dead (docs/release/mac-app-store.md).
const isMasBuild = process.env.MAS_BUILD === "1";
const externalRoots = isMasBuild
  ? ["kuromoji", "better-sqlite3", "@illusions/as-web-authentication", "@illusions-lab/mdi-core"]
  : [
      "kuromoji",
      "better-sqlite3",
      "node-pty",
      "@illusions/as-web-authentication",
      "@illusions-lab/mdi-core",
    ];

// Collect all transitive production dependencies
const allDeps = new Set();
for (const root of externalRoots) {
  collectDepsRecursive(root, allDeps);
}

// Sort for deterministic output
const runtimeDeps = [...allDeps].sort();

console.log(
  `  Found ${runtimeDeps.length} packages to copy (${externalRoots.join(", ")} + transitive deps)`,
);

/**
 * Recursively remove all .bin directories under a given path.
 * These contain symlinks that break macOS code signing when unpacked from ASAR.
 */
function removeDotBinDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".bin") {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        removeDotBinDirs(fullPath);
      }
    }
  }
}

/**
 * Resolve the actual directory for a package, checking nested node_modules first.
 * @param {string} dep
 * @returns {string | null}
 */
function resolvePackageDir(dep) {
  // Check nested locations under each external root
  for (const root of externalRoots) {
    const nested = join(projectRoot, "node_modules", root, "node_modules", dep);
    if (fs.existsSync(nested)) return nested;
  }
  // Fall back to hoisted location
  const hoisted = join(projectRoot, "node_modules", dep);
  if (fs.existsSync(hoisted)) return hoisted;
  return null;
}

function getElectronVersion() {
  const electronPkgPath = join(projectRoot, "node_modules", "electron", "package.json");
  const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, "utf-8"));
  return electronPkg.version;
}

function rebuildBetterSqliteForArch(arch) {
  const electronVersion = getElectronVersion();
  // execFileSync with an argv array (instead of execSync with an
  // interpolated shell string) avoids shell parsing entirely, so
  // projectRoot's absolute path can never be misinterpreted as shell
  // syntax regardless of what characters it contains. Windows still
  // needs shell:true here: npx.cmd is a batch script, and Win32's
  // CreateProcess (which spawnSync/execFileSync call without a shell)
  // can only launch real .exe binaries directly. With shell:true, Node
  // does its own platform-correct argv escaping, so this doesn't
  // reintroduce the string-interpolation injection this function used
  // to have.
  execFileSync(
    NPX_CMD,
    [
      "electron-rebuild",
      "--force",
      "--only",
      "better-sqlite3",
      "--arch",
      arch,
      "--version",
      electronVersion,
      "--module-dir",
      projectRoot,
    ],
    { cwd: projectRoot, stdio: "inherit", shell: process.platform === "win32" },
  );
}

function rebuildAsWebAuthenticationForArch(arch) {
  if (process.platform !== "darwin") return;
  const electronVersion = getElectronVersion();
  execFileSync(
    NPX_CMD,
    [
      "electron-rebuild",
      "--force",
      "--only",
      "@illusions/as-web-authentication",
      "--arch",
      arch,
      "--version",
      electronVersion,
      "--module-dir",
      projectRoot,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );
}

function getMachOArchs(filePath) {
  if (process.platform !== "darwin" || !fs.existsSync(filePath)) return [];

  try {
    return execFileSync("lipo", ["-archs", filePath], { encoding: "utf-8" })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function expectedMachOArch(arch) {
  return arch === "x64" ? "x86_64" : arch;
}

function ensureHostBetterSqliteArch(arch) {
  if (arch !== process.arch || process.platform !== "darwin") return;

  const bsqlDir = resolvePackageDir("better-sqlite3");
  if (!bsqlDir) return;

  const nativeAddonPath = join(bsqlDir, "build", "Release", "better_sqlite3.node");
  const archs = getMachOArchs(nativeAddonPath);
  const expectedArch = expectedMachOArch(arch);
  if (archs.includes(expectedArch)) return;

  const foundArchs = archs.length > 0 ? archs.join(", ") : "missing";
  console.log(`  ⚙️  Rebuilding better-sqlite3 for ${arch}; native addon arch is ${foundArchs}`);
  rebuildBetterSqliteForArch(arch);
}

// When cross-compiling for a different architecture, swap native binaries
// so the packaged app contains the correct arch-specific modules.
async function prepareNativeModulesForArch(arch) {
  if (arch === process.arch) return;

  // --- better-sqlite3: download correct prebuild for target arch ---
  const bsqlDir = resolvePackageDir("better-sqlite3");
  if (bsqlDir) {
    const electronVersion = getElectronVersion();
    console.log(`  📥 Downloading better-sqlite3 prebuild for win32-${arch}...`);
    try {
      execSync(
        `npx prebuild-install --arch ${arch} --platform win32 --runtime electron --target ${electronVersion}`,
        { cwd: bsqlDir, stdio: "inherit" },
      );
      console.log(`  ✅ better-sqlite3 prebuild ready for ${arch}`);
    } catch {
      console.log(`  ⚙️  No better-sqlite3 prebuild for ${arch}; rebuilding from source...`);
      rebuildBetterSqliteForArch(arch);
      console.log(`  ✅ better-sqlite3 rebuilt from source for ${arch}`);
    }
  }

  // --- node-pty: remove build/Release so runtime uses prebuilds/win32-<arch> ---
  // node-pty's loadNativeModule() resolves build/Release BEFORE prebuilds/.
  // By removing build/, the runtime falls through to the correct prebuilds/win32-<arch>/.
  const ptyDir = resolvePackageDir("node-pty");
  if (ptyDir) {
    const buildDir = join(ptyDir, "build");
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true });
      console.log(`  🗑️  Removed node-pty/build/ (will use prebuilds/win32-${arch}/)`);
    }
  }
}

await prepareNativeModulesForArch(targetArch);
ensureHostBetterSqliteArch(targetArch);
// Build against Electron's headers every time. This is quick and avoids
// accidentally packaging a binary compiled against the developer's Node SDK.
rebuildAsWebAuthenticationForArch(targetArch);

for (const dep of runtimeDeps) {
  const src = resolvePackageDir(dep);
  const dest = join(nodeModulesDest, dep);
  if (src) {
    // Local file: dependencies are symlinked from node_modules. Package the
    // target directory, not the symlink, because its absolute development
    // path cannot exist inside an ASAR-unpacked application.
    fs.cpSync(fs.realpathSync(src), dest, { recursive: true });
    // Remove .bin directories that contain symlinks breaking macOS code signing
    removeDotBinDirs(dest);
    console.log(`  ✅ ${dep}`);
  } else {
    console.warn(`  ⚠️  Warning: ${dep} not found in node_modules`);
  }
}

// Fail the bundle before electron-builder if the Rust runtime is incomplete.
// Loading the copied package (rather than the workspace package) verifies both
// the loader's relative path and the WASM binary itself.
const bundledMdiCoreDir = join(nodeModulesDest, "@illusions-lab", "mdi-core");
const bundledMdiWasm = join(bundledMdiCoreDir, "dist", "mdi_core_bg.wasm");
if (!fs.existsSync(bundledMdiWasm)) {
  throw new Error(`MDI core WASM was not copied to the Electron runtime: ${bundledMdiWasm}`);
}
const bundledMdiCore = await import(
  pathToFileURL(join(bundledMdiCoreDir, "dist", "mdi_core.js")).href
);
if (bundledMdiCore.renderText("# MDI runtime smoke test") !== "MDI runtime smoke test\n") {
  throw new Error("Bundled MDI core failed its runtime smoke test");
}
console.log("  ✅ @illusions-lab/mdi-core WASM runtime smoke test");

console.log("");
console.log("🎉 Bundling complete!");
console.log("");
console.log("Bundle summary:");
console.log("  • Main process: dist-main/main.js");
console.log("  • Preload script: dist-main/preload.js");
console.log(`  • Runtime deps: ${runtimeDeps.length} packages in dist-main/node_modules/`);
console.log("");
