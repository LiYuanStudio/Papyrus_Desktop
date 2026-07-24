import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ServerResponse } from 'node:http';
import { jest } from '@jest/globals';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';

describe('extension-events', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  let pushExtensionEvent: typeof import('../../src/core/extension-events.js').pushExtensionEvent;
  let addExtensionEventClient: typeof import('../../src/core/extension-events.js').addExtensionEventClient;
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ext-events-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
    const mod = await import('../../src/core/extension-events.js');
    pushExtensionEvent = mod.pushExtensionEvent;
    addExtensionEventClient = mod.addExtensionEventClient;
    const dbMod = await import('../../src/db/database.js');
    closeDb = dbMod.closeDb;
    getDb = dbMod.getDb;
    getDb();
  });

  afterEach(() => {
    closeDb();
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function makeMockRes(): ServerResponse {
    const writeMock = jest.fn();
    const onMock = jest.fn();
    return {
      write: writeMock,
      on: onMock,
    } as unknown as ServerResponse;
  }

  it('pushExtensionEvent does not throw when no extensions installed', () => {
    expect(() => {
      pushExtensionEvent('card.review.completed', { card_id: 'x' });
    }).not.toThrow();
  });
});
