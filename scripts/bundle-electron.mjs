#!/usr/bin/env node
/**
 * Bundle Electron main and preload scripts with esbuild
 * This dramatically reduces the number of files in the app bundle,
 * which speeds up code signing and notarization.
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const outDir = join(projectRoot, 'dist-main');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('📦 Bundling Electron main process...');

// Bundle main process
await esbuild.build({
  entryPoints: [join(projectRoot, 'main.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: join(outDir, 'main.js'),
  external: [
    'electron',
    // kuromoji needs to load dictionary files at runtime
    // We'll copy them separately as extraResources
    'kuromoji',
    // better-sqlite3 is a native module
    'better-sqlite3',
    // node-llama-cpp is a native module for local LLM inference
    'node-llama-cpp',
  ],
  format: 'cjs',
  minify: false, // Keep readable for debugging
  sourcemap: true,
  logLevel: 'info',
});

console.log('✅ Main process bundled to dist-main/main.js');

console.log('📦 Bundling Electron preload script...');

// Bundle preload script
await esbuild.build({
  entryPoints: [join(projectRoot, 'preload.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: join(outDir, 'preload.js'),
  external: ['electron'],
  format: 'cjs',
  minify: false,
  sourcemap: true,
  logLevel: 'info',
});

console.log('✅ Preload script bundled to dist-main/preload.js');

// Copy runtime dependencies that cannot be bundled
console.log('📦 Copying runtime dependencies for external modules...');

const nodeModulesDest = join(outDir, 'node_modules');
if (!fs.existsSync(nodeModulesDest)) {
  fs.mkdirSync(nodeModulesDest, { recursive: true });
}

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
  const pkgJsonPaths = [
    join(projectRoot, 'node_modules', pkgName, 'package.json'),
  ];
  // Also check if the package is nested inside any of its dependents
  for (const parent of collected) {
    if (parent !== pkgName) {
      pkgJsonPaths.unshift(
        join(projectRoot, 'node_modules', parent, 'node_modules', pkgName, 'package.json')
      );
    }
  }

  for (const pkgJsonPath of pkgJsonPaths) {
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
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
// kuromoji: dictionary loading at runtime; better-sqlite3: native addon; node-llama-cpp: native LLM inference
const externalRoots = [
  'kuromoji',
  'better-sqlite3',
  'node-llama-cpp',
];

// Collect all transitive production dependencies
const allDeps = new Set();
for (const root of externalRoots) {
  collectDepsRecursive(root, allDeps);
}

// Sort for deterministic output
const runtimeDeps = [...allDeps].sort();

console.log(`  Found ${runtimeDeps.length} packages to copy (${externalRoots.join(', ')} + transitive deps)`);

/**
 * Recursively remove all .bin directories under a given path.
 * These contain symlinks that break macOS code signing when unpacked from ASAR.
 */
function removeDotBinDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.bin') {
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
    const nested = join(projectRoot, 'node_modules', root, 'node_modules', dep);
    if (fs.existsSync(nested)) return nested;
  }
  // Fall back to hoisted location
  const hoisted = join(projectRoot, 'node_modules', dep);
  if (fs.existsSync(hoisted)) return hoisted;
  return null;
}

for (const dep of runtimeDeps) {
  const src = resolvePackageDir(dep);
  const dest = join(nodeModulesDest, dep);
  if (src) {
    fs.cpSync(src, dest, { recursive: true });
    // Remove .bin directories that contain symlinks breaking macOS code signing
    removeDotBinDirs(dest);
    console.log(`  ✅ ${dep}`);
  } else {
    console.warn(`  ⚠️  Warning: ${dep} not found in node_modules`);
  }
}

console.log('');
console.log('🎉 Bundling complete!');
console.log('');
console.log('Bundle summary:');
console.log('  • Main process: dist-main/main.js');
console.log('  • Preload script: dist-main/preload.js');
console.log(`  • Runtime deps: ${runtimeDeps.length} packages in dist-main/node_modules/`);
console.log('');
