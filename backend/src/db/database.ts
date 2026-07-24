import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { paths, protectPrivateFile } from '../utils/paths.js';
import { encryptApiKey, decryptApiKey } from '../core/crypto.js';
import type { CardRecord, Note, Provider, FileRecord } from '../core/types.js';
import type { PapyrusLogger } from '../utils/logger.js';
import { maskApiKeyForDisplay } from '../utils/provider-security.js';

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db === null) {
    const dbPath = paths.dbFile;
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA busy_timeout = 5000;');
      protectPrivateFile(dbPath);
      initSchema(db);
      migrateLegacyCardsOnStartup(db);
    } catch (err) {
      const message = `Failed to open database at "${dbPath}": ${err instanceof Error ? err.message : String(err)}`;
      console.error(message);
      throw new Error(message);
    }
  }
  return db;
}

function closeDb(): void {
  if (db !== null) {
    db.close();
    db = null;
  }
}

function resetDb(): void {
  closeDb();
}

function isValidSnapshotPath(snapshotPath: string): boolean {
  if (!snapshotPath || typeof snapshotPath !== 'string') return false;
  if (snapshotPath.includes('\x00') || snapshotPath.includes("'") || snapshotPath.includes('..')) return false;
  if (!path.isAbsolute(snapshotPath)) return false;
  return true;
}

/** 使用 VACUUM INTO 创建数据库快照（包含 schema + seed 数据的干净副本，无 WAL） */
export function createDbSnapshot(snapshotPath: string): void {
  if (!isValidSnapshotPath(snapshotPath)) {
    throw new Error('Invalid snapshot path: must be absolute, and cannot contain \x00, quotes, or .. sequences');
  }
  const database = getDb();
  database.exec(`VACUUM INTO '${snapshotPath}'`);
}

/** 关闭数据库，从快照恢复，删除 WAL/SHM，重新打开 */
export function restoreDbSnapshot(snapshotPath: string): void {
  const dbPath = paths.dbFile;
  closeDb();
  fs.copyFileSync(snapshotPath, dbPath);
  try { fs.unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
  try { fs.unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  getDb();
}

function initSchema(database: DatabaseSync): void {
  try {
    const columns = database.prepare("SELECT name FROM pragma_table_info('extensions')").all() as Array<{ name: string }>;
    const existingColumns = new Set(columns.map(c => c.name));
    
    const missingColumns = [
      { name: 'description', type: "TEXT DEFAULT ''" },
      { name: 'version', type: "TEXT DEFAULT '1.0.0'" },
      { name: 'author', type: "TEXT DEFAULT 'Unknown'" },
      { name: 'rating', type: 'REAL DEFAULT 0.0' },
      { name: 'downloads', type: 'INTEGER DEFAULT 0' },
      { name: 'is_enabled', type: 'INTEGER DEFAULT 0' },
      { name: 'is_builtin', type: 'INTEGER DEFAULT 0' },
      { name: 'type', type: "TEXT DEFAULT 'local'" },
      { name: 'update_available', type: 'INTEGER DEFAULT 0' },
      { name: 'latest_version', type: 'TEXT' },
      { name: 'tags', type: "TEXT DEFAULT '[]'" },
      { name: 'config', type: "TEXT DEFAULT '{}'" },
      { name: 'installed_at', type: 'REAL DEFAULT 0.0' },
      { name: 'updated_at', type: 'REAL DEFAULT 0.0' },
    ];
    
    for (const col of missingColumns) {
      if (!existingColumns.has(col.name)) {
        database.exec(`ALTER TABLE extensions ADD COLUMN ${col.name} ${col.type};`);
      }
    }
  } catch {
  }

  try {
    const relationsDef = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='relations'"
    ).get() as { sql: string } | undefined;
    if (relationsDef && relationsDef.sql.includes('UNIQUE(source_id, target_id)') && !relationsDef.sql.includes('relation_type')) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS relations_new (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          target_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          relation_type TEXT NOT NULL DEFAULT 'reference',
          description TEXT DEFAULT '',
          created_at REAL DEFAULT 0.0,
          updated_at REAL DEFAULT 0.0,
          UNIQUE(source_id, target_id, relation_type)
        );
        INSERT OR IGNORE INTO relations_new SELECT * FROM relations;
        DROP TABLE relations;
        ALTER TABLE relations_new RENAME TO relations;
        CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
        CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
      `);
    }
  } catch (err) {
    console.error('迁移 relations 表约束失败:', err instanceof Error ? err.message : String(err));
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      q TEXT NOT NULL,
      a TEXT NOT NULL,
      next_review REAL DEFAULT 0.0,
      interval REAL DEFAULT 0.0,
      ef REAL DEFAULT 2.5,
      repetitions INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT '默认',
      content TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      tags TEXT DEFAULT '[]',
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0,
      word_count INTEGER DEFAULT 0,
      hash TEXT DEFAULT '',
      headings TEXT DEFAULT '[]',
      outgoing_links TEXT DEFAULT '[]',
      incoming_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      enabled INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'default',
      encrypted_key TEXT NOT NULL DEFAULT '',
      created_at REAL DEFAULT 0.0,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provider_models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      model_id TEXT NOT NULL,
      port TEXT NOT NULL,
      capabilities TEXT DEFAULT '[]',
      api_key_id TEXT,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      tags TEXT DEFAULT '[]',
      word_count INTEGER DEFAULT 0,
      hash TEXT DEFAULT '',
      headings TEXT DEFAULT '[]',
      outgoing_links TEXT DEFAULT '[]',
      incoming_count INTEGER DEFAULT 0,
      created_at REAL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS card_versions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      q TEXT NOT NULL,
      a TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      content_hash TEXT DEFAULT '',
      created_at REAL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review);
    CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_hash ON notes(hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id);
    CREATE INDEX IF NOT EXISTS idx_models_provider ON provider_models(provider_id);
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'unknown',
      size INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT '',
      parent_id TEXT,
      file_storage_path TEXT,
      is_folder INTEGER DEFAULT 0,
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
    CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_card_versions_card ON card_versions(card_id, version DESC);

    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL DEFAULT 'reference',
      description TEXT DEFAULT '',
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0,
      UNIQUE(source_id, target_id, relation_type)
    );

    CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
    CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新对话',
      model TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at REAL NOT NULL DEFAULT 0.0,
      updated_at REAL NOT NULL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
      content TEXT NOT NULL DEFAULT '',
      blocks TEXT NOT NULL DEFAULT '[]',
      attachments TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      token_usage TEXT NOT NULL DEFAULT '{}',
      parent_message_id TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at REAL NOT NULL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_chat_msgs_session ON chat_messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_msgs_parent ON chat_messages(parent_message_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(is_active);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS extensions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      type TEXT NOT NULL DEFAULT 'local',
      author TEXT NOT NULL DEFAULT 'Unknown',
      rating REAL DEFAULT 0.0,
      downloads INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 0,
      is_builtin INTEGER DEFAULT 0,
      update_available INTEGER DEFAULT 0,
      latest_version TEXT,
      tags TEXT DEFAULT '[]',
      config TEXT DEFAULT '{}',
      installed_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_extensions_enabled ON extensions(is_enabled);

    CREATE TABLE IF NOT EXISTS daily_progress (
      date TEXT PRIMARY KEY,
      cards_created INTEGER DEFAULT 0,
      cards_reviewed INTEGER DEFAULT 0,
      notes_created INTEGER DEFAULT 0,
      study_minutes INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      source_path TEXT NOT NULL DEFAULT '',
      imported_count INTEGER NOT NULL DEFAULT 0,
      completed_at REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS card_review_actions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      previous_next_review REAL NOT NULL,
      previous_interval REAL NOT NULL,
      previous_ef REAL NOT NULL,
      previous_repetitions INTEGER NOT NULL,
      rated_next_review REAL NOT NULL,
      rated_interval REAL NOT NULL,
      rated_ef REAL NOT NULL,
      rated_repetitions INTEGER NOT NULL,
      review_date TEXT NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0,
      created_at REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_card_review_actions_card_created
      ON card_review_actions(card_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS knowledge_branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      head_version_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_versions (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL REFERENCES knowledge_branches(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK(kind IN ('manual', 'safety')),
      manifest_path TEXT NOT NULL,
      stats_json TEXT NOT NULL DEFAULT '{}',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_versions_branch_created
      ON knowledge_versions(branch_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ui_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at REAL NOT NULL
    );

    INSERT OR IGNORE INTO knowledge_branches
      (id, name, head_version_id, is_active, created_at, updated_at)
    VALUES
      ('main', 'main', NULL, 1, unixepoch(), unixepoch());
  `);

  seedDefaults(database);

  deduplicateData(database);

  try {
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_unique ON providers(type, name, base_url);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_models_unique ON provider_models(provider_id, model_id);
    `);
  } catch (err) {
    console.error('创建唯一索引失败:', err instanceof Error ? err.message : String(err));
  }
}

function deduplicateData(database: DatabaseSync): void {
  try {
    database.exec('BEGIN TRANSACTION;');

    // Step 1: Deduplicate providers by (type, name, base_url)
    // Keep the one that is default, or has the earliest created_at, or minimum id
    const providerDups = database.prepare(`
      SELECT type, name, base_url,
        COALESCE(
          MIN(CASE WHEN is_default = 1 THEN id END),
          MIN(CASE WHEN created_at > 0 THEN id END),
          MIN(id)
        ) as keeper_id,
        COUNT(*) as cnt
      FROM providers
      GROUP BY type, name, base_url
      HAVING cnt > 1
    `).all() as Array<{ type: string; name: string; base_url: string; keeper_id: string }>;

    for (const dup of providerDups) {
      const dupIds = database.prepare(
        'SELECT id FROM providers WHERE type = ? AND name = ? AND base_url = ? AND id != ?'
      ).all(dup.type, dup.name, dup.base_url, dup.keeper_id) as Array<{ id: string }>;

      for (const { id } of dupIds) {
        database.prepare('UPDATE api_keys SET provider_id = ? WHERE provider_id = ?').run(dup.keeper_id, id);
        database.prepare('UPDATE provider_models SET provider_id = ? WHERE provider_id = ?').run(dup.keeper_id, id);
        database.prepare('DELETE FROM providers WHERE id = ?').run(id);
      }
    }

    if (providerDups.length > 0) {
      console.info(`数据去重: 清理 ${providerDups.length} 组重复供应商`);
    }

    // Step 2: Deduplicate models by (provider_id, model_id)
    // Keep enabled one if possible, otherwise minimum id
    const modelDups = database.prepare(`
      SELECT provider_id, model_id,
        COALESCE(MIN(CASE WHEN enabled = 1 THEN id END), MIN(id)) as keeper_id,
        COUNT(*) as cnt
      FROM provider_models
      GROUP BY provider_id, model_id
      HAVING cnt > 1
    `).all() as Array<{ provider_id: string; model_id: string; keeper_id: string }>;

    for (const dup of modelDups) {
      database.prepare(
        'DELETE FROM provider_models WHERE provider_id = ? AND model_id = ? AND id != ?'
      ).run(dup.provider_id, dup.model_id, dup.keeper_id);
    }

    if (modelDups.length > 0) {
      console.info(`数据去重: 清理 ${modelDups.length} 组重复模型`);
    }

    database.exec('COMMIT;');
  } catch (err) {
    database.exec('ROLLBACK;');
    console.error('数据去重失败:', err instanceof Error ? err.message : String(err));
  }
}

function seedDefaults(database: DatabaseSync): void {
  const now = Date.now();
  const extensionCount = (database.prepare('SELECT COUNT(*) as c FROM extensions WHERE is_builtin = 1').get() as { c: number }).c;
  if (extensionCount === 0) {
    const builtinExtensions = [
      { id: 'core.markdown', name: 'Markdown 增强', description: '提供 Markdown 编辑、预览与导出能力', version: '1.0.0', author: 'Papyrus Team', rating: 4.9, downloads: 12000, tags: ['编辑器', '内置'] },
      { id: 'core.obsidian-import', name: 'Obsidian 导入', description: '将 Obsidian Vault 中的笔记一键导入 Papyrus Desktop', version: '1.0.0', author: 'Papyrus Team', rating: 4.8, downloads: 8800, tags: ['导入', '内置'] },
      { id: 'community.theme-pack', name: '主题包', description: '一组社区贡献的视觉主题，支持深色与高对比度', version: '0.4.2', author: 'Community', rating: 4.5, downloads: 3200, tags: ['主题', '社区'] },
      { id: 'lab.ai-cards', name: 'AI 自动制卡', description: '基于笔记内容自动生成学习卡片', version: '0.2.1', author: 'Papyrus Lab', rating: 4.2, downloads: 2100, tags: ['AI', '实验'] },
    ];

    for (const ext of builtinExtensions) {
      database.prepare(
        `INSERT INTO extensions (id, name, description, version, type, author, rating, downloads, is_enabled, is_builtin, update_available, latest_version, tags, config, installed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ext.id, ext.name, ext.description, ext.version, 'builtin', ext.author, ext.rating, ext.downloads,
        1, 1, 0, ext.version, JSON.stringify(ext.tags), '{}', now / 1000, now / 1000
      );
    }
  }
}

function tagsToJson(tags: string[] | undefined): string {
  return JSON.stringify(tags ?? []);
}

function tagsFromJson(tagsJson: string | undefined): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // ignore
  }
  return [];
}

function jsonFromStr(jsonStr: string | undefined): unknown[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return [];
}

// ==================== Cards ====================

export function loadAllCards(logger?: PapyrusLogger): CardRecord[] {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM cards');
  const rows = stmt.all() as Array<{
    id: string;
    q: string;
    a: string;
    next_review: number;
    interval: number;
    ef: number;
    repetitions: number;
    tags: string;
  }>;

  const cards = rows.map(row => ({
    id: row.id,
    q: row.q,
    a: row.a,
    next_review: row.next_review,
    interval: row.interval,
    ef: row.ef,
    repetitions: row.repetitions,
    tags: tagsFromJson(row.tags),
  }));

  logger?.info(`从数据库加载 ${cards.length} 张卡片`);
  return cards;
}

export function saveAllCards(cards: CardRecord[], logger?: PapyrusLogger): void {
  const database = getDb();
  database.exec('BEGIN TRANSACTION;');
  try {
    database.exec('DELETE FROM cards');
    const stmt = database.prepare(
      'INSERT INTO cards (id, q, a, next_review, interval, ef, repetitions, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const card of cards) {
      stmt.run(card.id, card.q, card.a, card.next_review, card.interval, card.ef, card.repetitions, tagsToJson(card.tags));
    }
    database.exec('COMMIT;');
    logger?.info(`保存 ${cards.length} 张卡片到数据库`);
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function insertCard(card: CardRecord, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT OR REPLACE INTO cards (id, q, a, next_review, interval, ef, repetitions, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(card.id, card.q, card.a, card.next_review ?? 0, card.interval ?? 0, card.ef ?? 2.5, card.repetitions ?? 0, tagsToJson(card.tags));
  logger?.info(`插入卡片: ${card.id}`);
}

export function deleteCardById(cardId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM cards WHERE id = ?');
  const result = stmt.run(cardId);
  logger?.info(`删除卡片: ${cardId}`);
  return result.changes > 0;
}

export function deleteCardsByIds(cardIds: string[], logger?: PapyrusLogger): number {
  if (cardIds.length === 0) return 0;
  const database = getDb();
  const placeholders = cardIds.map(() => '?').join(',');
  const stmt = database.prepare(`DELETE FROM cards WHERE id IN (${placeholders})`);
  const result = stmt.run(...cardIds);
  logger?.info(`批量删除 ${result.changes} 张卡片`);
  return Number(result.changes);
}

export function getCardById(cardId: string): CardRecord | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM cards WHERE id = ?');
  const row = stmt.get(cardId) as {
    id: string;
    q: string;
    a: string;
    next_review: number;
    interval: number;
    ef: number;
    repetitions: number;
    tags: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    q: row.q,
    a: row.a,
    next_review: row.next_review,
    interval: row.interval,
    ef: row.ef,
    repetitions: row.repetitions,
    tags: tagsFromJson(row.tags),
  };
}

export function updateCard(card: CardRecord, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE cards SET q = ?, a = ?, next_review = ?, interval = ?, ef = ?, repetitions = ?, tags = ? WHERE id = ?'
  );
  const result = stmt.run(card.q, card.a, card.next_review ?? 0, card.interval ?? 0, card.ef ?? 2.5, card.repetitions ?? 0, tagsToJson(card.tags), card.id);
  logger?.info(`更新卡片: ${card.id}`);
  return result.changes > 0;
}

export function getCardsDueBefore(timestamp: number): CardRecord[] {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM cards WHERE next_review <= ?');
  const rows = stmt.all(timestamp) as Array<{
    id: string;
    q: string;
    a: string;
    next_review: number;
    interval: number;
    ef: number;
    repetitions: number;
    tags: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    q: row.q,
    a: row.a,
    next_review: row.next_review,
    interval: row.interval,
    ef: row.ef,
    repetitions: row.repetitions,
    tags: tagsFromJson(row.tags),
  }));
}

export function getCardCount(): number {
  const database = getDb();
  const stmt = database.prepare('SELECT COUNT(*) as count FROM cards');
  const row = stmt.get() as { count: number };
  return row.count;
}

// 表示一次可撤销评分在数据库中保存的前后调度状态，供核心层验证撤销顺序并恢复卡片。
// 原因：撤销必须跨 React 生命周期持久化，且需要同时回滚 SM-2 字段和每日复习计数。
// 未保存整张卡片 JSON：问答与标签不受评分影响，结构化列更易校验且避免反序列化不可信内容。
export interface CardReviewActionRecord {
  id: string;
  card_id: string;
  previous_next_review: number;
  previous_interval: number;
  previous_ef: number;
  previous_repetitions: number;
  rated_next_review: number;
  rated_interval: number;
  rated_ef: number;
  rated_repetitions: number;
  review_date: string;
  undone: number;
  created_at: number;
}

// 写入一次评分的可撤销快照，输入为评分前后调度字段，输出为空。
// 原因：评分成功后必须拥有稳定的服务端操作 ID，前端不能仅依赖易丢失的本地状态。
// 未使用内存 Map：应用或后端重启会丢失 Map，无法满足持久化撤销语义。
export function insertCardReviewAction(action: CardReviewActionRecord): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO card_review_actions (
      id, card_id,
      previous_next_review, previous_interval, previous_ef, previous_repetitions,
      rated_next_review, rated_interval, rated_ef, rated_repetitions,
      review_date, undone, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    action.id,
    action.card_id,
    action.previous_next_review,
    action.previous_interval,
    action.previous_ef,
    action.previous_repetitions,
    action.rated_next_review,
    action.rated_interval,
    action.rated_ef,
    action.rated_repetitions,
    action.review_date,
    action.undone,
    action.created_at,
  );
}

// 按操作 ID 和卡片 ID 读取未撤销评分，输入两个标识，输出记录或 null。
// 原因：同时约束卡片 ID 可防止客户端把一个合法操作 ID 用到另一张卡片。
// 未只按最新记录查询：显式操作 ID 能让并发请求和重试保持确定性。
export function getPendingCardReviewAction(
  actionId: string,
  cardId: string,
): CardReviewActionRecord | null {
  const database = getDb();
  const row = database.prepare(`
    SELECT *
    FROM card_review_actions
    WHERE id = ? AND card_id = ? AND undone = 0
  `).get(actionId, cardId);
  if (row === undefined) return null;

  // node:sqlite 对查询结果提供无原型行对象；SQL schema 已固定每列类型，因此在此边界收窄。
  // 未在调用方重复断言：集中于数据库适配层可让核心业务保持完整静态类型。
  return row as unknown as CardReviewActionRecord;
}

// 将评分操作标为已撤销，输入操作 ID，输出是否真正更新了一行。
// 原因：条件更新保证重复点击只能成功一次，避免每日计数被多次扣减。
// 未删除记录：保留 tombstone 能区分未发生与已经撤销，并支持审计。
export function markCardReviewActionUndone(actionId: string): boolean {
  const database = getDb();
  const result = database.prepare(
    'UPDATE card_review_actions SET undone = 1 WHERE id = ? AND undone = 0',
  ).run(actionId);
  return Number(result.changes) === 1;
}

// ==================== Notes ====================

function noteFromRow(row: {
  id: string;
  title: string;
  folder: string;
  content: string;
  preview: string;
  tags: string;
  created_at: number;
  updated_at: number;
  word_count: number;
  hash: string;
  headings: string;
  outgoing_links: string;
  incoming_count: number;
}): Note {
  return {
    id: row.id,
    title: row.title,
    folder: row.folder,
    content: row.content,
    preview: row.preview,
    tags: tagsFromJson(row.tags),
    created_at: row.created_at,
    updated_at: row.updated_at,
    word_count: row.word_count,
    hash: row.hash,
    headings: jsonFromStr(row.headings) as Array<{ level: number; text: string }>,
    outgoing_links: jsonFromStr(row.outgoing_links) as string[],
    incoming_count: row.incoming_count,
  };
}

export function loadAllNotes(logger?: PapyrusLogger): Note[] {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM notes ORDER BY updated_at DESC');
  const rows = stmt.all() as Array<{
    id: string;
    title: string;
    folder: string;
    content: string;
    preview: string;
    tags: string;
    created_at: number;
    updated_at: number;
    word_count: number;
    hash: string;
    headings: string;
    outgoing_links: string;
    incoming_count: number;
  }>;

  const notes = rows.map(noteFromRow);
  logger?.info(`从数据库加载 ${notes.length} 条笔记`);
  return notes;
}

export function saveAllNotes(notes: Note[], logger?: PapyrusLogger): void {
  const database = getDb();
  database.exec('BEGIN TRANSACTION;');
  try {
    database.exec('DELETE FROM notes');
    const stmt = database.prepare(
      'INSERT INTO notes (id, title, folder, content, preview, tags, created_at, updated_at, word_count, hash, headings, outgoing_links, incoming_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const note of notes) {
      stmt.run(
        note.id, note.title, note.folder, note.content, note.preview,
        tagsToJson(note.tags), note.created_at, note.updated_at, note.word_count,
        note.hash, JSON.stringify(note.headings), JSON.stringify(note.outgoing_links), note.incoming_count
      );
    }
    database.exec('COMMIT;');
    logger?.info(`保存 ${notes.length} 条笔记到数据库`);
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function insertNote(note: Note, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT OR REPLACE INTO notes (id, title, folder, content, preview, tags, created_at, updated_at, word_count, hash, headings, outgoing_links, incoming_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(
    note.id, note.title, note.folder, note.content, note.preview,
    tagsToJson(note.tags), note.created_at, note.updated_at, note.word_count,
    note.hash, JSON.stringify(note.headings), JSON.stringify(note.outgoing_links), note.incoming_count
  );
  logger?.info(`插入笔记: ${note.id}`);
}

export function deleteNoteById(noteId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  try {
    database.exec('BEGIN TRANSACTION;');
    // 更新被该笔记引用的笔记的 incoming_count
    const updateStmt = database.prepare(
      'UPDATE notes SET incoming_count = incoming_count - 1 WHERE id IN (SELECT target_id FROM relations WHERE source_id = ?)'
    );
    updateStmt.run(noteId);
    // 删除笔记（relations 会 CASCADE）
    const deleteStmt = database.prepare('DELETE FROM notes WHERE id = ?');
    const result = deleteStmt.run(noteId);
    database.exec('COMMIT;');
    logger?.info(`删除笔记: ${noteId}`);
    return result.changes > 0;
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function deleteNotesByIds(noteIds: string[], logger?: PapyrusLogger): number {
  if (noteIds.length === 0) return 0;
  const database = getDb();
  database.exec('BEGIN TRANSACTION;');
  try {
    // Update incoming_count for notes referenced by the deleted notes
    for (const noteId of noteIds) {
      const updateStmt = database.prepare(
        'UPDATE notes SET incoming_count = incoming_count - 1 WHERE id IN (SELECT target_id FROM relations WHERE source_id = ?)'
      );
      updateStmt.run(noteId);
    }
    const placeholders = noteIds.map(() => '?').join(',');
    const stmt = database.prepare(`DELETE FROM notes WHERE id IN (${placeholders})`);
    const result = stmt.run(...noteIds);
    database.exec('COMMIT;');
    logger?.info(`批量删除 ${result.changes} 条笔记`);
    return Number(result.changes);
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function getNoteById(noteId: string): Note | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM notes WHERE id = ?');
  const row = stmt.get(noteId) as {
    id: string;
    title: string;
    folder: string;
    content: string;
    preview: string;
    tags: string;
    created_at: number;
    updated_at: number;
    word_count: number;
    hash: string;
    headings: string;
    outgoing_links: string;
    incoming_count: number;
  } | undefined;

  if (!row) return null;
  return noteFromRow(row);
}

export function updateNote(note: Note, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE notes SET title = ?, folder = ?, content = ?, preview = ?, tags = ?, updated_at = ?, word_count = ?, hash = ?, headings = ?, outgoing_links = ?, incoming_count = ? WHERE id = ?'
  );
  const result = stmt.run(
    note.title, note.folder, note.content, note.preview, tagsToJson(note.tags),
    note.updated_at, note.word_count, note.hash, JSON.stringify(note.headings),
    JSON.stringify(note.outgoing_links), note.incoming_count, note.id
  );
  logger?.info(`更新笔记: ${note.id}`);
  return result.changes > 0;
}

export function getNotesByFolder(folder: string): Note[] {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM notes WHERE folder = ? ORDER BY updated_at DESC');
  const rows = stmt.all(folder) as Array<{
    id: string;
    title: string;
    folder: string;
    content: string;
    preview: string;
    tags: string;
    created_at: number;
    updated_at: number;
    word_count: number;
    hash: string;
    headings: string;
    outgoing_links: string;
    incoming_count: number;
  }>;
  return rows.map(noteFromRow);
}

export function getNoteCount(): number {
  const database = getDb();
  const stmt = database.prepare('SELECT COUNT(*) as count FROM notes');
  const row = stmt.get() as { count: number };
  return row.count;
}

export function getAllFolders(): string[] {
  const database = getDb();
  const stmt = database.prepare('SELECT DISTINCT folder FROM notes ORDER BY folder');
  const rows = stmt.all() as Array<{ folder: string }>;
  return rows.map(r => r.folder);
}

// ==================== Providers ====================

export function loadAllProviders(_logger?: PapyrusLogger): Provider[] {
  const database = getDb();
  const providerStmt = database.prepare('SELECT * FROM providers ORDER BY created_at');
  const providerRows = providerStmt.all() as Array<{
    id: string;
    type: string;
    name: string;
    base_url: string;
    enabled: number;
    is_default: number;
  }>;

  const keyStmt = database.prepare('SELECT * FROM api_keys WHERE provider_id = ? ORDER BY name');
  const modelStmt = database.prepare('SELECT * FROM provider_models WHERE provider_id = ? ORDER BY name');

  const providers: Provider[] = [];
  for (const row of providerRows) {
    const keyRows = keyStmt.all(row.id) as Array<{ id: string; name: string; encrypted_key: string }>;
    const apiKeys = keyRows.map(k => ({
      id: k.id,
      name: k.name,
      key: decryptApiKey(k.encrypted_key),
    }));

    const modelRows = modelStmt.all(row.id) as Array<{
      id: string;
      name: string;
      model_id: string;
      port: string;
      capabilities: string;
      api_key_id: string;
      enabled: number;
    }>;
    const models = modelRows.map(m => ({
      id: m.id,
      name: m.name,
      modelId: m.model_id,
      port: m.port,
      capabilities: jsonFromStr(m.capabilities) as string[],
      apiKeyId: m.api_key_id ?? null,
      enabled: Boolean(m.enabled),
    }));

    providers.push({
      id: row.id,
      type: row.type,
      name: row.name,
      baseUrl: row.base_url,
      enabled: Boolean(row.enabled),
      isDefault: Boolean(row.is_default),
      apiKeys,
      models,
    });
  }

  // 防御性去重：即使数据库出现重复，输出层也不渲染重复项
  const seenProviders = new Set<string>();
  const dedupedProviders: Provider[] = [];
  for (const p of providers) {
    const key = `${p.type}|${p.name}|${p.baseUrl}`;
    if (seenProviders.has(key)) continue;
    seenProviders.add(key);

    const seenModels = new Set<string>();
    const dedupedModels = p.models.filter(m => {
      if (seenModels.has(m.modelId)) return false;
      seenModels.add(m.modelId);
      return true;
    });

    dedupedProviders.push({ ...p, models: dedupedModels });
  }

  return dedupedProviders;
}

// 为客户端 API 加载 providers，不回传明文 API Key。
// 原因：GET /api/providers 曾被未认证客户端直接读取全部密钥。
// 未复用 loadAllProviders 后脱敏：避免无意义的解密再掩码，降低密钥暴露窗口。
export function loadAllProvidersForClient(_logger?: PapyrusLogger): Provider[] {
  const database = getDb();
  const providerStmt = database.prepare('SELECT * FROM providers ORDER BY created_at');
  const providerRows = providerStmt.all() as Array<{
    id: string;
    type: string;
    name: string;
    base_url: string;
    enabled: number;
    is_default: number;
  }>;

  const keyStmt = database.prepare('SELECT id, name, encrypted_key FROM api_keys WHERE provider_id = ? ORDER BY name');
  const modelStmt = database.prepare('SELECT * FROM provider_models WHERE provider_id = ? ORDER BY name');

  const providers: Provider[] = [];
  for (const row of providerRows) {
    const keyRows = keyStmt.all(row.id) as Array<{ id: string; name: string; encrypted_key: string }>;
    const apiKeys = keyRows.map((k) => {
      const masked = maskApiKeyForDisplay(Boolean(k.encrypted_key));
      return {
        id: k.id,
        name: k.name,
        key: masked.key,
        hasKey: masked.hasKey,
      };
    });

    const modelRows = modelStmt.all(row.id) as Array<{
      id: string;
      name: string;
      model_id: string;
      port: string;
      capabilities: string;
      api_key_id: string;
      enabled: number;
    }>;
    const models = modelRows.map(m => ({
      id: m.id,
      name: m.name,
      modelId: m.model_id,
      port: m.port,
      capabilities: jsonFromStr(m.capabilities) as string[],
      apiKeyId: m.api_key_id ?? null,
      enabled: Boolean(m.enabled),
    }));

    providers.push({
      id: row.id,
      type: row.type,
      name: row.name,
      baseUrl: row.base_url,
      enabled: Boolean(row.enabled),
      isDefault: Boolean(row.is_default),
      apiKeys,
      models,
    });
  }

  const seenProviders = new Set<string>();
  const dedupedProviders: Provider[] = [];
  for (const p of providers) {
    const key = `${p.type}|${p.name}|${p.baseUrl}`;
    if (seenProviders.has(key)) continue;
    seenProviders.add(key);

    const seenModels = new Set<string>();
    const dedupedModels = p.models.filter(m => {
      if (seenModels.has(m.modelId)) return false;
      seenModels.add(m.modelId);
      return true;
    });

    dedupedProviders.push({ ...p, models: dedupedModels });
  }

  return dedupedProviders;
}

function inferProviderType(baseUrl: string | undefined, fallbackType: string | undefined): string {
  if (fallbackType && fallbackType !== 'custom') return fallbackType;
  const url = (baseUrl ?? '').toLowerCase();
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('openai.com')) return 'openai';
  if (url.includes('anthropic.com')) return 'anthropic';
  if (url.includes('google') || url.includes('gemini')) return 'gemini';
  if (url.includes('moonshot')) return 'moonshot';
  if (url.includes('siliconflow')) return 'siliconflow';
  if (url.includes('localhost:11434') || url.includes('ollama')) return 'ollama';
  return fallbackType ?? 'custom';
}

export function saveProvider(provider: Partial<Provider> & { id?: string }, logger?: PapyrusLogger): string {
  const database = getDb();
  const providerType = inferProviderType(provider.baseUrl, provider.type);

  let providerId: string;
  if (provider.id) {
    providerId = provider.id;
  } else {
    const existing = database.prepare(
      'SELECT id FROM providers WHERE type = ? AND name = ? AND base_url = ?'
    ).get(providerType, provider.name ?? '', provider.baseUrl ?? '') as { id: string } | undefined;
    providerId = existing?.id ?? randomUUID();
  }

  const now = Date.now() / 1000;

  const existing = database.prepare('SELECT id FROM providers WHERE id = ?').get(providerId) as { id: string } | undefined;
  if (existing) {
    database.prepare(
      'UPDATE providers SET type = ?, name = ?, base_url = ?, enabled = ?, is_default = ?, updated_at = ? WHERE id = ?'
    ).run(
      providerType,
      provider.name ?? '',
      provider.baseUrl ?? '',
      provider.enabled ? 1 : 0,
      provider.isDefault ? 1 : 0,
      now,
      providerId
    );
  } else {
    database.prepare(
      'INSERT INTO providers (id, type, name, base_url, enabled, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      providerId,
      providerType,
      provider.name ?? '',
      provider.baseUrl ?? '',
      provider.enabled ? 1 : 0,
      provider.isDefault ? 1 : 0,
      now,
      now
    );
  }
  logger?.info(`Provider saved: ${provider.name}`);
  return providerId;
}

export function deleteProvider(providerId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM providers WHERE id = ?');
  const result = stmt.run(providerId);
  logger?.info(`Provider deleted: ${providerId}`);
  return result.changes > 0;
}

export function setDefaultProvider(providerId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  database.exec('UPDATE providers SET is_default = 0');
  const stmt = database.prepare('UPDATE providers SET is_default = 1 WHERE id = ?');
  const result = stmt.run(providerId);
  logger?.info(`Default provider set: ${providerId}`);
  return result.changes > 0;
}

export function updateProviderEnabled(providerId: string, enabled: boolean, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('UPDATE providers SET enabled = ? WHERE id = ?');
  const result = stmt.run(enabled ? 1 : 0, providerId);
  logger?.info(`Provider enabled updated: ${providerId} = ${enabled}`);
  return result.changes > 0;
}

// ==================== API Keys ====================

export function saveApiKey(providerId: string, apiKey: { id?: string; name?: string; key: string }, logger?: PapyrusLogger): string {
  const database = getDb();
  const keyId = apiKey.id ?? randomUUID();
  const now = Date.now() / 1000;

  const existing = database.prepare('SELECT id FROM api_keys WHERE id = ?').get(keyId) as { id: string } | undefined;
  if (existing) {
    database.prepare(
      'UPDATE api_keys SET provider_id = ?, name = ?, encrypted_key = ?, created_at = COALESCE(created_at, ?) WHERE id = ?'
    ).run(providerId, apiKey.name ?? 'default', encryptApiKey(apiKey.key), now, keyId);
  } else {
    database.prepare(
      'INSERT INTO api_keys (id, provider_id, name, encrypted_key, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(keyId, providerId, apiKey.name ?? 'default', encryptApiKey(apiKey.key), now);
  }
  logger?.info(`API key saved: ${keyId}`);
  return keyId;
}

export function deleteApiKey(keyId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM api_keys WHERE id = ?');
  const result = stmt.run(keyId);
  logger?.info(`API key deleted: ${keyId}`);
  return result.changes > 0;
}

// ==================== Models ====================

export function saveModel(providerId: string, model: { id?: string; name?: string; modelId?: string; port?: string; capabilities?: string[]; apiKeyId?: string | null; enabled?: boolean }, logger?: PapyrusLogger): string {
  const database = getDb();

  const existingByProviderModel = database.prepare(
    'SELECT id FROM provider_models WHERE provider_id = ? AND model_id = ?'
  ).get(providerId, model.modelId ?? '') as { id: string } | undefined;

  let modelId: string;
  if (existingByProviderModel) {
    modelId = existingByProviderModel.id;
  } else if (model.id) {
    modelId = model.id;
  } else {
    modelId = randomUUID();
  }

  const existingById = database.prepare('SELECT id FROM provider_models WHERE id = ?').get(modelId) as { id: string } | undefined;
  if (existingById) {
    database.prepare(
      'UPDATE provider_models SET provider_id = ?, name = ?, model_id = ?, port = ?, capabilities = ?, api_key_id = ?, enabled = ? WHERE id = ?'
    ).run(
      providerId,
      model.name ?? '',
      model.modelId ?? '',
      model.port ?? 'openai',
      JSON.stringify(model.capabilities ?? []),
      model.apiKeyId ?? null,
      model.enabled ? 1 : 0,
      modelId
    );
  } else {
    database.prepare(
      'INSERT INTO provider_models (id, provider_id, name, model_id, port, capabilities, api_key_id, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      modelId,
      providerId,
      model.name ?? '',
      model.modelId ?? '',
      model.port ?? 'openai',
      JSON.stringify(model.capabilities ?? []),
      model.apiKeyId ?? null,
      model.enabled ? 1 : 0
    );
  }
  logger?.info(`Model saved: ${modelId}`);
  return modelId;
}

export function deleteModel(modelId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM provider_models WHERE id = ?');
  const result = stmt.run(modelId);
  logger?.info(`Model deleted: ${modelId}`);
  return result.changes > 0;
}

// ==================== Note Versions ====================

export function saveNoteVersion(note: Note, logger?: PapyrusLogger): string {
  const database = getDb();
  const versionStmt = database.prepare(
    'SELECT COALESCE(MAX(version), 0) as max_version FROM note_versions WHERE note_id = ?'
  );
  const versionRow = versionStmt.get(note.id) as { max_version: number } | undefined;
  const version = (versionRow?.max_version ?? 0) + 1;
  const versionId = `${note.id}_v${version}`;
  const now = Date.now() / 1000;

  const stmt = database.prepare(
    `INSERT INTO note_versions (id, note_id, version, title, folder, content, preview, tags, word_count, hash, headings, outgoing_links, incoming_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    versionId, note.id, version, note.title, note.folder, note.content, note.preview,
    tagsToJson(note.tags), note.word_count, note.hash, JSON.stringify(note.headings),
    JSON.stringify(note.outgoing_links), note.incoming_count, now
  );
  logger?.info(`保存笔记版本: ${note.id} v${version}`);
  return versionId;
}

export function getNoteVersions(noteId: string): Array<Note & { version: number; version_id: string; version_created_at: number }> {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT * FROM note_versions WHERE note_id = ? ORDER BY version DESC'
  );
  const rows = stmt.all(noteId) as Array<{
    id: string;
    note_id: string;
    version: number;
    title: string;
    folder: string;
    content: string;
    preview: string;
    tags: string;
    word_count: number;
    hash: string;
    headings: string;
    outgoing_links: string;
    incoming_count: number;
    created_at: number;
  }>;

  return rows.map(row => ({
    id: row.note_id,
    title: row.title,
    folder: row.folder,
    content: row.content,
    preview: row.preview,
    tags: tagsFromJson(row.tags),
    created_at: 0,
    updated_at: 0,
    word_count: row.word_count,
    hash: row.hash,
    headings: jsonFromStr(row.headings) as Array<{ level: number; text: string }>,
    outgoing_links: jsonFromStr(row.outgoing_links) as string[],
    incoming_count: row.incoming_count,
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  }));
}

export function getNoteVersionById(versionId: string): (Note & { version: number; version_id: string; version_created_at: number }) | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM note_versions WHERE id = ?');
  const row = stmt.get(versionId) as {
    id: string;
    note_id: string;
    version: number;
    title: string;
    folder: string;
    content: string;
    preview: string;
    tags: string;
    word_count: number;
    hash: string;
    headings: string;
    outgoing_links: string;
    incoming_count: number;
    created_at: number;
  } | undefined;

  if (!row) return null;
  return {
    id: row.note_id,
    title: row.title,
    folder: row.folder,
    content: row.content,
    preview: row.preview,
    tags: tagsFromJson(row.tags),
    created_at: 0,
    updated_at: 0,
    word_count: row.word_count,
    hash: row.hash,
    headings: jsonFromStr(row.headings) as Array<{ level: number; text: string }>,
    outgoing_links: jsonFromStr(row.outgoing_links) as string[],
    incoming_count: row.incoming_count,
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  };
}

export function getLatestNoteVersionHash(noteId: string): string | null {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT hash FROM note_versions WHERE note_id = ? ORDER BY version DESC LIMIT 1'
  );
  const row = stmt.get(noteId) as { hash: string } | undefined;
  return row?.hash ?? null;
}

// ==================== Card Versions ====================

export function saveCardVersion(card: CardRecord, contentHash: string, logger?: PapyrusLogger): string {
  const database = getDb();
  const versionStmt = database.prepare(
    'SELECT COALESCE(MAX(version), 0) as max_version FROM card_versions WHERE card_id = ?'
  );
  const versionRow = versionStmt.get(card.id) as { max_version: number } | undefined;
  const version = (versionRow?.max_version ?? 0) + 1;
  const versionId = `${card.id}_v${version}`;
  const now = Date.now() / 1000;

  const stmt = database.prepare(
    `INSERT INTO card_versions (id, card_id, version, q, a, tags, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(versionId, card.id, version, card.q, card.a, tagsToJson(card.tags), contentHash, now);
  logger?.info(`保存卡片版本: ${card.id} v${version}`);
  return versionId;
}

export function getCardVersions(cardId: string): Array<CardRecord & { version: number; version_id: string; version_created_at: number }> {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT * FROM card_versions WHERE card_id = ? ORDER BY version DESC'
  );
  const rows = stmt.all(cardId) as Array<{
    id: string;
    card_id: string;
    version: number;
    q: string;
    a: string;
    tags: string;
    content_hash: string;
    created_at: number;
  }>;

  return rows.map(row => ({
    id: row.card_id,
    q: row.q,
    a: row.a,
    next_review: 0,
    interval: 0,
    ef: 2.5,
    repetitions: 0,
    tags: tagsFromJson(row.tags),
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  }));
}

export function getCardVersionById(versionId: string): (CardRecord & { version: number; version_id: string; version_created_at: number }) | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM card_versions WHERE id = ?');
  const row = stmt.get(versionId) as {
    id: string;
    card_id: string;
    version: number;
    q: string;
    a: string;
    tags: string;
    content_hash: string;
    created_at: number;
  } | undefined;

  if (!row) return null;
  return {
    id: row.card_id,
    q: row.q,
    a: row.a,
    next_review: 0,
    interval: 0,
    ef: 2.5,
    repetitions: 0,
    tags: tagsFromJson(row.tags),
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  };
}

export function getLatestCardVersionHash(cardId: string): string | null {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT content_hash FROM card_versions WHERE card_id = ? ORDER BY version DESC LIMIT 1'
  );
  const row = stmt.get(cardId) as { content_hash: string } | undefined;
  return row?.content_hash ?? null;
}

// ==================== Files ====================

export function loadAllFiles(_logger?: PapyrusLogger): FileRecord[] {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM files ORDER BY is_folder DESC, name ASC');
  const rows = stmt.all() as Record<string, unknown>[];
  return rows.map(rowToFileRecord);
}

export function getFileById(fileId: string): FileRecord | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM files WHERE id = ?');
  const row = stmt.get(fileId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToFileRecord(row);
}

function rowToFileRecord(row: Record<string, unknown>): FileRecord {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    type: String(row.type ?? 'unknown'),
    size: Number(row.size ?? 0),
    mime_type: String(row.mime_type ?? ''),
    parent_id: row.parent_id != null && row.parent_id !== '' ? String(row.parent_id) : null,
    file_storage_path: row.file_storage_path != null ? String(row.file_storage_path) : null,
    is_folder: Number(row.is_folder ?? 0),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

export function getFilesByParentId(parentId: string | null): FileRecord[] {
  const database = getDb();
  if (parentId === null) {
    const stmt = database.prepare('SELECT * FROM files WHERE parent_id IS NULL ORDER BY is_folder DESC, name ASC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(rowToFileRecord);
  }
  const stmt = database.prepare('SELECT * FROM files WHERE parent_id = ? ORDER BY is_folder DESC, name ASC');
  const rows = stmt.all(parentId) as Record<string, unknown>[];
  return rows.map(rowToFileRecord);
}

export function insertFile(file: FileRecord, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT OR REPLACE INTO files (id, name, type, size, mime_type, parent_id, file_storage_path, is_folder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(file.id, file.name, file.type, file.size, file.mime_type, file.parent_id, file.file_storage_path, file.is_folder, file.created_at, file.updated_at);
  logger?.info(`插入文件: ${file.id}`);
}

export function deleteFileById(fileId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM files WHERE id = ?');
  const result = stmt.run(fileId);
  logger?.info(`删除文件: ${fileId}`);
  return result.changes > 0;
}

export function deleteFilesByIds(fileIds: string[], logger?: PapyrusLogger): number {
  if (fileIds.length === 0) return 0;
  const database = getDb();
  const placeholders = fileIds.map(() => '?').join(',');
  const stmt = database.prepare(`DELETE FROM files WHERE id IN (${placeholders})`);
  const result = stmt.run(...fileIds);
  logger?.info(`批量删除 ${result.changes} 个文件`);
  return Number(result.changes);
}

const ALLOWED_FILE_COLUMNS = new Set([
  'name', 'type', 'size', 'mime_type', 'parent_id', 'file_storage_path', 'is_folder', 'created_at', 'updated_at',
]);

export function updateFile(file: Partial<FileRecord> & { id: string }, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(file)) {
    if (key !== 'id' && value !== undefined) {
      if (!ALLOWED_FILE_COLUMNS.has(key)) {
        logger?.warning(`updateFile ignored disallowed column: ${key}`);
        continue;
      }
      sets.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }
  if (sets.length === 0) return false;
  values.push(file.id);
  const stmt = database.prepare(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return Number(result.changes) > 0;
}

// ==================== Migration ====================

const LEGACY_CARDS_MIGRATION = 'legacy-papyrusdata-json-v1';

// 把未知值收窄为有限数字，输入原始字段和默认值，输出可安全写入 SQLite 的 number。
// 原因：旧版 JSON 可能缺少 SM-2 字段或包含 null，迁移必须为升级用户补齐稳定默认值。
// 未直接使用 Number(value)：字符串等意外类型会被静默强制转换，可能掩盖损坏数据。
function legacyNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// 规范化一条旧版卡片，输入未知 JSON 对象和已占用 ID，输出完整 CardRecord 或 null。
// 原因：Python 旧版允许没有 id、ef、repetitions 和 tags，新数据库列则要求完整状态。
// 未依赖类型断言：Reflect.get 配合逐字段检查可在运行时安全处理不受信任的用户文件。
function normalizeLegacyCard(value: unknown, usedIds: Set<string>): CardRecord | null {
  if (typeof value !== 'object' || value === null) return null;

  const question = Reflect.get(value, 'q');
  const answer = Reflect.get(value, 'a');
  if (typeof question !== 'string' || typeof answer !== 'string') return null;

  const rawId = Reflect.get(value, 'id');
  let id = typeof rawId === 'string' && rawId.length > 0
    ? rawId
    : randomUUID().replaceAll('-', '');
  while (usedIds.has(id)) {
    id = randomUUID().replaceAll('-', '');
  }
  usedIds.add(id);

  const rawTags = Reflect.get(value, 'tags');
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === 'string')
    : [];

  return {
    id,
    q: question,
    a: answer,
    next_review: legacyNumber(Reflect.get(value, 'next_review'), 0),
    interval: legacyNumber(Reflect.get(value, 'interval'), 0),
    ef: legacyNumber(Reflect.get(value, 'ef'), 2.5),
    repetitions: Math.max(0, Math.floor(legacyNumber(Reflect.get(value, 'repetitions'), 0))),
    tags,
  };
}

// 规范化旧版卡片数组，输入解析后的 JSON 与已存在 ID，输出有效卡片及跳过数量。
// 原因：单条损坏记录不应阻止其余有效卡片迁移，同时日志需要明确提示数据质量问题。
// 未使用 zod 整体 parse：整体失败会让一个坏条目阻断所有可恢复数据。
function normalizeLegacyCards(
  parsed: unknown,
  existingIds: Iterable<string> = [],
): { cards: CardRecord[]; skipped: number } {
  if (!Array.isArray(parsed)) {
    throw new Error('Legacy cards file must contain a JSON array');
  }

  const usedIds = new Set(existingIds);
  const cards: CardRecord[] = [];
  let skipped = 0;
  for (const value of parsed) {
    const card = normalizeLegacyCard(value, usedIds);
    if (card === null) {
      skipped += 1;
    } else {
      cards.push(card);
    }
  }
  return { cards, skipped };
}

// 返回旧版 data/Papyrusdata.json 的候选绝对路径，输入来自环境与运行位置，输出去重数组。
// 原因：开发态旧数据位于仓库 data 目录，打包态则位于旧可执行文件旁，Electron 会优先显式传入。
// 未只依赖 process.cwd()：桌面快捷方式启动时工作目录不稳定，可能指向系统目录。
function getLegacyCardsFileCandidates(): string[] {
  const explicitPath = process.env.PAPYRUS_LEGACY_CARDS_FILE;
  const candidates = [
    explicitPath ? path.resolve(explicitPath) : null,
    path.resolve(process.cwd(), '..', 'data', 'Papyrusdata.json'),
    path.join(path.dirname(process.execPath), 'data', 'Papyrusdata.json'),
  ].filter((candidate): candidate is string => candidate !== null);
  return [...new Set(candidates)];
}

// 在数据库首次打开时合并一次旧版卡片，输入已初始化数据库，输出为空。
// 原因：仅定义手动迁移函数不会保护真实升级路径；事务和迁移标记确保崩溃重试且不重复导入。
// 未覆盖现有 cards 表：升级过程中用户可能已创建新卡，合并比全量替换更安全。
function migrateLegacyCardsOnStartup(database: DatabaseSync): void {
  const completed = database.prepare(
    'SELECT 1 FROM app_migrations WHERE name = ?',
  ).get(LEGACY_CARDS_MIGRATION);
  if (completed !== undefined) return;

  const cardsFile = getLegacyCardsFileCandidates().find(candidate => fs.existsSync(candidate));
  if (cardsFile === undefined) return;

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));
    // node:sqlite 返回的行对象由固定 SELECT id 投影保证结构，边界处收窄后仅用于构建 ID 集合。
    // 未把断言扩散到规范化函数：迁移的其余 JSON 内容仍通过逐字段运行时检查。
    const existingRows = database.prepare('SELECT id FROM cards').all() as Array<{ id: string }>;
    const { cards, skipped } = normalizeLegacyCards(parsed, existingRows.map(row => row.id));
    if (cards.length === 0 && Array.isArray(parsed) && parsed.length > 0) {
      throw new Error('Legacy cards file contains no valid cards');
    }

    database.exec('BEGIN TRANSACTION;');
    try {
      const insert = database.prepare(`
        INSERT INTO cards (id, q, a, next_review, interval, ef, repetitions, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const card of cards) {
        insert.run(
          card.id,
          card.q,
          card.a,
          card.next_review,
          card.interval,
          card.ef,
          card.repetitions,
          tagsToJson(card.tags),
        );
      }
      database.prepare(`
        INSERT INTO app_migrations (name, source_path, imported_count, completed_at)
        VALUES (?, ?, ?, ?)
      `).run(LEGACY_CARDS_MIGRATION, cardsFile, cards.length, Date.now() / 1000);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }

    console.info(`已从 ${cardsFile} 迁移 ${cards.length} 张旧版卡片`);
    if (skipped > 0) {
      console.warn(`旧版卡片迁移跳过 ${skipped} 条无效记录`);
    }
  } catch (error) {
    console.error(`启动时迁移旧版卡片失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 手动迁移指定卡片和笔记 JSON，输入两个可选文件及日志器，输出为空。
// 原因：测试、CLI 或恢复流程仍需要显式迁移入口，并与启动迁移共享旧卡片规范化逻辑。
// 未让手动入口写 app_migrations：调用者指定的任意文件不应关闭真实升级路径的一次性检测。
export function migrateFromJson(cardsFile?: string, notesFile?: string, logger?: PapyrusLogger): void {
  if (cardsFile && fs.existsSync(cardsFile)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));
      const { cards, skipped } = normalizeLegacyCards(parsed);
      if (cards.length > 0) {
        saveAllCards(cards, logger);
        logger?.info(`已迁移 ${cards.length} 张卡片从 JSON 到数据库`);
      }
      if (skipped > 0) {
        logger?.warning(`迁移卡片时跳过 ${skipped} 条无效记录`);
      }
    } catch (e) {
      logger?.error(`迁移卡片失败: ${e}`);
    }
  }

  if (notesFile && fs.existsSync(notesFile)) {
    try {
      const data = fs.readFileSync(notesFile, 'utf8');
      const notes = JSON.parse(data) as Note[];
      if (Array.isArray(notes) && notes.length > 0) {
        saveAllNotes(notes, logger);
        logger?.info(`已迁移 ${notes.length} 条笔记从 JSON 到数据库`);
      }
    } catch (e) {
      logger?.error(`迁移笔记失败: ${e}`);
    }
  }
}

// ==================== Relations ====================

export interface RelationRecord {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  description: string;
  created_at: number;
  updated_at: number;
  title?: string;
  folder?: string;
}

export function loadRelationsForNote(noteId: string): { outgoing: RelationRecord[]; incoming: RelationRecord[] } {
  const database = getDb();

  const outgoingStmt = database.prepare(`
    SELECT r.id, r.source_id, r.target_id, r.relation_type, r.description, r.created_at, r.updated_at,
           n.title as target_title, n.folder as target_folder
    FROM relations r
    JOIN notes n ON r.target_id = n.id
    WHERE r.source_id = ?
    ORDER BY r.created_at DESC
  `);
  const outgoingRows = outgoingStmt.all(noteId) as Array<{
    id: string; source_id: string; target_id: string; relation_type: string;
    description: string; created_at: number; updated_at: number;
    target_title: string; target_folder: string;
  }>;

  const incomingStmt = database.prepare(`
    SELECT r.id, r.source_id, r.target_id, r.relation_type, r.description, r.created_at, r.updated_at,
           n.title as source_title, n.folder as source_folder
    FROM relations r
    JOIN notes n ON r.source_id = n.id
    WHERE r.target_id = ?
    ORDER BY r.created_at DESC
  `);
  const incomingRows = incomingStmt.all(noteId) as Array<{
    id: string; source_id: string; target_id: string; relation_type: string;
    description: string; created_at: number; updated_at: number;
    source_title: string; source_folder: string;
  }>;

  return {
    outgoing: outgoingRows.map(r => ({
      id: r.id,
      source_id: r.source_id,
      target_id: r.target_id,
      relation_type: r.relation_type,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
      title: r.target_title,
      folder: r.target_folder,
    })),
    incoming: incomingRows.map(r => ({
      id: r.id,
      source_id: r.source_id,
      target_id: r.target_id,
      relation_type: r.relation_type,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
      title: r.source_title,
      folder: r.source_folder,
    })),
  };
}

export function insertRelation(relation: RelationRecord, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO relations (id, source_id, target_id, relation_type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(relation.id, relation.source_id, relation.target_id, relation.relation_type, relation.description, relation.created_at, relation.updated_at);
  logger?.info(`创建关联: ${relation.id}`);
}

export function updateRelation(relationId: string, updates: Partial<Pick<RelationRecord, 'relation_type' | 'description'>>, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (updates.relation_type !== undefined) {
    sets.push('relation_type = ?');
    values.push(updates.relation_type);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    values.push(updates.description);
  }
  if (sets.length === 0) return false;
  sets.push('updated_at = ?');
  values.push(Date.now() / 1000);
  values.push(relationId);
  const stmt = database.prepare(`UPDATE relations SET ${sets.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  logger?.info(`更新关联: ${relationId}`);
  return Number(result.changes) > 0;
}

export function deleteRelationById(relationId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM relations WHERE id = ?');
  const result = stmt.run(relationId);
  logger?.info(`删除关联: ${relationId}`);
  return result.changes > 0;
}

export function searchNotesForRelation(query: string, excludeNoteId: string, limit: number): Note[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM notes
    WHERE id != ? AND (title LIKE ? OR content LIKE ? OR preview LIKE ? OR tags LIKE ?)
    ORDER BY updated_at DESC
    LIMIT ?
  `);
  const likeQuery = `%${query}%`;
  const rows = stmt.all(excludeNoteId, likeQuery, likeQuery, likeQuery, likeQuery, limit) as Array<{
    id: string; title: string; folder: string; content: string; preview: string;
    tags: string; created_at: number; updated_at: number; word_count: number;
    hash: string; headings: string; outgoing_links: string; incoming_count: number;
  }>;
  return rows.map(noteFromRow);
}

export function getGraphData(noteId: string, depth: number): { nodes: Array<{ id: string; title: string; folder: string; is_center: boolean }>; links: Array<{ source: string; target: string; type: string }> } {
  const database = getDb();
  const nodeSet = new Map<string, { id: string; title: string; folder: string; is_center: boolean }>();
  const linkSet = new Set<string>();
  const links: Array<{ source: string; target: string; type: string }> = [];

  function addNode(id: string, title: string, folder: string, isCenter: boolean) {
    if (!nodeSet.has(id)) {
      nodeSet.set(id, { id, title, folder, is_center: isCenter });
    }
  }

  function addLink(source: string, target: string, type: string) {
    const key = `${source}-${target}-${type}`;
    if (!linkSet.has(key)) {
      linkSet.add(key);
      links.push({ source, target, type });
    }
  }

  const centerStmt = database.prepare('SELECT id, title, folder FROM notes WHERE id = ?');
  const centerRow = centerStmt.get(noteId) as { id: string; title: string; folder: string } | undefined;
  if (centerRow) {
    addNode(centerRow.id, centerRow.title, centerRow.folder, true);
  }

  let currentDepth = 0;
  let currentIds = [noteId];

  while (currentDepth < depth && currentIds.length > 0) {
    const nextIds: string[] = [];
    const placeholders = currentIds.map(() => '?').join(',');

    const outgoingStmt = database.prepare(`
      SELECT r.source_id, r.target_id, r.relation_type, n.title as target_title, n.folder as target_folder
      FROM relations r
      JOIN notes n ON r.target_id = n.id
      WHERE r.source_id IN (${placeholders})
    `);
    const outgoingRows = outgoingStmt.all(...currentIds) as Array<{ source_id: string; target_id: string; relation_type: string; target_title: string; target_folder: string }>;
    for (const row of outgoingRows) {
      addNode(row.target_id, row.target_title, row.target_folder, false);
      addLink(row.source_id, row.target_id, row.relation_type);
      if (currentDepth + 1 < depth) {
        nextIds.push(row.target_id);
      }
    }

    const incomingStmt = database.prepare(`
      SELECT r.source_id, r.target_id, r.relation_type, n.title as source_title, n.folder as source_folder
      FROM relations r
      JOIN notes n ON r.source_id = n.id
      WHERE r.target_id IN (${placeholders})
    `);
    const incomingRows = incomingStmt.all(...currentIds) as Array<{ source_id: string; target_id: string; relation_type: string; source_title: string; source_folder: string }>;
    for (const row of incomingRows) {
      addNode(row.source_id, row.source_title, row.source_folder, false);
      addLink(row.source_id, row.target_id, row.relation_type);
      if (currentDepth + 1 < depth) {
        nextIds.push(row.source_id);
      }
    }

    currentIds = [...new Set(nextIds)];
    currentDepth++;
  }

  return {
    nodes: Array.from(nodeSet.values()),
    links,
  };
}

export function checkpointDb(): void {
  const database = getDb();
  database.exec('PRAGMA wal_checkpoint(FULL);');
}

export function runInTransaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec('BEGIN TRANSACTION;');
  try {
    const result = fn();
    database.exec('COMMIT;');
    return result;
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function clearAllData(): void {
  runInTransaction(() => {
    const database = getDb();
    database.exec('DELETE FROM cards;');
    database.exec('DELETE FROM card_versions;');
    database.exec('DELETE FROM notes;');
    database.exec('DELETE FROM note_versions;');
    database.exec('DELETE FROM relations;');
    database.exec('DELETE FROM files;');
    database.exec('DELETE FROM chat_messages;');
    database.exec('DELETE FROM chat_sessions;');
    database.exec('DELETE FROM provider_models;');
    database.exec('DELETE FROM api_keys;');
    database.exec('DELETE FROM providers;');
  });
  const database = getDb();
  seedDefaults(database);
}

// ==================== Knowledge Version Control ====================

export interface KnowledgeBranchRow {
  id: string;
  name: string;
  head_version_id: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface KnowledgeVersionRow {
  id: string;
  branch_id: string;
  name: string;
  description: string;
  kind: 'manual' | 'safety';
  manifest_path: string;
  stats_json: string;
  size_bytes: number;
  created_at: number;
}

export interface KnowledgeDataStats {
  cards: number;
  notes: number;
  relations: number;
  files: number;
  progressDays: number;
}

// 返回全部知识库分支，输入为空，输出按活动状态与更新时间排序的元数据。
// 原因：版本服务需要在一次读取中确定当前分支并渲染选择器。
// 未在路由层直接查询：集中数据库边界可避免 API 与 SQLite 列名耦合。
export function listKnowledgeBranchRows(): KnowledgeBranchRow[] {
  const database = getDb();
  return database.prepare(
    'SELECT * FROM knowledge_branches ORDER BY is_active DESC, updated_at DESC, name COLLATE NOCASE'
  ).all() as unknown as KnowledgeBranchRow[];
}

// 按 ID 读取单个分支，输入稳定 UUID 或 main，输出元数据或 null。
// 原因：所有写操作都要先验证分支存在与保护状态。
// 未从全量列表中过滤：点查可利用主键索引，避免无关对象分配。
export function getKnowledgeBranchRow(branchId: string): KnowledgeBranchRow | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM knowledge_branches WHERE id = ?').get(branchId);
  return row ? row as unknown as KnowledgeBranchRow : null;
}

// 按大小写不敏感名称读取分支，输入用户名称，输出冲突分支或 null。
// 原因：SQLite 唯一约束负责最终一致性，服务层仍需给出友好的 409。
// 未仅捕获 UNIQUE 异常：预检查能区分名称冲突与其他数据库失败。
export function getKnowledgeBranchRowByName(name: string): KnowledgeBranchRow | null {
  const database = getDb();
  const row = database.prepare(
    'SELECT * FROM knowledge_branches WHERE name = ? COLLATE NOCASE'
  ).get(name);
  return row ? row as unknown as KnowledgeBranchRow : null;
}

// 新增知识库分支，输入完整数据库行，无返回值。
// 原因：ID、时间与校验由版本服务统一生成，数据库层只负责持久化。
// 未使用 INSERT OR REPLACE：替换可能级联删除已有版本，属于不可接受的数据破坏。
export function insertKnowledgeBranchRow(branch: KnowledgeBranchRow): void {
  const database = getDb();
  database.prepare(
    `INSERT INTO knowledge_branches
      (id, name, head_version_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    branch.id,
    branch.name,
    branch.head_version_id,
    branch.is_active,
    branch.created_at,
    branch.updated_at,
  );
}

// 更新分支名称，输入分支 ID、新名称和时间，返回是否命中。
// 原因：名称变更不能触碰活动状态或版本指针。
// 未接受任意 Partial：固定列集合可防止动态 SQL 注入与误改保护字段。
export function renameKnowledgeBranchRow(branchId: string, name: string, updatedAt: number): boolean {
  const database = getDb();
  const result = database.prepare(
    'UPDATE knowledge_branches SET name = ?, updated_at = ? WHERE id = ?'
  ).run(name, updatedAt, branchId);
  return Number(result.changes) > 0;
}

// 更新分支头版本，输入分支 ID、版本 ID 和时间，返回是否命中。
// 原因：创建、恢复和安全快照完成后都需要原子推进分支头。
// 未把版本创建与此函数强耦合：分支克隆会先复制快照再设置指针。
export function setKnowledgeBranchHeadRow(
  branchId: string,
  versionId: string | null,
  updatedAt: number,
): boolean {
  const database = getDb();
  const result = database.prepare(
    'UPDATE knowledge_branches SET head_version_id = ?, updated_at = ? WHERE id = ?'
  ).run(versionId, updatedAt, branchId);
  return Number(result.changes) > 0;
}

// 切换唯一活动分支，输入目标分支 ID 和时间，返回是否命中目标。
// 原因：清零与激活必须在同一事务中，避免出现两个活动分支。
// 未依赖唯一部分索引：SQLite 版本兼容性与现有初始化方式更适合显式事务。
export function activateKnowledgeBranchRow(branchId: string, updatedAt: number): boolean {
  return runInTransaction(() => {
    const database = getDb();
    database.prepare('UPDATE knowledge_branches SET is_active = 0 WHERE is_active = 1').run();
    const result = database.prepare(
      'UPDATE knowledge_branches SET is_active = 1, updated_at = ? WHERE id = ?'
    ).run(updatedAt, branchId);
    if (Number(result.changes) === 0) {
      throw new Error('Knowledge branch not found during activation');
    }
    return true;
  });
}

// 删除分支行，输入 ID，返回删除数量是否大于零。
// 原因：外键级联只移除该分支的版本元数据，文件快照由服务层安全回收。
// 未手工逐版本删除：数据库级联可保证元数据不会残留半删除状态。
export function deleteKnowledgeBranchRow(branchId: string): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM knowledge_branches WHERE id = ?').run(branchId);
  return Number(result.changes) > 0;
}

// 返回指定分支的版本，输入分支 ID，输出按创建时间倒序的稳定列表。
// 原因：设置页只展示当前分支历史，避免一次加载所有快照。
// 未分页：本地桌面 v1 的手动版本量有限，后续可保持响应形状扩展游标。
export function listKnowledgeVersionRows(branchId: string): KnowledgeVersionRow[] {
  const database = getDb();
  return database.prepare(
    'SELECT * FROM knowledge_versions WHERE branch_id = ? ORDER BY created_at DESC, id DESC'
  ).all(branchId) as unknown as KnowledgeVersionRow[];
}

// 返回全部版本元数据，输入为空，用于 blob 引用扫描和安全清理。
// 原因：垃圾回收必须观察所有分支，不能只看当前列表。
// 未暴露给 API：这是存储维护接口，不属于用户可见契约。
export function listAllKnowledgeVersionRows(): KnowledgeVersionRow[] {
  const database = getDb();
  return database.prepare('SELECT * FROM knowledge_versions').all() as unknown as KnowledgeVersionRow[];
}

// 按 ID 读取版本，输入版本 ID，输出元数据或 null。
// 原因：恢复、旁开分支、重命名和删除共用相同存在性检查。
// 未从分支列表过滤：版本 ID 是全局唯一主键。
export function getKnowledgeVersionRow(versionId: string): KnowledgeVersionRow | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM knowledge_versions WHERE id = ?').get(versionId);
  return row ? row as unknown as KnowledgeVersionRow : null;
}

// 新增版本元数据，输入完整数据库行，无返回值。
// 原因：快照文件成功落盘后才写入元数据，避免列表出现不可恢复条目。
// 未使用 UPSERT：版本不可被同 ID 覆盖，重复 ID 应直接失败。
export function insertKnowledgeVersionRow(version: KnowledgeVersionRow): void {
  const database = getDb();
  database.prepare(
    `INSERT INTO knowledge_versions
      (id, branch_id, name, description, kind, manifest_path, stats_json, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    version.id,
    version.branch_id,
    version.name,
    version.description,
    version.kind,
    version.manifest_path,
    version.stats_json,
    version.size_bytes,
    version.created_at,
  );
}

// 更新版本显示信息，输入 ID、名称和描述，返回是否命中。
// 原因：快照内容保持不可变，重命名只修改可见元数据。
// 未允许修改 kind 或 manifest：这些字段变化会破坏审计与恢复一致性。
export function renameKnowledgeVersionRow(
  versionId: string,
  name: string,
  description: string,
): boolean {
  const database = getDb();
  const result = database.prepare(
    'UPDATE knowledge_versions SET name = ?, description = ? WHERE id = ?'
  ).run(name, description, versionId);
  return Number(result.changes) > 0;
}

// 删除版本元数据，输入 ID，返回是否命中。
// 原因：受保护检查与快照目录清理由服务层完成，数据库层保持最小职责。
// 未级联修改分支头：当前头版本在服务层被明确禁止删除。
export function deleteKnowledgeVersionRow(versionId: string): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM knowledge_versions WHERE id = ?').run(versionId);
  return Number(result.changes) > 0;
}

// 统计当前知识库内容，输入为空，输出版本列表需要的五类计数。
// 原因：统计与快照来自同一 SQLite 连接，避免从多个核心模块拼接出不一致视图。
// 未统计 AI/聊天/设置：这些数据明确不属于知识库版本范围。
export function getKnowledgeDataStats(): KnowledgeDataStats {
  const database = getDb();
  const count = (table: string): number => {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    return Number(row.count);
  };
  return {
    cards: count('cards'),
    notes: count('notes'),
    relations: count('relations'),
    files: count('files'),
    progressDays: count('daily_progress'),
  };
}

const KNOWLEDGE_SNAPSHOT_TABLES = new Set([
  'cards',
  'card_versions',
  'notes',
  'note_versions',
  'relations',
  'files',
  'daily_progress',
]);

interface SqliteTableColumn {
  name: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

// 将受信任的 SQLite 标识符转成带引号 SQL，输入表名或列名，输出双引号包裹的标识符。
// 原因：跨 schema 恢复需要动态拼接 PRAGMA 返回的列名，必须先限制字符集并正确引用。
// 未用参数占位符：SQLite 参数只能绑定值，不能绑定表名或列名。
function quoteSqlIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

// 从快照恢复单个知识表，输入数据库连接和固定表名，无返回值。
// 原因：按当前表与旧快照的同名列交集复制，可让新增且有默认值的列在升级后安全采用当前默认值。
// 未使用 SELECT *：表结构演进会改变列数或顺序，使历史快照在升级后不可恢复。
function restoreKnowledgeTableFromSnapshot(
  database: DatabaseSync,
  tableName: string,
): void {
  if (!KNOWLEDGE_SNAPSHOT_TABLES.has(tableName)) {
    throw new Error(`Unsupported knowledge snapshot table: ${tableName}`);
  }
  const quotedTable = quoteSqlIdentifier(tableName);
  const currentColumns = database.prepare(
    `PRAGMA main.table_info(${quotedTable})`
  ).all() as unknown as SqliteTableColumn[];
  const snapshotColumns = database.prepare(
    `PRAGMA knowledge_snapshot.table_info(${quotedTable})`
  ).all() as unknown as SqliteTableColumn[];
  if (currentColumns.length === 0 || snapshotColumns.length === 0) {
    throw new Error(`Knowledge snapshot table is missing: ${tableName}`);
  }

  const snapshotColumnNames = new Set(snapshotColumns.map((column) => column.name));
  const missingRequiredColumns = currentColumns.filter((column) =>
    !snapshotColumnNames.has(column.name)
    && (column.notnull === 1 || column.pk > 0)
    && column.dflt_value === null
  );
  if (missingRequiredColumns.length > 0) {
    throw new Error(
      `Knowledge snapshot is incompatible with required columns in ${tableName}: `
      + missingRequiredColumns.map((column) => column.name).join(', '),
    );
  }

  const sharedColumns = currentColumns
    .map((column) => column.name)
    .filter((columnName) => snapshotColumnNames.has(columnName));
  if (sharedColumns.length === 0) {
    throw new Error(`Knowledge snapshot has no compatible columns for table: ${tableName}`);
  }
  const columnSql = sharedColumns.map(quoteSqlIdentifier).join(', ');
  database.exec(`DELETE FROM ${quotedTable};`);
  database.exec(
    `INSERT INTO ${quotedTable} (${columnSql}) `
    + `SELECT ${columnSql} FROM knowledge_snapshot.${quotedTable};`,
  );
}

// 创建只包含知识库表的 SQLite 快照，输入绝对目标路径，无返回值。
// 原因：先用 VACUUM INTO 获得一致视图，再移除非知识表并二次 VACUUM，可避免复制 API Key 等敏感数据。
// 未直接复制主库文件：WAL 模式下文件复制可能缺少未检查点事务并产生损坏快照。
export function createKnowledgeDbSnapshot(snapshotPath: string): void {
  createDbSnapshot(snapshotPath);
  const snapshot = new DatabaseSync(snapshotPath);
  try {
    snapshot.exec('PRAGMA foreign_keys = OFF;');
    const tables = snapshot.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).all() as Array<{ name: string }>;
    for (const { name } of tables) {
      if (!KNOWLEDGE_SNAPSHOT_TABLES.has(name)) {
        if (!/^[A-Za-z0-9_]+$/.test(name)) {
          throw new Error(`Unsafe SQLite table name in snapshot: ${name}`);
        }
        snapshot.exec(`DROP TABLE "${name}";`);
      }
    }

    const fileRows = snapshot.prepare(
      'SELECT id, file_storage_path FROM files WHERE is_folder = 0 AND file_storage_path IS NOT NULL'
    ).all() as Array<{ id: string; file_storage_path: string }>;
    const updatePath = snapshot.prepare('UPDATE files SET file_storage_path = ? WHERE id = ?');
    for (const file of fileRows) {
      updatePath.run(path.basename(file.file_storage_path), file.id);
    }
    snapshot.exec('VACUUM;');
  } finally {
    snapshot.close();
  }
  protectPrivateFile(snapshotPath);
}

// 用知识库快照替换当前知识表，输入已验证快照路径与文件库目录，无返回值。
// 原因：显式列复制与单事务可保留非知识表，并确保关系、版本历史和学习进度同步切换。
// 未恢复整个数据库：整库覆盖会错误替换 AI 配置、聊天、扩展和界面设置。
export function restoreKnowledgeDbSnapshot(snapshotPath: string, vaultDir: string): void {
  const database = getDb();
  database.prepare('ATTACH DATABASE ? AS knowledge_snapshot').run(snapshotPath);
  try {
    database.exec('BEGIN IMMEDIATE TRANSACTION;');
    database.exec('DELETE FROM relations;');
    database.exec('DELETE FROM note_versions;');
    database.exec('DELETE FROM card_versions;');
    database.exec('DELETE FROM files;');
    database.exec('DELETE FROM daily_progress;');
    database.exec('DELETE FROM notes;');
    database.exec('DELETE FROM cards;');

    restoreKnowledgeTableFromSnapshot(database, 'cards');
    restoreKnowledgeTableFromSnapshot(database, 'notes');
    restoreKnowledgeTableFromSnapshot(database, 'card_versions');
    restoreKnowledgeTableFromSnapshot(database, 'note_versions');
    restoreKnowledgeTableFromSnapshot(database, 'relations');
    restoreKnowledgeTableFromSnapshot(database, 'files');
    restoreKnowledgeTableFromSnapshot(database, 'daily_progress');

    const fileRows = database.prepare(
      'SELECT id, file_storage_path FROM files WHERE is_folder = 0 AND file_storage_path IS NOT NULL'
    ).all() as Array<{ id: string; file_storage_path: string }>;
    const updatePath = database.prepare('UPDATE files SET file_storage_path = ? WHERE id = ?');
    for (const file of fileRows) {
      updatePath.run(path.join(vaultDir, path.basename(file.file_storage_path)), file.id);
    }
    database.exec('COMMIT;');
  } catch (error) {
    try {
      database.exec('ROLLBACK;');
    } catch {
      // 如果 BEGIN 尚未成功，SQLite 会拒绝 ROLLBACK；保留原始错误。
    }
    throw error;
  } finally {
    database.exec('DETACH DATABASE knowledge_snapshot;');
  }
}

// ==================== UI Settings ====================

export type ChatPanelSide = 'left' | 'right';
export type UiLanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';
export type UiFontSize = 'small' | 'medium' | 'large';
export type UiDateFormat = 'yyyy-MM-dd' | 'yyyy/MM/dd' | 'dd/MM/yyyy' | 'MM/dd/yyyy';

export interface SidebarSettings {
  chatPanelSide: ChatPanelSide;
}

export interface UiSettings extends SidebarSettings {
  language: UiLanguage;
  fontSize: UiFontSize;
  dateFormat: UiDateFormat;
}

const CHAT_PANEL_SIDE_KEY = 'chat_panel_side';
const LANGUAGE_KEY = 'language';
const FONT_SIZE_KEY = 'font_size';
const DEFAULT_CHAT_PANEL_SIDE: ChatPanelSide = 'right';
const DEFAULT_UI_LANGUAGE: UiLanguage = 'zh-CN';
const DEFAULT_UI_FONT_SIZE: UiFontSize = 'medium';
const DATE_FORMAT_KEY = 'date_format';
const DEFAULT_DATE_FORMAT: UiDateFormat = 'yyyy-MM-dd';

function isChatPanelSide(value: string): value is ChatPanelSide {
  return value === 'left' || value === 'right';
}

function isUiLanguage(value: string): value is UiLanguage {
  return value === 'zh-CN' || value === 'zh-TW' || value === 'en-US' || value === 'ja-JP';
}

function isUiFontSize(value: string): value is UiFontSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function isUiDateFormat(value: unknown): value is UiDateFormat {
  return value === 'yyyy-MM-dd' || value === 'yyyy/MM/dd' || value === 'dd/MM/yyyy' || value === 'MM/dd/yyyy';
}

export function readUiSetting(key: string): string | undefined {
  const database = getDb();
  const row = database.prepare('SELECT value FROM ui_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function writeUiSetting(key: string, value: string): void {
  const database = getDb();
  database.prepare(
    'INSERT OR REPLACE INTO ui_settings (key, value, updated_at) VALUES (?, ?, ?)'
  ).run(key, value, Date.now() / 1000);
}

/**
 * 读取侧边栏 UI 设置，当前只包含聊天栏打开方向。
 * 原因：LA-16 要求该偏好跨刷新持久化，SQLite 已是应用主数据源。
 * 未使用 localStorage：浏览器存储无法满足“后端通过 DB 持久化”的要求。
 */
export function getSidebarSettings(): SidebarSettings {
  const chatPanelSide = readUiSetting(CHAT_PANEL_SIDE_KEY);
  return {
    chatPanelSide: chatPanelSide && isChatPanelSide(chatPanelSide) ? chatPanelSide : DEFAULT_CHAT_PANEL_SIDE,
  };
}

/**
 * 读取完整 UI 偏好设置，包含语言、字号和侧边栏方向。
 * 原因：语言与字号会影响根级 Provider 和全局 CSS，必须与其他 UI 偏好一样进入 SQLite 持久化链路。
 * 未强制迁移旧 localStorage：后端只负责稳定默认值，前端保留旧键作为首次启动兜底。
 */
export function getUiSettings(): UiSettings {
  const language = readUiSetting(LANGUAGE_KEY);
  const fontSize = readUiSetting(FONT_SIZE_KEY);
  const dateFormat = readUiSetting(DATE_FORMAT_KEY);
  return {
    ...getSidebarSettings(),
    language: language && isUiLanguage(language) ? language : DEFAULT_UI_LANGUAGE,
    fontSize: fontSize && isUiFontSize(fontSize) ? fontSize : DEFAULT_UI_FONT_SIZE,
    dateFormat: dateFormat && isUiDateFormat(dateFormat) ? dateFormat : DEFAULT_DATE_FORMAT,
  };
}

/**
 * 保存侧边栏 UI 设置，并限制聊天栏方向为受支持的枚举值。
 * 原因：将校验放在 DB 写入边界，避免非法 UI 偏好污染持久化数据。
 * 未使用宽松字符串：调用方错误应立即暴露为 400，而不是静默回退。
 */
export function saveSidebarSettings(settings: SidebarSettings): SidebarSettings {
  if (!isChatPanelSide(settings.chatPanelSide)) {
    throw new Error('Invalid chat panel side');
  }
  writeUiSetting(CHAT_PANEL_SIDE_KEY, settings.chatPanelSide);
  return getSidebarSettings();
}

/**
 * 保存完整 UI 偏好设置，允许部分更新并对每个字段做枚举校验。
 * 原因：设置页会分别更新语言和字号，部分更新避免前端为了保存一个字段而覆盖其他偏好。
 * 未接收任意 key/value：公开接口必须保持有限字段，防止写入无约束 UI 配置。
 */
export function saveUiSettings(settings: Partial<UiSettings>): UiSettings {
  if (settings.chatPanelSide !== undefined) {
    if (!isChatPanelSide(settings.chatPanelSide)) {
      throw new Error('Invalid chat panel side');
    }
    writeUiSetting(CHAT_PANEL_SIDE_KEY, settings.chatPanelSide);
  }
  if (settings.language !== undefined) {
    if (!isUiLanguage(settings.language)) {
      throw new Error('Invalid language');
    }
    writeUiSetting(LANGUAGE_KEY, settings.language);
  }
  if (settings.fontSize !== undefined) {
    if (!isUiFontSize(settings.fontSize)) {
      throw new Error('Invalid font size');
    }
    writeUiSetting(FONT_SIZE_KEY, settings.fontSize);
  }
  if (settings.dateFormat !== undefined) {
    if (!isUiDateFormat(settings.dateFormat)) {
      throw new Error('Invalid date format');
    }
    writeUiSetting(DATE_FORMAT_KEY, settings.dateFormat);
  }
  return getUiSettings();
}

// ==================== Chat Sessions ====================

export interface ChatSessionRow {
  id: string;
  title: string;
  model: string;
  provider: string;
  is_active: number;
  message_count: number;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  blocks: string;
  attachments: string;
  model: string;
  provider: string;
  token_usage: string;
  parent_message_id: string | null;
  is_deleted: number;
  created_at: number;
}

interface CreateChatSessionInput {
  id?: string;
  title?: string;
  model?: string;
  provider?: string;
  metadata?: string;
  created_at?: number;
  updated_at?: number;
}

export function createChatSession(input: CreateChatSessionInput = {}, logger?: PapyrusLogger): ChatSessionRow {
  const database = getDb();
  const now = Date.now() / 1000;
  const row: ChatSessionRow = {
    id: input.id ?? randomUUID(),
    title: input.title ?? '新对话',
    model: input.model ?? '',
    provider: input.provider ?? '',
    is_active: 0,
    message_count: 0,
    metadata: input.metadata ?? '{}',
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
  const stmt = database.prepare(
    'INSERT INTO chat_sessions (id, title, model, provider, is_active, message_count, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(row.id, row.title, row.model, row.provider, row.is_active, row.message_count, row.metadata, row.created_at, row.updated_at);
  logger?.info(`创建会话: ${row.id}`);
  return row;
}

export function listChatSessions(): ChatSessionRow[] {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC');
  return stmt.all() as unknown as ChatSessionRow[];
}

export function getChatSession(id: string): ChatSessionRow | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM chat_sessions WHERE id = ?');
  const row = stmt.get(id) as ChatSessionRow | undefined;
  return row ?? null;
}

interface ChatSessionPatch {
  title?: string;
  model?: string;
  provider?: string;
  metadata?: string;
}

export function updateChatSession(id: string, patch: ChatSessionPatch): boolean {
  const database = getDb();
  const fields: string[] = [];
  const values: Array<string | number> = [];
  if (patch.title !== undefined) { fields.push('title = ?'); values.push(patch.title); }
  if (patch.model !== undefined) { fields.push('model = ?'); values.push(patch.model); }
  if (patch.provider !== undefined) { fields.push('provider = ?'); values.push(patch.provider); }
  if (patch.metadata !== undefined) { fields.push('metadata = ?'); values.push(patch.metadata); }
  if (fields.length === 0) return false;
  fields.push('updated_at = ?');
  values.push(Date.now() / 1000);
  values.push(id);
  const stmt = database.prepare(`UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

/**
 * 在会话元数据仍与调用方快照一致时原子更新标题与元数据。
 * 原因：标题生成期间用户可能手动改名，比较原始 metadata 可阻止迟到的 AI 结果覆盖用户选择。
 * 未使用“先读后写”两条普通语句：并发请求会在读取和更新之间产生竞态。
 */
export function compareAndSwapChatSessionTitle(
  id: string,
  expectedMetadata: string,
  nextTitle: string,
  nextMetadata: string,
): boolean {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE chat_sessions SET title = ?, metadata = ?, updated_at = ? WHERE id = ? AND metadata = ?'
  );
  const result = stmt.run(nextTitle, nextMetadata, Date.now() / 1000, id, expectedMetadata);
  return result.changes > 0;
}

/**
 * 在会话元数据仍与调用方快照一致时原子替换元数据。
 * 原因：生成任务需要先声明所有权，并在失败时只撤销自己的声明。
 * 未改动标题字段：任务声明属于内部状态，不应制造可见标题变化。
 */
export function compareAndSwapChatSessionMetadata(
  id: string,
  expectedMetadata: string,
  nextMetadata: string,
): boolean {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE chat_sessions SET metadata = ? WHERE id = ? AND metadata = ?'
  );
  const result = stmt.run(nextMetadata, id, expectedMetadata);
  return result.changes > 0;
}

export function setActiveChatSession(id: string): boolean {
  const database = getDb();
  const exists = database.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(id);
  if (!exists) return false;
  database.exec('BEGIN TRANSACTION;');
  try {
    database.prepare('UPDATE chat_sessions SET is_active = 0 WHERE is_active = 1').run();
    // 只切换活动标记，不修改会话内容更新时间。
    // 原因：历史列表按 updated_at 排序，点击会话不应被误判成内容更新并把该项置顶。
    // 未改用 created_at 排序：新消息和重命名仍应让真实更新过的会话出现在前面。
    database.prepare('UPDATE chat_sessions SET is_active = 1 WHERE id = ?').run(id);
    database.exec('COMMIT;');
    return true;
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function getActiveChatSession(): ChatSessionRow | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM chat_sessions WHERE is_active = 1 LIMIT 1');
  const row = stmt.get() as ChatSessionRow | undefined;
  return row ?? null;
}

export function deleteChatSession(id: string, logger?: PapyrusLogger): { deleted: boolean; newActiveId: string | null } {
  const database = getDb();
  const target = getChatSession(id);
  if (!target) return { deleted: false, newActiveId: getActiveChatSession()?.id ?? null };
  const wasActive = target.is_active === 1;
  database.exec('BEGIN TRANSACTION;');
  try {
    database.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
    let newActiveId: string | null = null;
    if (wasActive) {
      const next = database.prepare('SELECT id FROM chat_sessions ORDER BY updated_at DESC LIMIT 1').get() as { id: string } | undefined;
      if (next) {
        // 删除活动会话后只接替活动状态，保持剩余列表的既有更新时间顺序。
        // 原因：自动接替不是用户内容变更，不应让接替项获得新的 updated_at。
        // 未调用 setActiveChatSession：当前事务已清除被删行，单条更新更直接且避免嵌套事务。
        database.prepare('UPDATE chat_sessions SET is_active = 1 WHERE id = ?').run(next.id);
        newActiveId = next.id;
      }
    } else {
      newActiveId = getActiveChatSession()?.id ?? null;
    }
    database.exec('COMMIT;');
    logger?.info(`删除会话: ${id}`);
    return { deleted: true, newActiveId };
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function clearAllChatSessions(logger?: PapyrusLogger): number {
  const database = getDb();
  const before = database.prepare('SELECT COUNT(*) as c FROM chat_sessions').get() as { c: number };
  database.exec('BEGIN TRANSACTION;');
  try {
    database.exec('DELETE FROM chat_messages;');
    database.exec('DELETE FROM chat_sessions;');
    database.exec('COMMIT;');
    logger?.info(`清空 ${before.c} 个会话`);
    return before.c;
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function touchChatSession(id: string, ts?: number): void {
  const database = getDb();
  database.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(ts ?? Date.now() / 1000, id);
}

// ==================== Chat Messages ====================

interface AppendChatMessageInput {
  id?: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  blocks?: string;
  attachments?: string;
  model?: string;
  provider?: string;
  token_usage?: string;
  parent_message_id?: string | null;
  created_at?: number;
}

export function appendChatMessage(input: AppendChatMessageInput, logger?: PapyrusLogger): ChatMessageRow {
  const database = getDb();
  const now = input.created_at ?? Date.now() / 1000;
  const row: ChatMessageRow = {
    id: input.id ?? randomUUID(),
    session_id: input.session_id,
    role: input.role,
    content: input.content ?? '',
    blocks: input.blocks ?? '[]',
    attachments: input.attachments ?? '[]',
    model: input.model ?? '',
    provider: input.provider ?? '',
    token_usage: input.token_usage ?? '{}',
    parent_message_id: input.parent_message_id ?? null,
    is_deleted: 0,
    created_at: now,
  };
  database.exec('BEGIN TRANSACTION;');
  try {
    const sessionExists = database.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(row.session_id);
    if (!sessionExists) {
      throw new Error(`会话不存在: ${row.session_id}`);
    }
    database.prepare(
      'INSERT INTO chat_messages (id, session_id, role, content, blocks, attachments, model, provider, token_usage, parent_message_id, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(row.id, row.session_id, row.role, row.content, row.blocks, row.attachments, row.model, row.provider, row.token_usage, row.parent_message_id, row.is_deleted, row.created_at);
    database.prepare(
      'UPDATE chat_sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?'
    ).run(now, row.session_id);
    database.exec('COMMIT;');
    logger?.info(`插入消息: ${row.id} (session=${row.session_id}, role=${row.role})`);
    return row;
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function listChatMessages(sessionId: string, opts?: { includeDeleted?: boolean }): ChatMessageRow[] {
  const database = getDb();
  const includeDeleted = opts?.includeDeleted === true;
  const sql = includeDeleted
    ? 'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC'
    : 'SELECT * FROM chat_messages WHERE session_id = ? AND is_deleted = 0 ORDER BY created_at ASC';
  const stmt = database.prepare(sql);
  return stmt.all(sessionId) as unknown as ChatMessageRow[];
}

export function getChatMessage(id: string): ChatMessageRow | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM chat_messages WHERE id = ?');
  const row = stmt.get(id) as ChatMessageRow | undefined;
  return row ?? null;
}

interface ChatMessagePatch {
  content?: string;
  blocks?: string;
  token_usage?: string;
  model?: string;
}

export function updateChatMessage(id: string, patch: ChatMessagePatch): boolean {
  const database = getDb();
  const fields: string[] = [];
  const values: Array<string | number> = [];
  if (patch.content !== undefined) { fields.push('content = ?'); values.push(patch.content); }
  if (patch.blocks !== undefined) { fields.push('blocks = ?'); values.push(patch.blocks); }
  if (patch.token_usage !== undefined) { fields.push('token_usage = ?'); values.push(patch.token_usage); }
  if (patch.model !== undefined) { fields.push('model = ?'); values.push(patch.model); }
  if (fields.length === 0) return false;
  values.push(id);
  const stmt = database.prepare(`UPDATE chat_messages SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function softDeleteChatMessage(id: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('UPDATE chat_messages SET is_deleted = 1 WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes > 0) logger?.info(`软删除消息: ${id}`);
  return result.changes > 0;
}

export function deleteMessagesAfter(sessionId: string, fromCreatedAt: number, logger?: PapyrusLogger): number {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM chat_messages WHERE session_id = ? AND created_at >= ?');
  const result = stmt.run(sessionId, fromCreatedAt);
  const changed = Number(result.changes);
  if (changed > 0) {
    database.prepare(
      'UPDATE chat_sessions SET message_count = (SELECT COUNT(*) FROM chat_messages WHERE session_id = ? AND is_deleted = 0), updated_at = ? WHERE id = ?'
    ).run(sessionId, Date.now() / 1000, sessionId);
    logger?.info(`删除会话 ${sessionId} 中 ${changed} 条消息`);
  }
  return changed;
}

export function getChatMessageCount(sessionId: string, opts?: { includeDeleted?: boolean }): number {
  const database = getDb();
  const sql = opts?.includeDeleted
    ? 'SELECT COUNT(*) as c FROM chat_messages WHERE session_id = ?'
    : 'SELECT COUNT(*) as c FROM chat_messages WHERE session_id = ? AND is_deleted = 0';
  const stmt = database.prepare(sql);
  const row = stmt.get(sessionId) as { c: number };
  return row.c;
}

// ==================== Extensions ====================

export interface ExtensionRecord {
  id: string;
  name: string;
  description: string;
  version: string;
  type: string;
  author: string;
  rating: number;
  downloads: number;
  is_enabled: boolean;
  is_builtin: boolean;
  update_available: boolean;
  latest_version: string | null;
  tags: string[];
  config: Record<string, unknown>;
  installed_at: number;
  updated_at: number;
}

export interface CreateExtensionInput {
  id: string;
  name: string;
  type?: string;
  description?: string;
  version?: string;
  author?: string;
  rating?: number;
  downloads?: number;
  tags?: string[];
  is_builtin?: boolean;
}

function extensionFromRow(row: Record<string, unknown>): ExtensionRecord {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    version: String(row.version ?? '1.0.0'),
    type: String(row.type ?? 'local'),
    author: String(row.author ?? 'Unknown'),
    rating: Number(row.rating ?? 0),
    downloads: Number(row.downloads ?? 0),
    is_enabled: Boolean(row.is_enabled),
    is_builtin: Boolean(row.is_builtin),
    update_available: Boolean(row.update_available),
    latest_version: row.latest_version != null ? String(row.latest_version) : null,
    tags: typeof row.tags === 'string' ? tagsFromJson(row.tags) : [],
    config: typeof row.config === 'string' ? JSON.parse(row.config || '{}') : {},
    installed_at: Number(row.installed_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

export function loadAllExtensions(logger?: PapyrusLogger): ExtensionRecord[] {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM extensions ORDER BY installed_at DESC');
  const rows = stmt.all() as Record<string, unknown>[];
  const extensions = rows.map(extensionFromRow);
  logger?.info(`从数据库加载 ${extensions.length} 个扩展`);
  return extensions;
}

export function getExtensionById(id: string): ExtensionRecord | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM extensions WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return extensionFromRow(row);
}

export function installExtension(input: CreateExtensionInput, logger?: PapyrusLogger): ExtensionRecord {
  const database = getDb();
  const now = Date.now() / 1000;
  const ext: ExtensionRecord = {
    id: input.id,
    name: input.name,
    description: input.description ?? '',
    version: input.version ?? '1.0.0',
    type: input.type ?? 'local',
    author: input.author ?? 'Unknown',
    rating: input.rating ?? 0,
    downloads: input.downloads ?? 0,
    is_enabled: true,
    is_builtin: input.is_builtin ?? false,
    update_available: false,
    latest_version: input.version ?? '1.0.0',
    tags: input.tags ?? [],
    config: {},
    installed_at: now,
    updated_at: now,
  };

  database.prepare(
    `INSERT OR REPLACE INTO extensions (id, name, description, version, type, author, rating, downloads, is_enabled, is_builtin, update_available, latest_version, tags, config, installed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ext.id, ext.name, ext.description, ext.version, ext.type, ext.author, ext.rating, ext.downloads,
    ext.is_enabled ? 1 : 0, ext.is_builtin ? 1 : 0, ext.update_available ? 1 : 0, ext.latest_version,
    JSON.stringify(ext.tags), JSON.stringify(ext.config), ext.installed_at, ext.updated_at
  );

  logger?.info(`安装扩展: ${ext.name} (${ext.id})`);
  return ext;
}

export function uninstallExtension(id: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const ext = getExtensionById(id);
  if (!ext) return false;
  if (ext.is_builtin) {
    logger?.warning(`无法卸载内置扩展: ${id}`);
    return false;
  }
  const stmt = database.prepare('DELETE FROM extensions WHERE id = ?');
  const result = stmt.run(id);
  logger?.info(`卸载扩展: ${id}`);
  return result.changes > 0;
}

export function setExtensionEnabled(id: string, enabled: boolean, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const now = Date.now() / 1000;
  const stmt = database.prepare('UPDATE extensions SET is_enabled = ?, updated_at = ? WHERE id = ?');
  const result = stmt.run(enabled ? 1 : 0, now, id);
  logger?.info(`扩展 ${id} 已${enabled ? '启用' : '禁用'}`);
  return result.changes > 0;
}

export function checkExtensionUpdates(logger?: PapyrusLogger): { id: string; hasUpdate: boolean; currentVersion: string; latestVersion: string }[] {
  const extensions = loadAllExtensions(logger);
  const results: { id: string; hasUpdate: boolean; currentVersion: string; latestVersion: string }[] = [];

  for (const ext of extensions) {
    if (ext.latest_version && ext.latest_version !== ext.version) {
      results.push({
        id: ext.id,
        hasUpdate: true,
        currentVersion: ext.version,
        latestVersion: ext.latest_version,
      });
      const database = getDb();
      database.prepare('UPDATE extensions SET update_available = 1 WHERE id = ?').run(ext.id);
    }
  }

  return results;
}

export function updateExtensionConfig(id: string, config: Record<string, unknown>, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const now = Date.now() / 1000;
  const stmt = database.prepare('UPDATE extensions SET config = ?, updated_at = ? WHERE id = ?');
  const result = stmt.run(JSON.stringify(config), now, id);
  logger?.info(`更新扩展配置: ${id}`);
  return result.changes > 0;
}

export function getExtensionStats(): { total: number; enabled: number; builtin: number } {
  const database = getDb();
  const total = (database.prepare('SELECT COUNT(*) as c FROM extensions').get() as { c: number }).c;
  const enabled = (database.prepare('SELECT COUNT(*) as c FROM extensions WHERE is_enabled = 1').get() as { c: number }).c;
  const builtin = (database.prepare('SELECT COUNT(*) as c FROM extensions WHERE is_builtin = 1').get() as { c: number }).c;
  return { total, enabled, builtin };
}

export { closeDb, getDb, resetDb };
