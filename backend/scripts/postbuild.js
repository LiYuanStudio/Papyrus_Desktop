/**
 * Post-build script: creates dist/package.json for production imports resolution.
 *
 * After tsc compiles TypeScript sources to dist/, this script writes a minimal
 * package.json into dist/ so that Node.js can resolve #/* subpath imports
 * (e.g. #/mcp/tools.js → ./mcp/tools.js relative to dist/).
 *
 * This is needed because the main backend/package.json no longer carries an
 * "imports" field — that field would conflict with tsx's tsconfig paths
 * resolution during development and CI (Playwright webServer).
 */
import { mkdirSync, writeFileSync } from 'node:fs';

// Ensure dist/ exists (tsc creates it, but guard just in case)
mkdirSync('dist', { recursive: true });

const pkg = {
  type: 'module',
  imports: {
    '#/*': './*',
  },
};

writeFileSync('dist/package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('✓ dist/package.json created for production imports resolution');
