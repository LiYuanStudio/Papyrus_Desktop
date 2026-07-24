const { test } = require('node:test');
const assert = require('node:assert');

const {
  SetVersionError,
  validateVersion,
} = require('../set-version');

test('validateVersion: 接受正式版', () => {
  assert.equal(validateVersion('2.0.0'), '2.0.0');
  assert.equal(validateVersion('10.20.30'), '10.20.30');
});

test('validateVersion: 接受 beta 版', () => {
  assert.equal(validateVersion('2.0.0-beta.11'), '2.0.0-beta.11');
  assert.equal(validateVersion('0.1.0-beta.0'), '0.1.0-beta.0');
});

test('validateVersion: 自动去除首尾空白', () => {
  assert.equal(validateVersion(' 2.0.0-beta.11 '), '2.0.0-beta.11');
});

test('validateVersion: 拒绝不支持的格式', () => {
  assert.throws(() => validateVersion('2.0'), SetVersionError);
  assert.throws(() => validateVersion('2.0.0-rc.1'), SetVersionError);
  assert.throws(() => validateVersion('v2.0.0'), SetVersionError);
  assert.throws(() => validateVersion('2.0.0-beta'), SetVersionError);
  assert.throws(() => validateVersion('2.0.0-beta.a'), SetVersionError);
});

test('validateVersion: 拒绝非字符串', () => {
  assert.throws(() => validateVersion(200), SetVersionError);
  assert.throws(() => validateVersion(null), SetVersionError);
});
