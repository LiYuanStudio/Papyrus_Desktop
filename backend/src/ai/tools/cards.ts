import { v4 as uuidv4 } from 'uuid';
import {
  loadAllCards,
  getCardById,
  insertCard,
  updateCard as dbUpdateCard,
  deleteCardById,
  getCardsDueBefore,
} from '../../db/database.js';
import type { CardRecord } from '../../core/types.js';
import type { ToolDescriptor, ToolResult } from './types.js';
import { safeFloat, safeInt, requireString, optionalString, isErr } from './types.js';

function createCard(question: string, answer: string, tags: string[] | undefined, ctx: { logger: import('../../utils/logger.js').PapyrusLogger | null }): ToolResult {
  if (!question || !answer) {
    return { success: false, error: '题目和答案不能为空' };
  }
  const newCard: CardRecord = {
    id: uuidv4().replace(/-/g, ''),
    q: question,
    a: answer,
    next_review: Date.now() / 1000,
    interval: 0,
    tags: tags ?? [],
    ef: 2.5,
    repetitions: 0,
  };
  insertCard(newCard, ctx.logger ?? undefined);
  return {
    success: true,
    message: '卡片已创建并保存',
    card: newCard,
  };
}

function updateCardRunner(cardId: string, question: string | undefined, answer: string | undefined, ctx: { logger: import('../../utils/logger.js').PapyrusLogger | null }): ToolResult {
  const card = getCardById(cardId);
  if (!card) return { success: false, error: `未找到卡片: ${cardId}` };

  const oldQ = card.q;
  const oldA = card.a;

  if (question) card.q = question;
  if (answer) card.a = answer;

  dbUpdateCard(card, ctx.logger ?? undefined);
  return {
    success: true,
    message: '卡片已更新并保存',
    old: { q: oldQ, a: oldA },
    new: { q: card.q, a: card.a },
  };
}

function deleteCardRunner(cardId: string, ctx: { logger: import('../../utils/logger.js').PapyrusLogger | null }): ToolResult {
  const card = getCardById(cardId);
  if (!card) return { success: false, error: `未找到卡片: ${cardId}` };
  deleteCardById(card.id, ctx.logger ?? undefined);
  return {
    success: true,
    message: '卡片已删除并保存',
    deleted_card: card,
  };
}

function searchCardsRunner(keyword: string, ctx: { logger: import('../../utils/logger.js').PapyrusLogger | null }): ToolResult {
  const keywordLower = (keyword || '').toLowerCase();
  const cards = loadAllCards(ctx.logger ?? undefined);
  const results: Array<{ card_id: string; question: string; answer: string }> = [];
  for (const card of cards) {
    if (!card) continue;
    const q = card.q;
    const a = card.a;
    if (q.toLowerCase().includes(keywordLower) ||
        a.toLowerCase().includes(keywordLower) ||
        card.tags.some(t => t.toLowerCase().includes(keywordLower))) {
      results.push({
        card_id: card.id,
        question: q,
        answer: a.length > 100 ? `${a.slice(0, 100)}...` : a,
      });
    }
  }
  return {
    success: true,
    message: `找到 ${results.length} 张相关卡片`,
    count: results.length,
    results,
  };
}

function getCardStatsRunner(ctx: { logger: import('../../utils/logger.js').PapyrusLogger | null }): ToolResult {
  const cards = loadAllCards(ctx.logger ?? undefined);
  const total = cards.length;
  const now = Date.now() / 1000;
  const due = getCardsDueBefore(now).length;

  const efs = cards.map(c => safeFloat(c.ef, 2.5));
  const avgEf = efs.length > 0 ? efs.reduce((a, b) => a + b, 0) / efs.length : 2.5;
  const reps = cards.map(c => safeInt(c.repetitions, 0));

  return {
    success: true,
    stats: {
      total_cards: total,
      due_cards: due,
      average_ef: Math.round(avgEf * 100) / 100,
      max_repetitions: reps.length > 0 ? Math.max(...reps) : 0,
      cards_mastered: reps.filter(r => r >= 5).length,
    },
  };
}

export const CARD_TOOLS: ToolDescriptor[] = [
  {
    name: 'create_card',
    category: 'cards',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'create_card',
        description: '创建一张新的学习卡片并立即保存。用于用户希望记录知识点、问答对或复习内容时',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: '题目内容' },
            answer: { type: 'string', description: '答案内容' },
            tags: { type: 'array', description: '标签列表', items: { type: 'string' } },
          },
          required: ['question', 'answer'],
        },
      },
    },
    runner: (params, ctx) => {
      const question = requireString(params, 'question', 5000);
      if (isErr(question)) return { success: false, error: question.error };
      const answer = requireString(params, 'answer', 100000);
      if (isErr(answer)) return { success: false, error: answer.error };
      const tagsRaw = params.tags;
      const tagList = Array.isArray(tagsRaw) ? tagsRaw.map(t => String(t)) : undefined;
      return createCard(question, answer, tagList, ctx);
    },
  },
  {
    name: 'update_card',
    category: 'cards',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'update_card',
        description: '根据卡片 ID 更新已存在的卡片。仅传入需要修改的字段',
        parameters: {
          type: 'object',
          properties: {
            card_id: { type: 'string', description: '卡片 ID（通过 search_cards 获取）' },
            question: { type: 'string', description: '新的题目（可选）' },
            answer: { type: 'string', description: '新的答案（可选）' },
          },
          required: ['card_id'],
        },
      },
    },
    runner: (params, ctx) => {
      const cardId = requireString(params, 'card_id', 100);
      if (isErr(cardId)) return { success: false, error: cardId.error };
      const q = optionalString(params, 'question', 5000);
      if (isErr(q)) return { success: false, error: q.error };
      const a = optionalString(params, 'answer', 100000);
      if (isErr(a)) return { success: false, error: a.error };
      return updateCardRunner(cardId, q, a, ctx);
    },
  },
  {
    name: 'delete_card',
    category: 'cards',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'delete_card',
        description: '根据卡片 ID 删除一张卡片',
        parameters: {
          type: 'object',
          properties: {
            card_id: { type: 'string', description: '卡片 ID（通过 search_cards 获取）' },
          },
          required: ['card_id'],
        },
      },
    },
    runner: (params, ctx) => {
      const cardId = requireString(params, 'card_id', 100);
      if (isErr(cardId)) return { success: false, error: cardId.error };
      return deleteCardRunner(cardId, ctx);
    },
  },
  {
    name: 'search_cards',
    category: 'cards',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'search_cards',
        description: '在题目、答案、标签中搜索关键词，返回匹配的卡片列表',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词' },
          },
          required: ['keyword'],
        },
      },
    },
    runner: (params, ctx) => {
      const keyword = requireString(params, 'keyword', 500);
      if (isErr(keyword)) return { success: false, error: keyword.error };
      return searchCardsRunner(keyword, ctx);
    },
  },
  {
    name: 'get_card_stats',
    category: 'cards',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'get_card_stats',
        description: '获取卡片库的整体统计：总数、到期数、平均熟练度、最高复习次数、已掌握卡片数',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    runner: (_params, ctx) => getCardStatsRunner(ctx),
  },
];

export const CARDS_PROMPT_HINT = `卡片相关：
- create_card / update_card / delete_card：增删改卡片（操作需要卡片 ID，通过 search_cards 获取）
- search_cards：按关键字搜索卡片
- get_card_stats：获取卡片库统计`;
