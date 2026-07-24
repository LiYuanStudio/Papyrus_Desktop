const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeAsarPath,
} = require('../verify-packaged-deps');

// Verify the ASAR path forms returned on Unix, Windows, and already-normalized inputs.
// Covering all runner formats prevents the packaged dependency gate from reporting files missing by separator alone.
// A platform-specific assertion is not used because the workflow builds on three operating systems.
test('normalizes ASAR entries for cross-platform packaged dependency checks', () => {
  assert.equal(
    normalizeAsarPath('/frontend/dist/index.html'),
    'frontend/dist/index.html',
  );
  assert.equal(
    normalizeAsarPath('\\frontend\\dist\\index.html'),
    'frontend/dist/index.html',
  );
  assert.equal(
    normalizeAsarPath('frontend/dist/index.html'),
    'frontend/dist/index.html',
  );
});
