import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import type { Note, CardRecord } from '../../src/core/types.js';

describe('Versioning', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-versioning-test-${Date.now()}`);

  let createNote: (title: string, content: string, folder?: string, tags?: string[]) => Note;
  let updateNote: (noteId: string, updates: Partial<Pick<Note, 'title' | 'content' | 'folder' | 'tags'>>) => Note | null;
  let getNoteById: (noteId: string) => Note | null;
  let createCard: (q: string, a: string, tags?: string[]) => CardRecord;
  let updateCard: (cardId: string, updates: Partial<Pick<CardRecord, 'q' | 'a' | 'tags'>>) => Promise<CardRecord | null>;
  let rateCard: (cardId: string, grade: number) => Promise<{ card: CardRecord; intervalDays: number; ef: number } | null>;
  let getCardById: (cardId: string) => CardRecord | null;

  let saveNoteVersion: (note: Note) => void;
  let getNoteHistory: (noteId: string) => Array<Note & { version: number; version_id: string; version_created_at: number }>;
  let rollbackNote: (noteId: string, versionId: string) => Note | null;

  let saveCardVersion: (card: CardRecord) => void;
  let getCardHistory: (cardId: string) => Array<CardRecord & { version: number; version_id: string; version_created_at: number }>;
  let rollbackCard: (cardId: string, versionId: string) => CardRecord | null;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;

    const notes = await import('../../src/core/notes.js');
    createNote = notes.createNote;
    updateNote = notes.updateNote;
    getNoteById = notes.getNoteById;

    const cards = await import('../../src/core/cards.js');
    const db = await import('../../src/db/database.js');
    createCard = cards.createCard;
    updateCard = cards.updateCard;
    rateCard = cards.rateCard;
    getCardById = db.getCardById;

    const versioning = await import('../../src/core/versioning.js');
    saveNoteVersion = versioning.saveNoteVersion;
    getNoteHistory = versioning.getNoteHistory;
    rollbackNote = versioning.rollbackNote;
    saveCardVersion = versioning.saveCardVersion;
    getCardHistory = versioning.getCardHistory;
    rollbackCard = versioning.rollbackCard;
  });

  afterAll(async () => {
    const { closeDb } = await import('../../src/db/database.js');
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  describe('saveNoteVersion', () => {
    it('should save a version for a note', () => {
      const note = createNote('Title', 'Original content');
      saveNoteVersion(note);

      const history = getNoteHistory(note.id);
      expect(history.length).toBe(1);
      // @ts-expect-error - checked length above
      expect(history[0].content).toBe('Original content');
      // @ts-expect-error - checked length above
      expect(history[0].version).toBe(1);
    });

    it('should skip saving when content hash is unchanged', () => {
      const note = createNote('Title', 'Same content');
      saveNoteVersion(note);
      saveNoteVersion(note);

      const history = getNoteHistory(note.id);
      expect(history.length).toBe(1);
    });
  });

  describe('getNoteHistory', () => {
    it('should return versions in descending order', async () => {
      const note = createNote('Title', 'v1');
      await updateNote(note.id, { content: 'v2' });
      await updateNote(note.id, { content: 'v3' });

      const history = getNoteHistory(note.id);
      expect(history.length).toBe(2);
      // @ts-expect-error - checked length above
      expect(history[0].content).toBe('v2');
      // @ts-expect-error - checked length above
      expect(history[1].content).toBe('v1');
    });

    it('should return empty array for note with no versions', () => {
      const note = createNote('Title', 'no versions');
      const history = getNoteHistory(note.id);
      expect(history).toEqual([]);
    });
  });

  describe('rollbackNote', () => {
    it('should roll back note to a previous version', async () => {
      const note = createNote('Title', 'Original');
      await updateNote(note.id, { content: 'Modified' });

      const history = getNoteHistory(note.id);
      // @ts-expect-error - checked length above
      const firstVersionId = history[history.length - 1].version_id;

      const rolledBack = rollbackNote(note.id, firstVersionId);
      expect(rolledBack).not.toBeNull();
      expect(rolledBack).toMatchObject({ content: 'Original' });

      const current = getNoteById(note.id);
      expect(current).not.toBeNull();
      expect(current).toMatchObject({ content: 'Original' });
    });

    it('should create a new version when rolling back', async () => {
      const note = createNote('Title', 'Original');
      await updateNote(note.id, { content: 'Modified' });

      const historyBefore = getNoteHistory(note.id);
      expect(historyBefore.length).toBe(1);

      // @ts-expect-error - checked length above
      const firstVersionId = historyBefore[0].version_id;
      rollbackNote(note.id, firstVersionId);

      const historyAfter = getNoteHistory(note.id);
      expect(historyAfter.length).toBe(2);
      // @ts-expect-error - checked length above
      expect(historyAfter[0].content).toBe('Modified');
      // @ts-expect-error - checked length above
      expect(historyAfter[1].content).toBe('Original');
    });

    it('should return null for non-existent note', () => {
      const result = rollbackNote('non-existent', 'some-version');
      expect(result).toBeNull();
    });

    it('should return null for version belonging to different note', async () => {
      const noteA = createNote('A', 'content A');
      const noteB = createNote('B', 'content B');
      await updateNote(noteA.id, { content: 'modified A' });

      const historyA = getNoteHistory(noteA.id);
      // @ts-expect-error - checked length above
      const versionIdA = historyA[0].version_id;

      const result = rollbackNote(noteB.id, versionIdA);
      expect(result).toBeNull();
    });
  });

  describe('saveCardVersion', () => {
    it('should save a version for a card', () => {
      const card = createCard('Q', 'A');
      saveCardVersion(card);

      const history = getCardHistory(card.id);
      expect(history.length).toBe(1);
      // @ts-expect-error - checked length above
      expect(history[0].q).toBe('Q');
      // @ts-expect-error - checked length above
      expect(history[0].version).toBe(1);
    });

    it('should skip saving when content is unchanged', () => {
      const card = createCard('Q', 'A');
      saveCardVersion(card);
      saveCardVersion(card);

      const history = getCardHistory(card.id);
      expect(history.length).toBe(1);
    });
  });

  describe('getCardHistory', () => {
    it('should return versions in descending order', async () => {
      const card = createCard('Q1', 'A1');
      await updateCard(card.id, { q: 'Q2' });
      await updateCard(card.id, { q: 'Q3' });

      const history = getCardHistory(card.id);
      expect(history.length).toBe(2);
      // @ts-expect-error - checked length above
      expect(history[0].q).toBe('Q2');
      // @ts-expect-error - checked length above
      expect(history[1].q).toBe('Q1');
    });

    it('should return empty array for card with no versions', () => {
      const card = createCard('Q', 'A');
      const history = getCardHistory(card.id);
      expect(history).toEqual([]);
    });
  });

  describe('rollbackCard', () => {
    it('should roll back card to a previous version', async () => {
      const card = createCard('Q', 'A');
      const updated = await updateCard(card.id, { q: 'Modified Q' });
      expect(updated).not.toBeNull();

      const history = getCardHistory(card.id);
      // @ts-expect-error - checked length above
      const firstVersionId = history[history.length - 1].version_id;

      const rolledBack = rollbackCard(card.id, firstVersionId);
      expect(rolledBack).not.toBeNull();
      expect(rolledBack).toMatchObject({ q: 'Q' });

      const current = getCardById(card.id);
      expect(current).not.toBeNull();
      expect(current).toMatchObject({ q: 'Q' });
    });

    it('should preserve scheduling params on rollback', async () => {
      const card = createCard('Q', 'A');
      await rateCard(card.id, 3);

      const rated = getCardById(card.id);
      expect(rated).toMatchObject({ repetitions: 1 });

      await updateCard(card.id, { q: 'Modified Q' });
      const history = getCardHistory(card.id);
      // @ts-expect-error - checked length above
      const firstVersionId = history[history.length - 1].version_id;

      const rolledBack = rollbackCard(card.id, firstVersionId);
      expect(rolledBack).toMatchObject({ repetitions: 1 });
    });

    it('should create a new version when rolling back', async () => {
      const card = createCard('Q', 'A');
      await updateCard(card.id, { q: 'Modified' });

      const historyBefore = getCardHistory(card.id);
      expect(historyBefore.length).toBe(1);

      // @ts-expect-error - checked length above
      const firstVersionId = historyBefore[0].version_id;
      rollbackCard(card.id, firstVersionId);

      const historyAfter = getCardHistory(card.id);
      expect(historyAfter.length).toBe(2);
    });

    it('should return null for non-existent card', () => {
      const result = rollbackCard('non-existent', 'some-version');
      expect(result).toBeNull();
    });
  });

  describe('updateNote integration', () => {
    it('should auto-save version before updating', async () => {
      const note = createNote('Title', 'Original');
      await updateNote(note.id, { content: 'Updated' });

      const history = getNoteHistory(note.id);
      expect(history.length).toBe(1);
      // @ts-expect-error - checked length above
      expect(history[0].content).toBe('Original');
    });
  });

  describe('updateCard integration', () => {
    it('should auto-save version before updating', async () => {
      const card = createCard('Q', 'A');
      await updateCard(card.id, { q: 'Updated Q' });

      const history = getCardHistory(card.id);
      expect(history.length).toBe(1);
      // @ts-expect-error - checked length above
      expect(history[0].q).toBe('Q');
    });
  });

  describe('rateCard should not create version', () => {
    it('should not save version when rating card', async () => {
      const card = createCard('Q', 'A');
      await rateCard(card.id, 3);

      const history = getCardHistory(card.id);
      expect(history.length).toBe(0);
    });
  });
  describe('edge cases', () => {
    it('saveNoteVersion skips duplicate hash', () => {
      const note = createNote('T', 'C');
      saveNoteVersion(note);
      saveNoteVersion(note);
      expect(getNoteHistory(note.id).length).toBe(1);
    });

    it('rollbackNote returns null for non-existent versionId', () => {
      const note = createNote('T', 'C');
      const result = rollbackNote(note.id, 'nosuch-version');
      expect(result).toBeNull();
    });

    it('rollbackCard returns null for non-existent cardId', () => {
      const result = rollbackCard('nosuch-card', 'nosuch-version');
      expect(result).toBeNull();
    });
  });
});
