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

// Copy kuromoji and its runtime dependencies
console.log('📦 Copying kuromoji and dependencies for external dependency...');

const nodeModulesDest = join(outDir, 'node_modules');
if (!fs.existsSync(nodeModulesDest)) {
  fs.mkdirSync(nodeModulesDest, { recursive: true });
}

// kuromoji and better-sqlite3 require these modules at runtime (not bundled by esbuild)
// bindings + file-uri-to-path are runtime dependencies of better-sqlite3
const kuromojiDeps = ['kuromoji', 'doublearray', 'zlibjs', 'async', 'better-sqlite3', 'bindings', 'file-uri-to-path'];

for (const dep of kuromojiDeps) {
  const src = join(projectRoot, 'node_modules', dep);
  const dest = join(nodeModulesDest, dep);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
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
console.log('  • Runtime deps: dist-main/node_modules/{kuromoji,doublearray,zlibjs,async,better-sqlite3,bindings,file-uri-to-path}');
console.log('');
