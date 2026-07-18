/**
 * Verify that backend dependencies are correctly packaged in the Electron app.
 * Checks both app.asar.unpacked and app.asar contents.
 */

const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const DIST_ELECTRON = path.resolve(__dirname, '..', 'dist-electron');

// Files we expect to find in the packaged app
const REQUIRED_FILES = [
  'frontend/dist/index.html',
  'backend/node_modules/fastify/package.json',
  'backend/dist/api/server.js',
  'backend/package.json',
];

function findAppAsar() {
  const candidates = [];
  function walk(dir, depth) {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.name === 'app.asar') {
        candidates.push(fullPath);
      }
    }
  }
  walk(DIST_ELECTRON, 0);
  return candidates[0];
}

function findUnpackedDir() {
  const candidates = [];
  function walk(dir, depth) {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'app.asar.unpacked') {
          candidates.push(fullPath);
        }
        walk(fullPath, depth + 1);
      }
    }
  }
  walk(DIST_ELECTRON, 0);
  return candidates[0];
}

function findExtraResourcesDir() {
  const candidates = [];
  function walk(dir, depth) {
    if (depth > 5) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === 'resources') {
          const backendDir = path.join(fullPath, 'backend');
          if (fs.existsSync(backendDir)) {
            candidates.push(fullPath);
          }
        }
        walk(fullPath, depth + 1);
      }
    }
  }
  walk(DIST_ELECTRON, 0);
  return candidates[0];
}

function findInDir(dir, relPath) {
  const fullPath = path.join(dir, relPath);
  return fs.existsSync(fullPath);
}

function main() {
  console.log('=== Packaged Dependency Verification ===\n');

  if (!fs.existsSync(DIST_ELECTRON)) {
    console.error(`Error: dist-electron directory not found at ${DIST_ELECTRON}`);
    process.exit(1);
  }

  const asarPath = findAppAsar();
  const unpackedDir = findUnpackedDir();
  const extraResourcesDir = findExtraResourcesDir();

  console.log(`dist-electron: ${DIST_ELECTRON}`);
  console.log(`app.asar: ${asarPath || 'NOT FOUND'}`);
  console.log(`app.asar.unpacked: ${unpackedDir || 'NOT FOUND'}`);
  console.log(`extraResources: ${extraResourcesDir || 'NOT FOUND'}`);
  console.log('');

  const missing = [];

  for (const relPath of REQUIRED_FILES) {
    let found = false;

    if (asarPath) {
      const asarFiles = asar.listPackage(asarPath);
      const normalized = relPath.replace(/\\/g, '/');
      if (asarFiles.includes(normalized)) {
        console.log(`  OK (asar): ${relPath}`);
        found = true;
      }
    }

    if (!found && unpackedDir) {
      if (findInDir(unpackedDir, relPath)) {
        console.log(`  OK (unpacked): ${relPath}`);
        found = true;
      }
    }

    if (!found && extraResourcesDir) {
      if (findInDir(extraResourcesDir, relPath)) {
        console.log(`  OK (extraResources): ${relPath}`);
        found = true;
      }
    }

    if (!found) {
      console.log(`  MISSING: ${relPath}`);
      missing.push(relPath);
    }
  }

  console.log('');

  if (missing.length > 0) {
    console.log('=== VERIFICATION FAILED ===');
    process.exit(1);
  }

  console.log('=== VERIFICATION PASSED ===');
  process.exit(0);
}

main();
