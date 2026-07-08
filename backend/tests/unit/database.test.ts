import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CardRecord, Note, FileRecord } from '../../src/core/types.js';

describe('Database', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-db-test-${Date.now()}`);
  let dbPath: string;

  let getDb: () => unknown;
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let loadAllCards: typeof import('../../src/db/database.js').loadAllCards;
  let saveAllCards: typeof import('../../src/db/database.js').saveAllCards;
  let insertCard: typeof import('../../src/db/database.js').insertCard;
  let deleteCardById: typeof import('../../src/db/database.js').deleteCardById;
  let getCardById: typeof import('../../src/db/database.js').getCardById;
  let updateCard: typeof import('../../src/db/database.js').updateCard;
  let getCardsDueBefore: typeof import('../../src/db/database.js').getCardsDueBefore;
  let getCardCount: typeof import('../../src/db/database.js').getCardCount;
  let loadAllNotes: typeof import('../../src/db/database.js').loadAllNotes;
  let saveAllNotes: typeof import('../../src/db/database.js').saveAllNotes;
  let insertNote: typeof import('../../src/db/database.js').insertNote;
  let deleteNoteById: typeof import('../../src/db/database.js').deleteNoteById;
  let getNoteById: typeof import('../../src/db/database.js').getNoteById;
  let updateNote: typeof import('../../src/db/database.js').updateNote;
  let getNotesByFolder: typeof import('../../src/db/database.js').getNotesByFolder;
  let getNoteCount: typeof import('../../src/db/database.js').getNoteCount;
  let getAllFolders: typeof import('../../src/db/database.js').getAllFolders;
  let loadAllProviders: typeof import('../../src/db/database.js').loadAllProviders;
  let loadAllProvidersForClient: typeof import('../../src/db/database.js').loadAllProvidersForClient;
  let saveProvider: typeof import('../../src/db/database.js').saveProvider;
  let deleteProvider: typeof import('../../src/db/database.js').deleteProvider;
  let setDefaultProvider: typeof import('../../src/db/database.js').setDefaultProvider;
  let updateProviderEnabled: typeof import('../../src/db/database.js').updateProviderEnabled;
  let saveApiKey: typeof import('../../src/db/database.js').saveApiKey;
  let deleteApiKey: typeof import('../../src/db/database.js').deleteApiKey;
  let saveModel: typeof import('../../src/db/database.js').saveModel;
  let deleteModel: typeof import('../../src/db/database.js').deleteModel;
  let migrateFromJson: typeof import('../../src/db/database.js').migrateFromJson;
  let checkpointDb: typeof import('../../src/db/database.js').checkpointDb;
  let runInTransaction: typeof import('../../src/db/database.js').runInTransaction;
  let loadAllFiles: typeof import('../../src/db/database.js').loadAllFiles;
  let getFileById: typeof import('../../src/db/database.js').getFileById;
  let getFilesByParentId: typeof import('../../src/db/database.js').getFilesByParentId;
  let insertFile: typeof import('../../src/db/database.js').insertFile;
  let deleteFileById: typeof import('../../src/db/database.js').deleteFileById;
  let updateFile: typeof import('../../src/db/database.js').updateFile;
  let getUiSettings: typeof import('../../src/db/database.js').getUiSettings;
  let saveUiSettings: typeof import('../../src/db/database.js').saveUiSettings;
  let getSidebarSettings: typeof import('../../src/db/database.js').getSidebarSettings;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;

    const db = await import('../../src/db/database.js');
    getDb = db.getDb as () => unknown;
    closeDb = db.closeDb as typeof closeDb;
    loadAllCards = db.loadAllCards as typeof loadAllCards;
    saveAllCards = db.saveAllCards as typeof saveAllCards;
    insertCard = db.insertCard as typeof insertCard;
    deleteCardById = db.deleteCardById as typeof deleteCardById;
    getCardById = db.getCardById as typeof getCardById;
    updateCard = db.updateCard as typeof updateCard;
    getCardsDueBefore = db.getCardsDueBefore as typeof getCardsDueBefore;
    getCardCount = db.getCardCount as typeof getCardCount;
    loadAllNotes = db.loadAllNotes as typeof loadAllNotes;
    saveAllNotes = db.saveAllNotes as typeof saveAllNotes;
    insertNote = db.insertNote as typeof insertNote;
    deleteNoteById = db.deleteNoteById as typeof deleteNoteById;
    getNoteById = db.getNoteById as typeof getNoteById;
    updateNote = db.updateNote as typeof updateNote;
    getNotesByFolder = db.getNotesByFolder as typeof getNotesByFolder;
    getNoteCount = db.getNoteCount as typeof getNoteCount;
    getAllFolders = db.getAllFolders as typeof getAllFolders;
    loadAllProviders = db.loadAllProviders as typeof loadAllProviders;
    loadAllProvidersForClient = db.loadAllProvidersForClient as typeof loadAllProvidersForClient;
    saveProvider = db.saveProvider as typeof saveProvider;
    deleteProvider = db.deleteProvider as typeof deleteProvider;
    setDefaultProvider = db.setDefaultProvider as typeof setDefaultProvider;
    updateProviderEnabled = db.updateProviderEnabled as typeof updateProviderEnabled;
    saveApiKey = db.saveApiKey as typeof saveApiKey;
    deleteApiKey = db.deleteApiKey as typeof deleteApiKey;
    saveModel = db.saveModel as typeof saveModel;
    deleteModel = db.deleteModel as typeof deleteModel;
    migrateFromJson = db.migrateFromJson as typeof migrateFromJson;
    checkpointDb = db.checkpointDb as typeof checkpointDb;
    runInTransaction = db.runInTransaction as typeof runInTransaction;
    loadAllFiles = db.loadAllFiles as typeof loadAllFiles;
    getFileById = db.getFileById as typeof getFileById;
    getFilesByParentId = db.getFilesByParentId as typeof getFilesByParentId;
    insertFile = db.insertFile as typeof insertFile;
    deleteFileById = db.deleteFileById as typeof deleteFileById;
    updateFile = db.updateFile as typeof updateFile;
    getUiSettings = db.getUiSettings as typeof getUiSettings;
    saveUiSettings = db.saveUiSettings as typeof saveUiSettings;
    getSidebarSettings = db.getSidebarSettings as typeof getSidebarSettings;

    dbPath = path.join(testDir, 'papyrus.db');
  });

  afterAll(() => {
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    closeDb();
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath);
    }
    getDb();
  });

  function makeCard(overrides?: Partial<CardRecord>): CardRecord {
    return {
      id: 'card-' + Math.random().toString(36).slice(2),
      q: 'Q',
      a: 'A',
      next_review: 0,
      interval: 0,
      ef: 2.5,
      repetitions: 0,
      tags: [],
      ...overrides,
    };
  }

  function makeNote(overrides?: Partial<Note>): Note {
    return {
      id: 'note-' + Math.random().toString(36).slice(2),
      title: 'Title',
      folder: '默认',
      content: 'content',
      preview: 'preview',
      tags: [],
      created_at: 0,
      updated_at: 0,
      word_count: 0,
      hash: '',
      headings: [],
      outgoing_links: [],
      incoming_count: 0,
      ...overrides,
    };
  }

  describe('getDb / closeDb', () => {
    it('should recreate db after closeDb', () => {
      closeDb();
      const d = getDb();
      expect(d).toBeDefined();
    });
  });

  describe('Cards', () => {
    it('should save and load all cards', () => {
      const cards = [makeCard({ q: 'Q1' }), makeCard({ q: 'Q2' })];
      saveAllCards(cards);
      const loaded = loadAllCards();
      expect(loaded.length).toBe(2);
      expect(loaded.map(c => c.q)).toContain('Q1');
      expect(loaded.map(c => c.q)).toContain('Q2');
    });

    it('should insert and get card by id', () => {
      const card = makeCard({ q: 'Inserted' });
      insertCard(card);
      const found = getCardById(card.id);
      if (found === null) throw new Error('expected card');
      expect(found.q).toBe('Inserted');
    });

    it('should update a card', () => {
      const card = makeCard({ q: 'Old' });
      insertCard(card);
      const updated = { ...card, q: 'New' };
      expect(updateCard(updated)).toBe(true);
      const foundCard = getCardById(card.id);
      if (foundCard === null) throw new Error('expected card');
      expect(foundCard.q).toBe('New');
    });

    it('should return false when updating non-existent card', () => {
      const result = updateCard(makeCard());
      expect(result).toBe(false);
    });

    it('should delete a card', () => {
      const card = makeCard();
      insertCard(card);
      expect(deleteCardById(card.id)).toBe(true);
      expect(getCardById(card.id)).toBeNull();
    });

    it('should return false when deleting non-existent card', () => {
      expect(deleteCardById('no-such-id')).toBe(false);
    });

    it('should get cards due before a timestamp', () => {
      const past = makeCard({ next_review: 100 });
      const future = makeCard({ next_review: 999999 });
      insertCard(past);
      insertCard(future);
      const due = getCardsDueBefore(500);
      expect(due.length).toBe(1);
      expect(due[0]?.id).toBe(past.id);
    });

    it('should return correct card count', () => {
      expect(getCardCount()).toBe(0);
      insertCard(makeCard());
      insertCard(makeCard());
      expect(getCardCount()).toBe(2);
    });

    it('should preserve tags through save/load', () => {
      const card = makeCard({ tags: ['a', 'b'] });
      saveAllCards([card]);
      const loaded = loadAllCards();
      expect(loaded[0]?.tags).toEqual(['a', 'b']);
    });
  });

  describe('Notes', () => {
    it('should save and load all notes', () => {
      const notes = [makeNote({ title: 'N1' }), makeNote({ title: 'N2' })];
      saveAllNotes(notes);
      const loaded = loadAllNotes();
      expect(loaded.length).toBe(2);
      expect(loaded.map(n => n.title)).toContain('N1');
    });

    it('should insert and get note by id', () => {
      const note = makeNote({ title: 'Inserted' });
      insertNote(note);
      const found = getNoteById(note.id);
      if (found === null) throw new Error('expected note');
      expect(found.title).toBe('Inserted');
    });

    it('should update a note', () => {
      const note = makeNote({ title: 'Old' });
      insertNote(note);
      const updated = { ...note, title: 'New', content: '# Heading\n[[Link]]' };
      expect(updateNote(updated)).toBe(true);
      const found = getNoteById(note.id);
      if (found === null) throw new Error('expected note');
      expect(found.title).toBe('New');
    });

    it('should return false when updating non-existent note', () => {
      expect(updateNote(makeNote())).toBe(false);
    });

    it('should delete a note', () => {
      const note = makeNote();
      insertNote(note);
      expect(deleteNoteById(note.id)).toBe(true);
      expect(getNoteById(note.id)).toBeNull();
    });

    it('should return false when deleting non-existent note', () => {
      expect(deleteNoteById('no-such-id')).toBe(false);
    });

    it('should get notes by folder', () => {
      insertNote(makeNote({ folder: 'A' }));
      insertNote(makeNote({ folder: 'B' }));
      insertNote(makeNote({ folder: 'A' }));
      expect(getNotesByFolder('A').length).toBe(2);
      expect(getNotesByFolder('B').length).toBe(1);
    });

    it('should return correct note count', () => {
      expect(getNoteCount()).toBe(0);
      insertNote(makeNote());
      expect(getNoteCount()).toBe(1);
    });

    it('should return all folders', () => {
      insertNote(makeNote({ folder: 'A' }));
      insertNote(makeNote({ folder: 'C' }));
      insertNote(makeNote({ folder: 'B' }));
      const folders = getAllFolders();
      expect(folders).toEqual(['A', 'B', 'C']);
    });

    it('should preserve headings and outgoing_links', () => {
      const note = makeNote({
        headings: [{ level: 1, text: 'H1' }],
        outgoing_links: ['Other'],
      });
      saveAllNotes([note]);
      const loaded = loadAllNotes();
      expect(loaded[0]?.headings).toEqual([{ level: 1, text: 'H1' }]);
      expect(loaded[0]?.outgoing_links).toEqual(['Other']);
    });
  });

  describe('Providers', () => {
    it('should start with no default providers on new db', () => {
      const providers = loadAllProviders();
      expect(providers.length).toBe(0);
    });

    it('should save and load a custom provider', () => {
      const id = saveProvider({ id: 'p-custom', type: 'openai', name: 'Custom', baseUrl: 'http://localhost', enabled: false, isDefault: false });
      const providers = loadAllProviders();
      const found = providers.find((p) => p.id === id);
      if (found === undefined) throw new Error('expected provider');
      expect(found.name).toBe('Custom');
    });

    it('should delete a provider', () => {
      const id = saveProvider({ type: 'openai', name: 'ToDelete', baseUrl: '', enabled: false });
      expect(deleteProvider(id)).toBe(true);
      const providers = loadAllProviders();
      expect(providers.some((p) => p.id === id)).toBe(false);
    });

    it('should set default provider', () => {
      const id = saveProvider({ type: 'openai', name: 'Default', baseUrl: '', enabled: false });
      expect(setDefaultProvider(id)).toBe(true);
      const providers = loadAllProviders();
      const found = providers.find((p) => p.id === id);
      if (found === undefined) throw new Error('expected provider');
      expect(found.isDefault).toBe(true);
    });

    it('should update provider enabled status', () => {
      const id = saveProvider({ type: 'openai', name: 'Toggle', baseUrl: '', enabled: false });
      expect(updateProviderEnabled(id, true)).toBe(true);
      const providers = loadAllProviders();
      const found = providers.find((p) => p.id === id);
      // @ts-expect-error - tested above
      expect(found.enabled).toBe(true);
    });

    it('should mask API keys in loadAllProvidersForClient', () => {
      const id = saveProvider({ type: 'openai', name: 'ClientMask', baseUrl: 'https://api.example.com', enabled: true });
      saveApiKey(id, { id: 'mask-key', name: 'default', key: 'sk-client-secret-value' });

      const internal = loadAllProviders();
      const client = loadAllProvidersForClient();
      const internalProvider = internal.find((p) => p.id === id);
      const clientProvider = client.find((p) => p.id === id);

      expect(internalProvider?.apiKeys[0]?.key).toBe('sk-client-secret-value');
      expect(clientProvider?.apiKeys[0]?.hasKey).toBe(true);
      expect(clientProvider?.apiKeys[0]?.key).not.toContain('sk-client-secret');
      expect(clientProvider?.apiKeys[0]?.key).toMatch(/^\*+$/);
    });
  });

  describe('API Keys', () => {
    it('should save and delete an API key', () => {
      const providerId = saveProvider({ type: 'openai', name: 'KeyTest', baseUrl: '', enabled: false });
      const keyId = saveApiKey(providerId, { name: 'prod', key: 'sk-secret' });
      expect(typeof keyId).toBe('string');

      const providers = loadAllProviders();
      const provider = providers.find((p) => p.id === providerId);
      if (provider === undefined) throw new Error('expected provider');
      const keys = provider.apiKeys;
      const key = keys.find((k) => k.id === keyId);
      if (key === undefined) throw new Error('expected key');
      expect(key.key).toBe('sk-secret');

      expect(deleteApiKey(keyId)).toBe(true);
      expect(deleteApiKey('non-existent')).toBe(false);
    });
  });

  describe('Models', () => {
    it('should save and delete a model', () => {
      const providerId = saveProvider({ type: 'openai', name: 'ModelTest', baseUrl: '', enabled: false });
      const modelId = saveModel(providerId, { name: 'GPT-4', modelId: 'gpt-4', port: 'openai', capabilities: ['tools'] });
      expect(typeof modelId).toBe('string');

      const providers = loadAllProviders();
      const provider = providers.find((p) => p.id === providerId);
      // @ts-expect-error - tested above
      const models = provider.models;
      expect(models.some((m) => m.id === modelId)).toBe(true);

      expect(deleteModel(modelId)).toBe(true);
      expect(deleteModel('non-existent')).toBe(false);
    });
  });

  describe('UI Settings', () => {
    it('should return defaults when no UI settings are saved', () => {
       expect(getUiSettings()).toEqual({
         chatPanelSide: 'right',
         language: 'zh-CN',
         fontSize: 'medium',
          dateFormat: 'yyyy-MM-dd',
       });
     });

    it('should save full UI settings and keep sidebar compatibility', () => {
      const saved = saveUiSettings({
        chatPanelSide: 'left',
        language: 'ja-JP',
        fontSize: 'large',
      });
     expect(saved).toEqual({
       chatPanelSide: 'left',
       language: 'ja-JP',
       fontSize: 'large',
        dateFormat: 'yyyy-MM-dd',
     });
      expect(getSidebarSettings()).toEqual({ chatPanelSide: 'left' });
    });

    it('should preserve existing UI settings during partial updates', () => {
      saveUiSettings({ language: 'en-US', fontSize: 'small', chatPanelSide: 'left' });
     expect(saveUiSettings({ fontSize: 'large' })).toEqual({
       chatPanelSide: 'left',
       language: 'en-US',
       fontSize: 'large',
        dateFormat: 'yyyy-MM-dd',
     });
    });

    it('should reject invalid UI settings at the persistence boundary', () => {
      expect(() => saveUiSettings({ language: 'fr-FR' as never })).toThrow('Invalid language');
      expect(() => saveUiSettings({ fontSize: 'huge' as never })).toThrow('Invalid font size');
      expect(() => saveUiSettings({ chatPanelSide: 'top' as never })).toThrow('Invalid chat panel side');
    });
  });

  describe('UUID & Transaction', () => {
    it('should generate UUID format provider id instead of numeric timestamp', () => {
      const id = saveProvider({ type: 'openai', name: 'UUIDTest', baseUrl: '', enabled: false });
      expect(/^\d+$/.test(id)).toBe(false);
      expect(id.length).toBeGreaterThan(10);
    });

    it('should not silently overwrite existing provider and cascade delete its keys', () => {
      const providerId = saveProvider({ type: 'openai', name: 'OverwriteTest', baseUrl: 'http://old', enabled: false });
      const keyId = saveApiKey(providerId, { name: 'key1', key: 'sk-old' });

      // Re-save with same id but different data (simulate update)
      saveProvider({ id: providerId, type: 'openai', name: 'OverwriteTest', baseUrl: 'http://new', enabled: true });

      const providers = loadAllProviders();
      const provider = providers.find((p) => p.id === providerId);
      if (provider === undefined) throw new Error('expected provider');
      expect(provider.baseUrl).toBe('http://new');
      expect(provider.enabled).toBe(true);
      // API key should still exist (UPSERT should not cascade delete)
      const key = provider.apiKeys.find((k) => k.id === keyId);
      if (key === undefined) throw new Error('expected key to survive UPSERT');
      expect(key.key).toBe('sk-old');
    });

    it('should rollback transaction on error', () => {
      const beforeCount = loadAllProviders().length;
      expect(() => {
        runInTransaction(() => {
          saveProvider({ type: 'openai', name: 'RollbackTest', baseUrl: '', enabled: false });
          throw new Error('intentional failure');
        });
      }).toThrow('intentional failure');
      const afterCount = loadAllProviders().length;
      expect(afterCount).toBe(beforeCount);
    });

    it('should return value from runInTransaction', () => {
      const result = runInTransaction(() => {
        const id = saveProvider({ type: 'openai', name: 'TxReturn', baseUrl: '', enabled: false });
        return id;
      });
      expect(typeof result).toBe('string');
      expect(/^\d+$/.test(result)).toBe(false);
    });
  });

  describe('Migration', () => {
    it('should migrate cards from JSON file', () => {
      const cardsFile = path.join(testDir, 'cards.json');
      fs.writeFileSync(cardsFile, JSON.stringify([makeCard({ q: 'Migrated' })]));
      migrateFromJson(cardsFile);
      const loaded = loadAllCards();
      expect(loaded.some(c => c.q === 'Migrated')).toBe(true);
    });

    it('should migrate notes from JSON file', () => {
      const notesFile = path.join(testDir, 'notes.json');
      fs.writeFileSync(notesFile, JSON.stringify([makeNote({ title: 'Migrated' })]));
      migrateFromJson(undefined, notesFile);
      const loaded = loadAllNotes();
      expect(loaded.some(n => n.title === 'Migrated')).toBe(true);
    });

    it('should handle missing migration files gracefully', () => {
      expect(() => migrateFromJson('/non-existent/cards.json', '/non-existent/notes.json')).not.toThrow();
    });

    it('should handle corrupted cards json gracefully', () => {
      const cardsFile = path.join(testDir, 'bad-cards.json');
      fs.writeFileSync(cardsFile, 'not-json');
      expect(() => migrateFromJson(cardsFile)).not.toThrow();
    });

    it('should handle corrupted notes json gracefully', () => {
      const notesFile = path.join(testDir, 'bad-notes.json');
      fs.writeFileSync(notesFile, 'not-json');
      expect(() => migrateFromJson(undefined, notesFile)).not.toThrow();
    });

    it('should handle corrupted tags json in database', () => {
      const db = getDb();
      // @ts-expect-error - getDb returns unknown in tests
      db.prepare('INSERT INTO cards (id, q, a, tags) VALUES (?, ?, ?, ?)')
        .run('bad-tags', 'Q', 'A', 'not-valid-json');
      const loaded = loadAllCards();
      const found = loaded.find(c => c.id === 'bad-tags');
      if (found === undefined) throw new Error('expected card');
      expect(found.tags).toEqual([]);
    });

    it('should handle corrupted headings json in database', () => {
      const db = getDb();
      // @ts-expect-error - getDb returns unknown in tests
      db.prepare('INSERT INTO notes (id, title, content, headings) VALUES (?, ?, ?, ?)')
        .run('bad-headings', 'Title', 'Content', 'not-valid-json');
      const loaded = loadAllNotes();
      const found = loaded.find(n => n.id === 'bad-headings');
      if (found === undefined) throw new Error('expected note');
      expect(found.headings).toEqual([]);
    });
  });

  describe('Utilities', () => {
    it('should checkpoint without error', () => {
      expect(() => checkpointDb()).not.toThrow();
    });

    it('should commit successful transaction', () => {
      runInTransaction(() => {
        insertCard(makeCard({ q: 'Tx' }));
      });
      expect(loadAllCards().some(c => c.q === 'Tx')).toBe(true);
    });

    it('should rollback failed transaction', () => {
      expect(() => {
        runInTransaction(() => {
          insertCard(makeCard({ q: 'TxFail' }));
          throw new Error('abort');
        });
      }).toThrow('abort');
      expect(loadAllCards().some(c => c.q === 'TxFail')).toBe(false);
    });
  });

  describe('Files', () => {
    function makeFile(overrides?: Partial<FileRecord>): FileRecord {
      return {
        id: 'file-' + Math.random().toString(36).slice(2),
        name: 'test.txt',
        type: 'document',
        size: 1024,
        mime_type: 'text/plain',
        parent_id: null,
        file_storage_path: '/tmp/test.txt',
        is_folder: 0,
        created_at: 1000,
        updated_at: 1000,
        ...overrides,
      };
    }

    it('should insert and load a file', () => {
      const file = makeFile({ name: 'doc.pdf' });
      insertFile(file);
      const all = loadAllFiles();
      expect(all.length).toBe(1);
      expect(all[0]?.name).toBe('doc.pdf');
    });

    it('should get file by id', () => {
      const file = makeFile();
      insertFile(file);
      const found = getFileById(file.id);
      if (found === null) throw new Error('expected file');
      expect(found.name).toBe('test.txt');
    });

    it('should return null for non-existent file', () => {
      expect(getFileById('no-such-id')).toBeNull();
    });

    it('should delete a file by id', () => {
      const file = makeFile();
      insertFile(file);
      expect(deleteFileById(file.id)).toBe(true);
      expect(getFileById(file.id)).toBeNull();
    });

    it('should return false when deleting non-existent file', () => {
      expect(deleteFileById('no-such-id')).toBe(false);
    });

    it('should get files by parent id', () => {
      const parent = makeFile({ id: 'parent-1', name: 'Folder', is_folder: 1, file_storage_path: null });
      const child = makeFile({ name: 'child.txt', parent_id: 'parent-1' });
      insertFile(parent);
      insertFile(child);

      const children = getFilesByParentId('parent-1');
      expect(children.length).toBe(1);
      expect(children[0]?.name).toBe('child.txt');
    });

    it('should get root files (null parent_id)', () => {
      const root = makeFile({ name: 'root.txt', parent_id: null });
      const child = makeFile({ name: 'nested.txt', parent_id: 'some-folder' });
      insertFile(root);
      insertFile(child);

      const roots = getFilesByParentId(null);
      expect(roots.some(f => f.name === 'root.txt')).toBe(true);
      expect(roots.some(f => f.name === 'nested.txt')).toBe(false);
    });

    it('should update file fields', () => {
      const file = makeFile();
      insertFile(file);
      const updated = updateFile({ id: file.id, name: 'renamed.txt' });
      expect(updated).toBe(true);

      const found = getFileById(file.id);
      if (found === null) throw new Error('expected file');
      expect(found.name).toBe('renamed.txt');
    });

    it('should return false when updating non-existent file', () => {
      expect(updateFile({ id: 'no-such' })).toBe(false);
    });

    it('should order folders before files', () => {
      const file = makeFile({ name: 'a.txt', is_folder: 0 });
      const folder = makeFile({ name: 'z-folder', is_folder: 1, file_storage_path: null });
      insertFile(file);
      insertFile(folder);

      const all = loadAllFiles();
      const fileIdx = all.findIndex(f => f.id === file.id);
      const folderIdx = all.findIndex(f => f.id === folder.id);
      expect(folderIdx).toBeLessThan(fileIdx);
    });
  });

  describe('edge cases', () => {
    it('updateCard handles non-existent id without error', () => {
      const result = updateCard({ id: 'nosuch', q: 'x', a: 'y' });
      expect(typeof result).toBe('boolean');
    });

    it('getCardsDueBefore returns empty array when no cards due', () => {
      const result = getCardsDueBefore(0);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('getNoteById returns null for non-existent id', () => {
      const result = getNoteById('nosuch');
      expect(result).toBeNull();
    });
  });
});
