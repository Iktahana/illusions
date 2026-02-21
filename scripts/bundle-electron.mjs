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

// Native/runtime modules that cannot be bundled by esbuild
// kuromoji: dictionary loading at runtime; better-sqlite3: native addon; node-llama-cpp: native LLM inference
// bindings + file-uri-to-path are runtime dependencies of better-sqlite3
const runtimeDeps = [
  'kuromoji', 'doublearray', 'zlibjs', 'async',
  'better-sqlite3', 'bindings', 'file-uri-to-path',
  'node-llama-cpp',
];

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

for (const dep of runtimeDeps) {
  const src = join(projectRoot, 'node_modules', dep);
  const dest = join(nodeModulesDest, dep);
  if (fs.existsSync(src)) {
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
console.log('  • Runtime deps: dist-main/node_modules/{kuromoji,doublearray,zlibjs,async,better-sqlite3,bindings,file-uri-to-path,node-llama-cpp}');
console.log('');
