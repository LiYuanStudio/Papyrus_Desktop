const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
  getPackagedExecutable,
  parseJson,
  validateFrontendVersion,
  validateNoPackagedUserData,
  validatePackageMetadata,
  validatePackagedRuntime,
  verifyPackagedRuntime,
} = require('../verify-packaged-app');

test('rejects vulnerable, unreviewed, and non-Electron runtimes', () => {
  for (const node of ['24.15.0', '24.18.0', '24.22.0', '24.22.1-rc.1', '25.0.0', 'invalid', undefined]) {
    assert.throws(() => validatePackagedRuntime({ electron: '41.10.6', node }), /not approved/);
  }
  assert.throws(() => validatePackagedRuntime({ node: '24.22.1' }), /as Electron/);
  assert.throws(() => validatePackagedRuntime(null), /as Electron/);
  assert.doesNotThrow(() => validatePackagedRuntime({ electron: '45.0.1', node: '24.22.1' }));
  assert.doesNotThrow(() => validatePackagedRuntime({ electron: '45.0.1', node: '24.22.2' }));
});

test('resolves each packaged platform executable instead of the host Node', () => {
  const resources = path.resolve('fixture', 'resources');
  const appPackage = { name: 'papyrus' };
  assert.equal(getPackagedExecutable(resources, appPackage, 'win32'), path.resolve(resources, '..', 'Papyrus Desktop.exe'));
  assert.equal(getPackagedExecutable(resources, appPackage, 'darwin'), path.resolve(resources, '..', 'MacOS', 'Papyrus Desktop'));
  assert.equal(getPackagedExecutable(resources, appPackage, 'linux'), path.resolve(resources, '..', 'papyrus'));
  assert.throws(() => getPackagedExecutable(resources, appPackage, 'unknown'), /Unsupported/);
});

test('runtime probe rejects host Node even when its version is patched', () => {
  assert.throws(() => verifyPackagedRuntime(process.execPath), /as Electron/);
});

test('runtime probe fails closed if the packaged executable is missing', () => {
  assert.throws(() => verifyPackagedRuntime(path.join(__dirname, 'missing-app-runtime')), /probe failed/);
});

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
