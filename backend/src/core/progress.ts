import { getDb } from '../db/database.js';

function ensureProgressSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_progress (
      date TEXT PRIMARY KEY,
      cards_created INTEGER DEFAULT 0,
      cards_reviewed INTEGER DEFAULT 0,
      notes_created INTEGER DEFAULT 0,
      study_minutes INTEGER DEFAULT 0
    )
  `);
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// 记录某日一种活动的增量，输入活动列、数量和 UTC 日期，输出为空。
// 原因：评分撤销需要沿用原评分日期，不能在跨日后把计数写入当前日期。
// 未暴露任意列名：联合类型将动态 SQL 限制为三个受信任的计数字段。
function recordActivity(
  type: 'cards_created' | 'cards_reviewed' | 'notes_created',
  count = 1,
  activityDate = getToday(),
): void {
  ensureProgressSchema();
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO daily_progress (date, ${type})
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET ${type} = ${type} + excluded.${type}
  `);
  stmt.run(activityDate, count);
}

export function recordCardCreated(): void {
  recordActivity('cards_created');
}

// 记录一次卡片复习，输入可选 UTC 日期，输出实际写入日期供撤销快照保存。
// 原因：返回日期可让评分事务与后续撤销共享同一日历归属。
// 未让调用方自行重复计算日期：统一入口避免午夜边界产生不一致。
export function recordCardReviewed(activityDate = getToday()): string {
  recordActivity('cards_reviewed', 1, activityDate);
  return activityDate;
}

export function recordNoteCreated(): void {
  recordActivity('notes_created');
}

// 撤销指定日期的一次卡片复习，输入评分时保存的 UTC 日期，输出是否实际扣减。
// 原因：评分撤销可能发生在日期切换后，必须扣回原评分日期而不是当前日期。
// 未用负数调用通用 recordActivity：UPSERT 可能为不存在日期创建负计数，专用 UPDATE 可保证下限为零。
export function undoCardReviewed(activityDate: string): boolean {
  ensureProgressSchema();
  const db = getDb();
  const result = db.prepare(`
    UPDATE daily_progress
    SET cards_reviewed = MAX(0, cards_reviewed - 1)
    WHERE date = ? AND cards_reviewed > 0
  `).run(activityDate);
  return Number(result.changes) === 1;
}
