/**
 * Removes runtime data from generated packaging inputs and verifies release payloads.
 *
 * Why: a clean checkout is not a sufficient release invariant because local builds and
 * cached CI workspaces can leave databases, keys, logs, or backups under generated roots.
 * We do not scan or delete user data directories: every mutable target is resolved below
 * the repository and must belong to an explicit, reproducible build-output root.
 */
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');
const GENERATED_ROOTS = [
  path.join('backend', 'dist'),
  path.join('frontend', 'dist'),
  'dist-electron',
];
const READ_ONLY_PAYLOAD_ROOTS = [
  'electron',
  'assets',
  path.join('backend', 'node_modules'),
];

function normalizeRelative(filePath) {
  return filePath.split(path.sep).join('/');
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function isDatabaseName(fileName) {
  const lower = fileName.toLowerCase();
  return /\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/.test(lower)
    || /-(?:wal|shm|journal)$/.test(lower);
}

function isRuntimeSensitiveName(relativePath) {
  const normalized = normalizeRelative(relativePath).toLowerCase();
  const baseName = path.posix.basename(normalized);
  if (isDatabaseName(baseName)) return true;
  if (baseName === '.master_key' || baseName === '.salt' || baseName === 'ai_config.json') return true;
  if (baseName === '.env' || baseName.startsWith('.env.')) return true;
  if (baseName.endsWith('.log') || baseName.endsWith('.bak') || baseName.endsWith('.backup')) return true;
  if (baseName === 'data.json' && !normalized.includes('/node_modules/')) return true;
  return normalized.split('/').some((segment) => segment === 'backups');
}

function hasSqliteHeader(filePath) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    return bytesRead === SQLITE_HEADER.length && header.equals(SQLITE_HEADER);
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function walkFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const files = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function findSensitiveFiles(rootPath) {
  return walkFiles(rootPath).filter((filePath) => {
    const relativePath = path.relative(rootPath, filePath);
    return isRuntimeSensitiveName(relativePath) || hasSqliteHeader(filePath);
  });
}

function assertGeneratedRoot(projectRoot, candidateRoot) {
  const resolvedProject = fs.realpathSync(projectRoot);
  const resolvedCandidate = path.resolve(candidateRoot);
  if (!isPathInside(resolvedProject, resolvedCandidate)) {
    throw new Error(`Refusing to mutate path outside project root: ${resolvedCandidate}`);
  }
  const allowed = GENERATED_ROOTS.some((relativeRoot) => {
    const allowedRoot = path.resolve(resolvedProject, relativeRoot);
    return resolvedCandidate === allowedRoot || isPathInside(allowedRoot, resolvedCandidate);
  });
  if (!allowed) {
    throw new Error(`Refusing to mutate non-generated path: ${resolvedCandidate}`);
  }
}

function purgeGeneratedReleaseData(projectRoot) {
  const removed = [];
  for (const relativeRoot of GENERATED_ROOTS) {
    const rootPath = path.resolve(projectRoot, relativeRoot);
    if (!fs.existsSync(rootPath)) continue;
    assertGeneratedRoot(projectRoot, rootPath);
    for (const filePath of findSensitiveFiles(rootPath)) {
      assertGeneratedRoot(projectRoot, filePath);
      removed.push(normalizeRelative(path.relative(projectRoot, filePath)));
    }
  }
  removed.sort();
  if (removed.length > 0) {
    console.log('Removing sensitive runtime files from generated release roots:');
    for (const relativePath of removed) console.log(`  ${relativePath}`);
    for (const relativePath of removed) {
      fs.unlinkSync(path.resolve(projectRoot, relativePath));
    }
  }
  verifyReleasePayload(projectRoot);
  return removed;
}

function listAsarViolations(asarPath, projectRoot) {
  const violations = [];
  for (const entry of asar.listPackage(asarPath)) {
    const normalized = entry.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    if (normalized.length === 0 || normalized.endsWith('/')) continue;
    if (isRuntimeSensitiveName(normalized)) {
      violations.push(`${normalizeRelative(path.relative(projectRoot, asarPath))}:${normalized}`);
    }
  }
  return violations;
}

function verifyReleasePayload(projectRoot) {
  const violations = [];
  const roots = [...GENERATED_ROOTS, ...READ_ONLY_PAYLOAD_ROOTS];
  for (const relativeRoot of roots) {
    const rootPath = path.resolve(projectRoot, relativeRoot);
    if (!fs.existsSync(rootPath)) continue;
    for (const filePath of findSensitiveFiles(rootPath)) {
      violations.push(normalizeRelative(path.relative(projectRoot, filePath)));
    }
  }
  const distRoot = path.resolve(projectRoot, 'dist-electron');
  for (const filePath of walkFiles(distRoot)) {
    if (path.basename(filePath).toLowerCase() === 'app.asar') {
      violations.push(...listAsarViolations(filePath, projectRoot));
    }
  }
  const uniqueViolations = [...new Set(violations)].sort();
  if (uniqueViolations.length > 0) {
    const error = new Error(
      `Release payload contains ${uniqueViolations.length} sensitive runtime file(s):\n`
      + uniqueViolations.map((entry) => `  ${entry}`).join('\n'),
    );
    error.violations = uniqueViolations;
    throw error;
  }
  return [];
}

function main() {
  const mode = process.argv[2];
  const projectRoot = path.resolve(__dirname, '..');
  if (mode === 'purge') {
    purgeGeneratedReleaseData(projectRoot);
    console.log('Release input data guard passed.');
    return;
  }
  if (mode === 'verify') {
    verifyReleasePayload(projectRoot);
    console.log('Packaged release data guard passed.');
    return;
  }
  console.error('Usage: node scripts/release-data-guard.js <purge|verify>');
  process.exitCode = 2;
}

module.exports = {
  SQLITE_HEADER,
  findSensitiveFiles,
  hasSqliteHeader,
  isRuntimeSensitiveName,
  purgeGeneratedReleaseData,
  verifyReleasePayload,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
