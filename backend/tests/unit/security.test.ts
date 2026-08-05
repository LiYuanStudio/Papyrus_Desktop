import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { isPathInsideDirectory, resolveRealPathForSecurity } from '../../src/utils/security.js';

describe('security path helpers', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const itWithSymlinks = process.platform === 'win32' ? it.skip : it;

  itWithSymlinks('resolves missing descendants through an existing symlink ancestor', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-security-'));
    tempDirs.push(tempDir);
    const realRoot = path.join(tempDir, 'real-root');
    const allowedRoot = path.join(realRoot, 'allowed');
    const linkedRoot = path.join(tempDir, 'linked-root');
    fs.mkdirSync(allowedRoot, { recursive: true });
    fs.symlinkSync(realRoot, linkedRoot, 'dir');

    const missingTarget = path.join(linkedRoot, 'allowed', 'new-directory', 'file.json');

    expect(resolveRealPathForSecurity(missingTarget)).toBe(
      path.join(fs.realpathSync(allowedRoot), 'new-directory', 'file.json'),
    );
    expect(isPathInsideDirectory(missingTarget, path.join(linkedRoot, 'allowed'))).toBe(true);
  });

  itWithSymlinks('rejects missing descendants below a symlink that escapes the allowed directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-security-'));
    tempDirs.push(tempDir);
    const allowedRoot = path.join(tempDir, 'allowed');
    const outsideRoot = path.join(tempDir, 'outside');
    fs.mkdirSync(allowedRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.symlinkSync(outsideRoot, path.join(allowedRoot, 'escape'), 'dir');

    const escapedTarget = path.join(allowedRoot, 'escape', 'new-directory', 'file.json');

    expect(isPathInsideDirectory(escapedTarget, allowedRoot)).toBe(false);
  });
});
