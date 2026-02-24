#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '../build');
const assetsDir = path.join(buildDir, 'assets', 'microsoft');

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const iconPath = path.join(buildDir, 'icon.png');

// Microsoft Store tile sizes required
const tiles = [
  { name: 'StoreLogo.png', size: 50 },      // Small store logo
  { name: 'SmallTile.png', size: 150 },     // Small tile
  { name: 'Logo.png', size: 200 },          // Medium logo
  { name: 'MediumTile.png', size: 270 },    // Medium tile
  { name: 'LargeTile.png', size: 450 },     // Large tile
];

async function generateAssets() {
  try {
    console.log(`Reading source icon: ${iconPath}`);
    const sourceImage = sharp(iconPath);

    // Generate each tile size
    for (const tile of tiles) {
      const outputPath = path.join(assetsDir, tile.name);
      console.log(`Generating ${tile.name} (${tile.size}x${tile.size})...`);

      await sourceImage
        .clone()
        .resize(tile.size, tile.size, {
          fit: 'cover',
          position: 'center',
          background: { r: 26, g: 26, b: 26, alpha: 1 } // Match backgroundColor from package.json
        })
        .png()
        .toFile(outputPath);

      console.log(`  ✓ Saved to ${outputPath}`);
    }

    // Generate wide tile (310x150)
    const wideTilePath = path.join(assetsDir, 'Wide310x150Logo.png');
    console.log(`Generating Wide310x150Logo.png (310x150)...`);

    await sharp(iconPath)
      .resize(310, 150, {
        fit: 'cover',
        position: 'center',
        background: { r: 26, g: 26, b: 26, alpha: 1 }
      })
      .png()
      .toFile(wideTilePath);

    console.log(`  ✓ Saved to ${wideTilePath}`);

    console.log('\n✅ All Microsoft Store assets generated successfully!');
  } catch (err) {
    console.error('Error generating assets:', err);
    process.exit(1);
  }
}

generateAssets();
