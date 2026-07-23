import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FileRecord } from '../../src/core/types.js';
import {
  CURRENT_SCHEMA_VERSION,
  closeDb,
  getDatabaseStatus,
  getDb,
  initializeDatabase,
  insertFile,
  loadAllFiles,
  loadAllProviders,
  saveApiKey,
  saveProvider,
} from '../../src/db/database.js';

describe('Database lifecycle', () => {
  const originalDataDir = process.env.PAPYRUS_DATA_DIR;
  const originalLegacyDir = process.env.PAPYRUS_LEGACY_DATA_DIR;
  const originalFailureStage = process.env.PAPYRUS_TEST_MIGRATION_FAILURE_STAGE;
  const testRoots: string[] = [];

  function makeDataDir(label: string): string {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `papyrus-${label}-`));
    testRoots.push(dataDir);
    return dataDir;
  }

  function useDataDir(dataDir: string): void {
    closeDb();
    process.env.PAPYRUS_DATA_DIR = dataDir;
    delete process.env.PAPYRUS_LEGACY_DATA_DIR;
    delete process.env.PAPYRUS_ENABLE_SEED_DATA;
    delete process.env.PAPYRUS_TEST_MIGRATION_FAILURE_STAGE;
  }

  afterEach(() => {
    closeDb();
    delete process.env.PAPYRUS_LEGACY_DATA_DIR;
    delete process.env.PAPYRUS_ENABLE_SEED_DATA;
  });

  afterAll(() => {
    closeDb();
    if (originalDataDir === undefined) delete process.env.PAPYRUS_DATA_DIR;
    else process.env.PAPYRUS_DATA_DIR = originalDataDir;
    if (originalLegacyDir === undefined) delete process.env.PAPYRUS_LEGACY_DATA_DIR;
    else process.env.PAPYRUS_LEGACY_DATA_DIR = originalLegacyDir;
    if (originalFailureStage === undefined) delete process.env.PAPYRUS_TEST_MIGRATION_FAILURE_STAGE;
    else process.env.PAPYRUS_TEST_MIGRATION_FAILURE_STAGE = originalFailureStage;
    for (const testRoot of testRoots) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('atomically creates a clean schema-v1 database on first launch', () => {
    const dataDir = makeDataDir('fresh-db');
    useDataDir(dataDir);

    const status = initializeDatabase();
    const database = getDb();
    const schema = database.prepare('PRAGMA user_version').get() as { user_version: number };
    const tables = ['cards', 'notes', 'api_keys', 'chat_sessions', 'chat_messages', 'extensions'];

    expect(status).toEqual({
      state: 'ready',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      inheritedLegacyData: false,
    });
    expect(schema.user_version).toBe(CURRENT_SCHEMA_VERSION);
    for (const tableName of tables) {
      const row = database.prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`).get() as { count: number };
      expect(row.count).toBe(0);
    }
    expect(fs.readdirSync(dataDir).some(name => name.includes('.initializing-'))).toBe(false);
  });

  it('snapshots schema-0 data, migrates it, and preserves protected rows', () => {
    const dataDir = makeDataDir('upgrade-db');
    useDataDir(dataDir);
    const database = getDb();
    database.prepare(
      'INSERT INTO cards (id, q, a, next_review, interval, ef, repetitions, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('upgrade-card', 'question', 'answer', 0, 0, 2.5, 0, '[]');
    database.exec('PRAGMA user_version = 0');
    closeDb();

    const status = initializeDatabase();
    const migrated = getDb();
    const card = migrated.prepare('SELECT q, a FROM cards WHERE id = ?').get('upgrade-card') as {
      q: string;
      a: string;
    };
    const rollbackDir = path.join(dataDir, 'backups', 'pre-upgrade');

    expect(status.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(card).toEqual({ q: 'question', a: 'answer' });
    expect(fs.readdirSync(rollbackDir).some(name => name.endsWith('.db'))).toBe(true);
    expect(fs.readdirSync(rollbackDir).some(name => name.endsWith('.db.json'))).toBe(true);
  });

  it('restores the original database and quarantines a failed migration', () => {
    const dataDir = makeDataDir('rollback-db');
    useDataDir(dataDir);
    const dbPath = path.join(dataDir, 'papyrus.db');
    const broken = new DatabaseSync(dbPath);
    broken.exec(`
      CREATE TABLE marker (value TEXT NOT NULL);
      INSERT INTO marker (value) VALUES ('original');
      CREATE TABLE notes (id TEXT PRIMARY KEY);
      CREATE TABLE relations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        UNIQUE(source_id, target_id)
      );
      PRAGMA user_version = 0;
    `);
    broken.close();

    expect(() => initializeDatabase()).toThrow(/original database was restored/);
    expect(getDatabaseStatus().state).toBe('rolled_back');

    const restored = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const marker = restored.prepare('SELECT value FROM marker').get() as { value: string };
      const schema = restored.prepare('PRAGMA user_version').get() as { user_version: number };
      expect(marker.value).toBe('original');
      expect(schema.user_version).toBe(0);
    } finally {
      restored.close();
    }
    const failedRoot = path.join(dataDir, 'backups', 'failed-migrations');
    expect(fs.readdirSync(failedRoot).length).toBe(1);
  });

  it.each(['after_snapshot', 'after_migration', 'after_validation'] as const)(
    'restores schema-0 data when failure is injected %s',
    (failureStage) => {
      const dataDir = makeDataDir(`rollback-${failureStage}`);
      useDataDir(dataDir);
      const database = getDb();
      database.prepare(
        'INSERT INTO cards (id, q, a, next_review, interval, ef, repetitions, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(failureStage, 'preserved', 'answer', 0, 0, 2.5, 0, '[]');
      database.exec('PRAGMA user_version = 0');
      closeDb();
      process.env.PAPYRUS_TEST_MIGRATION_FAILURE_STAGE = failureStage;

      expect(() => initializeDatabase()).toThrow(new RegExp(`Injected migration failure at ${failureStage}`));

      const restored = new DatabaseSync(path.join(dataDir, 'papyrus.db'), { readOnly: true });
      try {
        const row = restored.prepare('SELECT q FROM cards WHERE id = ?').get(failureStage) as { q: string };
        const schema = restored.prepare('PRAGMA user_version').get() as { user_version: number };
        expect(row.q).toBe('preserved');
        expect(schema.user_version).toBe(0);
      } finally {
        restored.close();
      }
    },
  );

  it('refuses a newer schema without changing it', () => {
    const dataDir = makeDataDir('future-db');
    useDataDir(dataDir);
    const database = getDb();
    database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
    closeDb();

    expect(() => initializeDatabase()).toThrow(/newer than supported/);
    const untouched = new DatabaseSync(path.join(dataDir, 'papyrus.db'), { readOnly: true });
    try {
      const schema = untouched.prepare('PRAGMA user_version').get() as { user_version: number };
      expect(schema.user_version).toBe(CURRENT_SCHEMA_VERSION + 1);
    } finally {
      untouched.close();
    }
  });

  it('inherits a legacy database with its encryption key and vault files', () => {
    const legacyDir = makeDataDir('legacy-source');
    useDataDir(legacyDir);
    const providerId = saveProvider({
      type: 'openai',
      name: 'Legacy Provider',
      baseUrl: 'https://api.example.com',
      enabled: true,
    });
    saveApiKey(providerId, { id: 'legacy-key', name: 'default', key: 'sk-legacy-secret' });
    const vaultDir = path.join(legacyDir, 'vault');
    fs.mkdirSync(vaultDir, { recursive: true });
    const legacyFilePath = path.join(vaultDir, 'legacy-file.txt');
    fs.writeFileSync(legacyFilePath, 'legacy attachment');
    const fileRecord: FileRecord = {
      id: 'legacy-file',
      name: 'legacy-file.txt',
      type: 'document',
      size: 17,
      mime_type: 'text/plain',
      parent_id: null,
      file_storage_path: legacyFilePath,
      is_folder: 0,
      created_at: 1,
      updated_at: 1,
    };
    insertFile(fileRecord);
    closeDb();

    const canonicalDir = makeDataDir('legacy-destination');
    process.env.PAPYRUS_DATA_DIR = canonicalDir;
    process.env.PAPYRUS_LEGACY_DATA_DIR = legacyDir;

    const status = initializeDatabase();
    const provider = loadAllProviders().find(item => item.id === providerId);
    const inheritedFile = loadAllFiles().find(item => item.id === fileRecord.id);

    expect(status.inheritedLegacyData).toBe(true);
    expect(provider?.apiKeys[0]?.key).toBe('sk-legacy-secret');
    expect(inheritedFile?.file_storage_path).toBe(path.join(canonicalDir, 'vault', 'legacy-file.txt'));
    expect(fs.readFileSync(inheritedFile?.file_storage_path ?? '', 'utf8')).toBe('legacy attachment');
    expect(fs.existsSync(path.join(legacyDir, 'papyrus.db'))).toBe(true);
  });
});
