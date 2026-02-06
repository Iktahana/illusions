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

// Copy kuromoji dependency for runtime
console.log('📦 Copying kuromoji for external dependency...');
const kuromojiSrc = join(projectRoot, 'node_modules', 'kuromoji');
const kuromojiDest = join(outDir, 'node_modules', 'kuromoji');

if (!fs.existsSync(join(outDir, 'node_modules'))) {
  fs.mkdirSync(join(outDir, 'node_modules'), { recursive: true });
}

if (fs.existsSync(kuromojiSrc)) {
  fs.cpSync(kuromojiSrc, kuromojiDest, { recursive: true });
  console.log('✅ Kuromoji copied to dist-main/node_modules/kuromoji');
} else {
  console.warn('⚠️  Warning: kuromoji not found in node_modules');
}

console.log('');
console.log('🎉 Bundling complete!');
console.log('');
console.log('Bundle summary:');
console.log('  • Main process: dist-main/main.js');
console.log('  • Preload script: dist-main/preload.js');
console.log('  • Kuromoji: dist-main/node_modules/kuromoji (runtime dependency)');
console.log('');
