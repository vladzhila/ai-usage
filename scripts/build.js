import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = import.meta.dir.replace('/scripts', '');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// Clean dist
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true });
}
mkdirSync(DIST);

// Copy manifest
copyFileSync(join(ROOT, 'manifest.json'), join(DIST, 'manifest.json'));

// Copy source directories
const dirs = ['popup', 'background', 'lib', 'content-scripts'];
for (const dir of dirs) {
  const srcDir = join(SRC, dir);
  const distDir = join(DIST, dir);
  if (existsSync(srcDir)) {
    cpSync(srcDir, distDir, { recursive: true });
  }
}

// Copy icons if exist, otherwise generate placeholders
const iconsDir = join(ROOT, 'icons');
const distIconsDir = join(DIST, 'icons');
mkdirSync(distIconsDir, { recursive: true });

if (existsSync(iconsDir)) {
  cpSync(iconsDir, distIconsDir, { recursive: true });
} else {
  // Generate simple placeholder icons (1x1 transparent PNG as minimal valid PNG)
  // In production, replace with actual icons
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    // Minimal valid PNG (1x1 transparent pixel)
    const minimalPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
    ]);
    writeFileSync(join(distIconsDir, `icon${size}.png`), minimalPng);
  }
  console.log('Generated placeholder icons (replace with real icons for production)');
}

console.log('Build complete: dist/');
