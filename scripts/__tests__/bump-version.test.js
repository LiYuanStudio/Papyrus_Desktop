const { test } = require('node:test');
const assert = require('node:assert');

const {
  stripVPrefix,
  computeNext,
  parseArgs,
  BumpVersionError,
} = require('../bump-version');

test('stripVPrefix: 移除 v 前缀', () => {
  assert.equal(stripVPrefix('v2.0.0-beta.7'), '2.0.0-beta.7');
  assert.equal(stripVPrefix('v1.0.0'), '1.0.0');
});

test('stripVPrefix: 没有 v 前缀时原样返回', () => {
  assert.equal(stripVPrefix('2.0.0'), '2.0.0');
  assert.equal(stripVPrefix('2.0.0-beta.8'), '2.0.0-beta.8');
});

test('stripVPrefix: 非字符串输入抛 BumpVersionError', () => {
  assert.throws(() => stripVPrefix(123), BumpVersionError);
  assert.throws(() => stripVPrefix(null), BumpVersionError);
  assert.throws(() => stripVPrefix(undefined), BumpVersionError);
});

test('computeNext: prerelease 增量(beta 别名)', () => {
  assert.equal(computeNext('v2.0.0-beta.7', 'beta'), '2.0.0-beta.8');
  assert.equal(computeNext('2.0.0-beta.0', 'beta'), '2.0.0-beta.1');
});

test('computeNext: prerelease 增量(原始名)', () => {
  assert.equal(computeNext('2.0.0-beta.7', 'prerelease'), '2.0.0-beta.8');
});

test('computeNext: 从正式版进入 beta', () => {
  assert.equal(computeNext('2.0.0', 'beta'), '2.0.1-beta.0');
});

test('computeNext: patch 增量', () => {
  assert.equal(computeNext('2.0.0', 'patch'), '2.0.1');
  assert.equal(computeNext('v1.2.3', 'patch'), '1.2.4');
});

test('computeNext: minor 增量', () => {
  assert.equal(computeNext('2.0.5', 'minor'), '2.1.0');
});

test('computeNext: major 增量', () => {
  assert.equal(computeNext('2.5.7', 'major'), '3.0.0');
});

test('computeNext: release 剥离 prerelease', () => {
  assert.equal(computeNext('2.0.0-beta.8', 'release'), '2.0.0');
  assert.equal(computeNext('v2.0.0-rc.3', 'release'), '2.0.0');
});

test('computeNext: 无效版本号抛 BumpVersionError', () => {
  assert.throws(() => computeNext('not-a-version', 'patch'), BumpVersionError);
  assert.throws(() => computeNext('v', 'patch'), BumpVersionError);
  assert.throws(() => computeNext('', 'patch'), BumpVersionError);
});

test('computeNext: release 在已是正式版上抛 BumpVersionError', () => {
  assert.throws(() => computeNext('2.0.0', 'release'), BumpVersionError);
  assert.throws(() => computeNext('v1.5.3', 'release'), BumpVersionError);
});

test('computeNext: 未知类型抛 BumpVersionError', () => {
  assert.throws(() => computeNext('2.0.0', 'unknown-type'), BumpVersionError);
  assert.throws(() => computeNext('2.0.0', ''), BumpVersionError);
});

test('parseArgs: 单一类型参数', () => {
  const result = parseArgs(['node', 'bump-version.js', 'patch']);
  assert.deepEqual(result, { type: 'patch', dryRun: false, noPush: false });
});

test('parseArgs: --dry-run 标志', () => {
  const result = parseArgs(['node', 'bump-version.js', 'beta', '--dry-run']);
  assert.deepEqual(result, { type: 'beta', dryRun: true, noPush: false });
});

test('parseArgs: --no-push 标志', () => {
  const result = parseArgs(['node', 'bump-version.js', 'minor', '--no-push']);
  assert.deepEqual(result, { type: 'minor', dryRun: false, noPush: true });
});

test('parseArgs: 双标志组合', () => {
  const result = parseArgs([
    'node', 'bump-version.js', 'beta', '--dry-run', '--no-push',
  ]);
  assert.deepEqual(result, { type: 'beta', dryRun: true, noPush: true });
});

test('parseArgs: 缺少类型参数抛错', () => {
  assert.throws(() => parseArgs(['node', 'bump-version.js']), BumpVersionError);
  assert.throws(
    () => parseArgs(['node', 'bump-version.js', '--dry-run']),
    BumpVersionError
  );
});

test('parseArgs: 未知标志抛错', () => {
  assert.throws(
    () => parseArgs(['node', 'bump-version.js', 'patch', '--unknown']),
    BumpVersionError
  );
});

test('parseArgs: 多余位置参数抛错', () => {
  assert.throws(
    () => parseArgs(['node', 'bump-version.js', 'patch', 'extra']),
    BumpVersionError
  );
});
