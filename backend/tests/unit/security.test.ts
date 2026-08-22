import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  isLoopbackAddress,
  isPathInsideDirectory,
  isPrivateResolvedAddress,
  isPrivateNetworkUrl,
  resolveRealPathForSecurity,
} from '../../src/utils/security.js';

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

describe('SSRF resolved-address helpers', () => {
  it('classifies loopback addresses for IPv4 and IPv6', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.8.8.8')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('[::1]')).toBe(true);

    expect(isLoopbackAddress('192.168.1.1')).toBe(false);
    expect(isLoopbackAddress('8.8.8.8')).toBe(false);
    expect(isLoopbackAddress('2606:4700::1')).toBe(false);
  });

  it('blocks private, link-local and ULA resolved addresses', () => {
    for (const address of [
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.10',
      '169.254.169.254',
      '0.0.0.0',
      '127.0.0.1',
      'fe80::1',
      'fd00::1',
      'fc12:3456::1',
      '::1',
      '::ffff:10.0.0.1',
      '::ffff:169.254.169.254',
    ]) {
      expect(isPrivateResolvedAddress(address)).toBe(true);
    }
  });

  it('allows public resolved addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '2001:db8::1']) {
      expect(isPrivateResolvedAddress(address)).toBe(false);
    }
  });

  it('keeps URL literal detection consistent with resolved-address rules', () => {
    // 同一地址在 URL 字面量与 DNS 解析结果两条路径上必须同判，防止规则漂移。
    for (const url of [
      'http://127.0.0.1:8000/',
      'http://10.0.0.5/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[fd00::1]/',
    ]) {
      expect(isPrivateNetworkUrl(url)).toBe(true);
    }
    expect(isPrivateNetworkUrl('http://8.8.8.8/')).toBe(false);
  });
});
