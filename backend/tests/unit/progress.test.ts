import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';

describe('progress', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  let recordCardCreated: typeof import('../../src/core/progress.js').recordCardCreated;
  let recordCardReviewed: typeof import('../../src/core/progress.js').recordCardReviewed;
  let recordNoteCreated: typeof import('../../src/core/progress.js').recordNoteCreated;
  let getDb: typeof import('../../src/db/database.js').getDb;
  let closeDb: typeof import('../../src/db/database.js').closeDb;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-progress-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
    const progress = await import('../../src/core/progress.js');
    recordCardCreated = progress.recordCardCreated;
    recordCardReviewed = progress.recordCardReviewed;
    recordNoteCreated = progress.recordNoteCreated;
    const dbMod = await import('../../src/db/database.js');
    getDb = dbMod.getDb;
    closeDb = dbMod.closeDb;
    getDb(); // init schema
  });

  afterEach(() => {
    closeDb();
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function getToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  it('recordCardCreated increments same-day count', () => {
    recordCardCreated();
    recordCardCreated();
    const db = getDb();
    const row = db.prepare('SELECT cards_created FROM daily_progress WHERE date = ?').get(getToday()) as { cards_created: number } | undefined;
    expect(row?.cards_created).toBe(2);
  });

  it('recordCardReviewed increments reviewed count', () => {
    recordCardReviewed();
    recordCardReviewed();
    recordCardReviewed();
    const db = getDb();
    const row = db.prepare('SELECT cards_reviewed FROM daily_progress WHERE date = ?').get(getToday()) as { cards_reviewed: number } | undefined;
    expect(row?.cards_reviewed).toBe(3);
  });

  it('recordNoteCreated increments notes count', () => {
    recordNoteCreated();
    const db = getDb();
    const row = db.prepare('SELECT notes_created FROM daily_progress WHERE date = ?').get(getToday()) as { notes_created: number } | undefined;
    expect(row?.notes_created).toBe(1);
  });

  it('mixed activity types are tracked separately', () => {
    recordCardCreated();
    recordCardReviewed();
    recordNoteCreated();
    const db = getDb();
    const row = db.prepare('SELECT * FROM daily_progress WHERE date = ?').get(getToday()) as { cards_created: number; cards_reviewed: number; notes_created: number } | undefined;
    expect(row?.cards_created).toBe(1);
    expect(row?.cards_reviewed).toBe(1);
    expect(row?.notes_created).toBe(1);
  });

  it('cross-day creates new row', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Insert a row for yesterday manually
    const db = getDb();
    db.prepare('INSERT INTO daily_progress (date, cards_created) VALUES (?, 5)').run(yesterdayStr);

    recordCardCreated();
    const todayRow = db.prepare('SELECT cards_created FROM daily_progress WHERE date = ?').get(getToday()) as { cards_created: number } | undefined;
    const yestRow = db.prepare('SELECT cards_created FROM daily_progress WHERE date = ?').get(yesterdayStr) as { cards_created: number } | undefined;
    expect(todayRow?.cards_created).toBe(1);
    expect(yestRow?.cards_created).toBe(5);
  });

  it('ensureProgressSchema is idempotent (no error on multiple calls)', () => {
    expect(() => {
      recordCardCreated();
      recordCardCreated();
      recordCardReviewed();
      recordNoteCreated();
    }).not.toThrow();
    const db = getDb();
    const row = db.prepare('SELECT * FROM daily_progress WHERE date = ?').get(getToday()) as { cards_created: number; cards_reviewed: number; notes_created: number } | undefined;
    expect(row?.cards_created).toBe(2);
    expect(row?.cards_reviewed).toBe(1);
    expect(row?.notes_created).toBe(1);
  });
});
