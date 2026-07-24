import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import {
  loadAllCards,
  insertCard as dbInsertCard,
  deleteCardById,
  deleteCardsByIds,
  getCardById,
  updateCard as dbUpdateCard,
  getCardsDueBefore,
  getCardCount,
  getPendingCardReviewAction,
  insertCardReviewAction,
  markCardReviewActionUndone,
  runInTransaction,
} from '../db/database.js';
import { saveCardVersion } from './versioning.js';
import { applySm2 } from './sm2.js';
import { recordCardCreated, recordCardReviewed, undoCardReviewed } from './progress.js';
import type { CardRecord } from './types.js';
import type { PapyrusLogger } from '../utils/logger.js';

const cardMutex = new Mutex();

export function getAllCards(logger?: PapyrusLogger): CardRecord[] {
  return loadAllCards(logger);
}

export function createCard(
  q: string,
  a: string,
  tags: string[] = [],
  logger?: PapyrusLogger,
): CardRecord {
  const card: CardRecord = {
    id: uuidv4().replace(/-/g, ''),
    q,
    a,
    next_review: Date.now() / 1000,
    interval: 0,
    ef: 2.5,
    repetitions: 0,
    tags,
  };

  dbInsertCard(card, logger);
  recordCardCreated();
  logger?.info(`创建卡片: ${card.id}`);
  return card;
}

export async function updateCard(
  cardId: string,
  updates: Partial<Pick<CardRecord, 'q' | 'a' | 'tags'>>,
  logger?: PapyrusLogger,
): Promise<CardRecord | null> {
  return cardMutex.runExclusive(() => {
    const card = getCardById(cardId);
    if (!card) return null;

    saveCardVersion(card, logger);

    if (updates.q !== undefined) card.q = updates.q;
    if (updates.a !== undefined) card.a = updates.a;
    if (updates.tags !== undefined) card.tags = updates.tags;

    dbUpdateCard(card, logger);
    return card;
  });
}

export function deleteCard(cardId: string, logger?: PapyrusLogger): boolean {
  return deleteCardById(cardId, logger);
}

export function deleteCards(cardIds: string[], logger?: PapyrusLogger): number {
  return deleteCardsByIds(cardIds, logger);
}

// 按可选集合标签过滤卡片，输入卡片数组和标签，输出保持原对象引用的匹配数组。
// 原因：复习入口和统计必须使用完全一致的标签语义，避免集合模式混入其他卡片。
// 未在 SQLite 中调用 json_each：历史数据库可能含损坏 tags JSON，现有加载层已安全降级为空数组。
function filterCardsByTag(cards: CardRecord[], tag?: string): CardRecord[] {
  if (tag === undefined || tag.length === 0) return cards;
  return cards.filter(card => card.tags.includes(tag));
}

// 随机选择下一张到期卡片，输入可选标签和日志器，输出匹配卡片或 null。
// 原因：集合复习必须在随机选择前过滤，否则可能展示其他集合的卡片。
// 未在选择后检查标签：后置过滤会把一次不匹配的随机结果误判为没有到期卡。
export function getNextDueCard(tag?: string, _logger?: PapyrusLogger): CardRecord | null {
  const now = Date.now() / 1000;
  const due = filterCardsByTag(getCardsDueBefore(now), tag);
  if (due.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * due.length);
  return due[randomIndex] ?? null;
}

// 应用一次 SM-2 评分并保存可撤销快照，输入卡片、等级和日志器，输出评分结果或 null。
// 原因：卡片更新、进度计数和撤销记录必须在同一数据库事务内保持一致。
// 未在 API 路由分步写入：路由中途失败会造成部分持久化，核心层事务可供所有调用路径复用。
export async function rateCard(
  cardId: string,
  grade: number,
  logger?: PapyrusLogger,
): Promise<{ card: CardRecord; intervalDays: number; ef: number; reviewId: string } | null> {
  return cardMutex.runExclusive(() => {
    const card = getCardById(cardId);
    if (!card) return null;

    const previous = {
      nextReview: card.next_review,
      interval: card.interval,
      ef: card.ef,
      repetitions: card.repetitions,
    };
    const reviewId = uuidv4().replace(/-/g, '');
    const reviewDate = new Date().toISOString().slice(0, 10);

    return runInTransaction(() => {
      const { intervalDays, ef } = applySm2(card, grade);
      if (!dbUpdateCard(card, logger)) {
        throw new Error(`Card disappeared while rating: ${cardId}`);
      }
      insertCardReviewAction({
        id: reviewId,
        card_id: cardId,
        previous_next_review: previous.nextReview,
        previous_interval: previous.interval,
        previous_ef: previous.ef,
        previous_repetitions: previous.repetitions,
        rated_next_review: card.next_review,
        rated_interval: card.interval,
        rated_ef: card.ef,
        rated_repetitions: card.repetitions,
        review_date: reviewDate,
        undone: 0,
        created_at: Date.now() / 1000,
      });
      recordCardReviewed(reviewDate);

      logger?.info(`复习卡片: ${cardId}, 评级: ${grade}, 间隔: ${intervalDays.toFixed(1)}天`);
      return { card, intervalDays, ef, reviewId };
    });
  });
}

// 描述持久化撤销的三种结果，调用方据此区分成功、重复请求和后续评分冲突。
// 原因：null 无法表达“操作不存在”与“卡片已再次变化”的差异，API 需要返回准确状态码。
// 未抛出业务异常：联合类型让预期冲突留在正常控制流，日志只记录真正的系统错误。
export type UndoCardRatingResult =
  | { status: 'restored'; card: CardRecord }
  | { status: 'unavailable' }
  | { status: 'conflict' };

// 判断当前卡片是否仍处于目标评分后的调度状态，输入卡片与持久化字段，输出布尔值。
// 原因：如果同一卡片已再次评分，回滚旧操作会覆盖更新后的 SM-2 状态。
// 未比较问答和标签：它们可在评分后独立编辑，不应阻止调度字段的安全撤销。
function matchesRatedSchedule(
  card: CardRecord,
  rated: {
    rated_next_review: number;
    rated_interval: number;
    rated_ef: number;
    rated_repetitions: number;
  },
): boolean {
  return card.next_review === rated.rated_next_review
    && card.interval === rated.rated_interval
    && card.ef === rated.rated_ef
    && card.repetitions === rated.rated_repetitions;
}

// 撤销一次已持久化评分，输入卡片和服务端操作 ID，输出恢复结果。
// 原因：卡片状态、撤销标记和每日计数必须处于同一事务，避免部分成功导致复习数据损坏。
// 未接受客户端提交的旧卡片快照：只信任评分时写入数据库的状态，防止篡改调度字段。
export async function undoCardRating(
  cardId: string,
  reviewId: string,
  logger?: PapyrusLogger,
): Promise<UndoCardRatingResult> {
  return cardMutex.runExclusive(() => runInTransaction(() => {
    const action = getPendingCardReviewAction(reviewId, cardId);
    if (action === null) return { status: 'unavailable' };

    const card = getCardById(cardId);
    if (card === null) return { status: 'unavailable' };
    if (!matchesRatedSchedule(card, action)) return { status: 'conflict' };

    card.next_review = action.previous_next_review;
    card.interval = action.previous_interval;
    card.ef = action.previous_ef;
    card.repetitions = action.previous_repetitions;
    if (!dbUpdateCard(card, logger)) {
      throw new Error(`Card disappeared while undoing review: ${cardId}`);
    }
    if (!markCardReviewActionUndone(reviewId)) {
      throw new Error(`Review action changed while undoing: ${reviewId}`);
    }
    undoCardReviewed(action.review_date);
    logger?.info(`撤销卡片评分: ${cardId}, 操作: ${reviewId}`);
    return { status: 'restored', card };
  }));
}

export function importCardsFromTxt(content: string, logger?: PapyrusLogger): CardRecord[] {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const cards: CardRecord[] = [];

  for (const line of lines) {
    let parts: string[];
    if (line.includes('===')) {
      parts = line.split('===');
    } else if (line.includes('\t')) {
      parts = line.split('\t');
    } else {
      continue;
    }

    if (parts.length >= 2) {
      const q = parts[0]?.trim() ?? '';
      const a = parts[1]?.trim() ?? '';
      const tags = parts.length > 2 ? parts[2]?.split(',').map(t => t.trim()).filter(Boolean) ?? [] : [];
      if (q && a) {
        cards.push(createCard(q, a, tags, logger));
      }
    }
  }

  logger?.info(`从文本导入 ${cards.length} 张卡片`);
  return cards;
}

// 计算全局或指定标签的卡片统计，输入可选标签，输出总数和到期数。
// 原因：集合复习工具栏必须与下一张卡片使用相同过滤范围。
// 未复用全局 SQL COUNT 作为标签统计：标签存为 JSON，安全解析后的 CardRecord 语义更一致。
export function getCardStats(tag?: string): { total: number; due: number } {
  const now = Date.now() / 1000;
  const cards = filterCardsByTag(getAllCards(), tag);
  return {
    total: tag === undefined || tag.length === 0 ? getCardCount() : cards.length,
    due: cards.filter(card => card.next_review <= now).length,
  };
}
