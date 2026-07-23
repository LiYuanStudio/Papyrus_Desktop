const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseJson,
  validateFrontendVersion,
  validateNoPackagedUserData,
  validatePackageMetadata,
} = require('../verify-packaged-app');

test('accepts matching packaged app and backend metadata', () => {
  assert.doesNotThrow(() => validatePackageMetadata(
    { main: 'electron/main.js', version: '2.0.0-beta.14' },
    { version: '2.0.0-beta.14' },
    '2.0.0-beta.14',
  ));
});

test('rejects stale app, backend, and Electron entry metadata', () => {
  assert.throws(
    () => validatePackageMetadata(
      { main: 'electron/main.js', version: '2.0.0-beta.13' },
      { version: '2.0.0-beta.14' },
      '2.0.0-beta.14',
    ),
    /Packaged app version mismatch/,
  );
  assert.throws(
    () => validatePackageMetadata(
      { main: 'electron/main.js', version: '2.0.0-beta.14' },
      { version: '2.0.0-beta.13' },
      '2.0.0-beta.14',
    ),
    /Packaged backend version mismatch/,
  );
  assert.throws(
    () => validatePackageMetadata(
      { main: 'wrong.js', version: '2.0.0-beta.14' },
      { version: '2.0.0-beta.14' },
      '2.0.0-beta.14',
    ),
    /Packaged Electron entry mismatch/,
  );
});

test('reports malformed packaged JSON with its source', () => {
  assert.throws(
    () => parseJson(Buffer.from('{broken'), 'app.asar/package.json'),
    /Invalid JSON in app\.asar\/package\.json/,
  );
});

test('requires the exact release version in the packaged frontend bundle', () => {
  assert.doesNotThrow(() => validateFrontendVersion(
    ['const appVersion=\"2.0.0-beta.14\"'],
    '2.0.0-beta.14',
  ));
  assert.throws(
    () => validateFrontendVersion(
      ['const appVersion=\"2.0.0-beta.13\"'],
      '2.0.0-beta.14',
    ),
    /Packaged frontend version missing/,
  );
});

test('rejects databases and legacy user data from packaged resources', () => {
  assert.doesNotThrow(() => validateNoPackagedUserData([
    'frontend/dist/index.html',
    'backend/dist/api/server.js',
    'backend/node_modules/ajv/dist/refs/data.json',
  ]));
  for (const forbiddenPath of [
    'PapyrusData/papyrus.db',
    'PapyrusData/papyrus.db-wal',
    'backend/data.sqlite3-shm',
    'backend/data.json',
    'backend/ai_config.json',
  ]) {
    assert.throws(
      () => validateNoPackagedUserData([forbiddenPath]),
      /Packaged user data detected/,
    );
  }
});
