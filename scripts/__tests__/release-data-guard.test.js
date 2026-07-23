const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  SQLITE_HEADER,
  purgeGeneratedReleaseData,
  verifyReleasePayload,
} = require('../release-data-guard');

function makeProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-release-guard-'));
  for (const relativePath of ['backend/dist', 'frontend/dist', 'dist-electron', 'electron', 'assets']) {
    fs.mkdirSync(path.join(projectRoot, relativePath), { recursive: true });
  }
  return projectRoot;
}

test('purge removes databases, sidecars, secrets, and renamed SQLite files only from generated roots', () => {
  const projectRoot = makeProject();
  try {
    const generated = path.join(projectRoot, 'backend', 'dist');
    const files = [
      'papyrus.db',
      'papyrus.db-wal',
      '.master_key',
      '.salt',
      'ai_config.json',
      '.env.production',
      'papyrus.log',
      'snapshot.backup',
      'data.json',
    ];
    for (const fileName of files) fs.writeFileSync(path.join(generated, fileName), 'secret');
    fs.writeFileSync(path.join(generated, 'renamed.bin'), Buffer.concat([SQLITE_HEADER, Buffer.alloc(32)]));
    fs.writeFileSync(path.join(generated, 'server.js'), 'console.log("ok")');

    const removed = purgeGeneratedReleaseData(projectRoot);

    assert.equal(removed.length, files.length + 1);
    assert.equal(fs.existsSync(path.join(generated, 'server.js')), true);
    assert.equal(fs.existsSync(path.join(generated, 'papyrus.db')), false);
    assert.equal(fs.existsSync(path.join(generated, 'renamed.bin')), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('purge refuses to hide sensitive files from source-owned payload roots', () => {
  const projectRoot = makeProject();
  try {
    const sourceDb = path.join(projectRoot, 'electron', 'papyrus.db');
    fs.writeFileSync(sourceDb, Buffer.concat([SQLITE_HEADER, Buffer.alloc(32)]));

    assert.throws(() => purgeGeneratedReleaseData(projectRoot), /electron\/papyrus\.db/);
    assert.equal(fs.existsSync(sourceDb), true);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('verification permits dependency data.json but rejects packaged runtime data', () => {
  const projectRoot = makeProject();
  try {
    const dependencyData = path.join(
      projectRoot,
      'dist-electron',
      'win-unpacked',
      'resources',
      'backend',
      'node_modules',
      'ajv',
      'refs',
      'data.json',
    );
    fs.mkdirSync(path.dirname(dependencyData), { recursive: true });
    fs.writeFileSync(dependencyData, '{}');
    assert.doesNotThrow(() => verifyReleasePayload(projectRoot));

    const leakedKey = path.join(projectRoot, 'dist-electron', 'win-unpacked', 'resources', '.master_key');
    fs.writeFileSync(leakedKey, 'secret');
    assert.throws(() => verifyReleasePayload(projectRoot), /\.master_key/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
