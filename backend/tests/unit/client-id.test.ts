import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';

describe('client-id', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-client-id-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('generates UUID on first call and writes to file', async () => {
    const { getClientId } = await import('../../src/utils/client-id.js');
    const id = getClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(fs.existsSync(path.join(tempDir, 'client_id.txt'))).toBe(true);
  });

  it('reads existing file without regenerating', async () => {
    const clientIdFile = path.join(tempDir, 'client_id.txt');
    fs.writeFileSync(clientIdFile, 'existing-id', 'utf8');
    const { getClientId } = await import('../../src/utils/client-id.js');
    expect(getClientId()).toBe('existing-id');
  });
});
