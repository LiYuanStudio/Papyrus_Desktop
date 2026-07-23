const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'release-optimized.yml',
);
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('every GitHub Release update preserves draft and prerelease state', () => {
  // Extract each action configuration through its env block so later upload and notes steps
  // cannot silently publish a release by relying on action defaults.
  // A YAML parser is unnecessary here because the invariant is the exact checked-in action syntax.
  const releaseActionBlocks = workflow.match(
    /uses: softprops\/action-gh-release@v3[\s\S]*?(?=\n\s+env:)/g,
  ) ?? [];

  assert.equal(releaseActionBlocks.length, 3);

  for (const block of releaseActionBlocks) {
    assert.match(block, /^\s*tag_name: \$\{\{ (?:steps|needs)\.prepare(?:-release)?\.outputs\.tag_name \}\}/m);
    assert.match(block, /^\s*draft: \$\{\{ (?:steps|needs)\.prepare(?:-release)?\.outputs\.is_draft == 'true' \}\}/m);
    assert.match(block, /^\s*prerelease: \$\{\{ (?:steps|needs)\.prepare(?:-release)?\.outputs\.is_prerelease == 'true' \}\}/m);
  }
});

test('packaged application gates run before cleanup and artifact upload', () => {
  // Compare workflow positions so both structural and runtime checks remain release blockers.
  // This protects against later refactors moving smoke verification after artifacts are uploaded.
  // Step-name parsing is used instead of a YAML dependency because ordering is the invariant under test.
  const dependencyGate = workflow.indexOf('- name: Verify Packaged Dependencies');
  const smokeGate = workflow.indexOf('- name: Smoke Test Packaged Application');
  const cleanup = workflow.indexOf('- name: Clean Up Unpacked Directories');
  const artifactUpload = workflow.indexOf('- name: Upload Build Artifacts');

  assert.notEqual(dependencyGate, -1);
  assert.notEqual(smokeGate, -1);
  assert.notEqual(cleanup, -1);
  assert.notEqual(artifactUpload, -1);
  assert.ok(dependencyGate < smokeGate);
  assert.ok(smokeGate < cleanup);
  assert.ok(smokeGate < artifactUpload);
  assert.match(
    workflow,
    /scripts\/__tests__\/verify-packaged-app\.test\.js/,
  );
});
