const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  validateExternalUrl,
  validateOpenFolderPath,
} = require('../../electron/security-validators');

test('validateExternalUrl allows trusted https and mailto URLs', () => {
  assert.equal(validateExternalUrl('https://github.com/PapyrusOR/Papyrus_Desktop').ok, true);
  assert.equal(validateExternalUrl('https://docs.github.com/actions').ok, true);
  assert.equal(validateExternalUrl('mailto:support@example.com').ok, true);
});

test('validateExternalUrl rejects dangerous protocols and untrusted domains', () => {
  assert.equal(validateExternalUrl('file:///C:/Windows/System32/calc.exe').ok, false);
  assert.equal(validateExternalUrl('javascript:alert(1)').ok, false);
  assert.equal(validateExternalUrl('https://evil.example/release').ok, false);
});

test('validateOpenFolderPath allows paths inside configured directories', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-electron-validator-'));
  const child = path.join(base, 'child');
  fs.mkdirSync(child);
  try {
    const result = validateOpenFolderPath(child, [base]);
    assert.equal(result.ok, true);
    assert.equal(result.path, fs.realpathSync(child));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('validateOpenFolderPath rejects symlinks that resolve outside configured directories', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-electron-validator-base-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-electron-validator-outside-'));
  const link = path.join(base, 'link');
  try {
    try {
      fs.symlinkSync(outside, link, 'junction');
    } catch {
      return;
    }
    const result = validateOpenFolderPath(link, [base]);
    assert.equal(result.ok, false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
