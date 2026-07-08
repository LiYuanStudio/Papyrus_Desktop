import { CARD_TOOLS } from '#/ai/tools/cards.js';
import type { ToolResult } from '#/ai/tools/types.js';
import { CliManager } from '#/cli/cli-manager.js';
import { listFiles } from '#/core/files.js';
import { getCardById, getDb, getNoteById, loadAllCards, loadAllNotes } from '#/db/database.js';
import type { PapyrusLogger } from '#/utils/logger.js';

export const MCP_CARD_TOOLS = [
  'search_cards',
  'get_card',
  'get_card_stats',
  'create_card',
  'update_card',
  'delete_card',
];

export const MCP_FILE_TOOLS = [
  'list_files',
];

export const MCP_REVIEW_TOOLS = [
  'get_review_stats',
];

export const MCP_VAULT_TOOLS = [
  'vault_index',
  'vault_read',
  'vault_watch',
  'vault_emergency_sample',
];

export const MCP_CLI_TOOLS = [
  'cli_status',
  'cli_install',
];

// 汇总 MCP 工具清单，返回给 Desktop API 与独立 MCP 服务。
// 原因：CLI Manager 与既有卡片/文件/复习工具需要统一暴露给 AI、Skill 和插件。
// 未拆成多个端点：调用方已经依赖统一 /tools 目录，保留单一入口更兼容。
export function getMcpToolsCatalog(): { tools: string[]; categories: Record<string, string[]>; service_note: string } {
  return {
    tools: MCP_CARD_TOOLS.concat(MCP_FILE_TOOLS, MCP_REVIEW_TOOLS, MCP_VAULT_TOOLS, MCP_CLI_TOOLS),
    categories: {
      cards: MCP_CARD_TOOLS,
      files: MCP_FILE_TOOLS,
      review: MCP_REVIEW_TOOLS,
      vault: MCP_VAULT_TOOLS,
      cli: MCP_CLI_TOOLS,
    },
    service_note: '主服务 /api/mcp 提供 HTTP REST 能力；独立 MCP 服务提供相同核心工具的 /tools 与 /call 入口，面向外部客户端。',
  };
}

// 执行 MCP 工具并返回 JSON 可序列化对象。
// 原因：CLI 安装/运行涉及下载与进程执行，必须支持异步；同步工具通过 Promise 统一适配。
// 未继续使用同步签名：混合同步和异步会让 MCP HTTP 层无法可靠等待 CLI 结果。
export async function executeMcpTool(
  toolName: string,
  params: Record<string, unknown>,
  logger?: PapyrusLogger,
  cliManager = new CliManager(),
): Promise<Record<string, unknown>> {
  if (MCP_CLI_TOOLS.includes(toolName)) {
    return await executeCliTool(toolName, params, cliManager);
  }
  if (MCP_VAULT_TOOLS.includes(toolName)) {
    return executeVaultTool(toolName, params, logger);
  }
  if (MCP_FILE_TOOLS.includes(toolName)) {
    return executeFileTool(toolName, logger);
  }
  if (MCP_REVIEW_TOOLS.includes(toolName)) {
    return executeReviewTool();
  }
  if (toolName === 'get_card') {
    const cardId = typeof params.card_id === 'string' ? params.card_id : '';
    const card = getCardById(cardId);
    return card ? { success: true, card } : { success: false, error: 'Card not found' };
  }

  const cardTool = CARD_TOOLS.find(tool => tool.name === toolName);
  if (!cardTool) {
    return { success: false, error: `未知工具: ${toolName}` };
  }
  return cardTool.runner(params, { logger: logger ?? null });
}

// 将通用 MCP 返回值适配为 AI 工具结果。
// 原因：AI 工具体系要求 success 字段稳定存在，MCP 结果只保证 JSON 对象。
// 未直接复用原对象：显式 Boolean 化可避免 undefined 被上层误判。
export async function executeMcpToolResult(
  toolName: string,
  params: Record<string, unknown>,
  logger?: PapyrusLogger,
): Promise<ToolResult> {
  const result = await executeMcpTool(toolName, params, logger);
  return {
    success: Boolean(result.success),
    ...result,
  };
}

// 执行 CLI Manager 工具。
// 原因：Skill 和插件应通过 Desktop 管理 CLI，而不是自行安装或读取 PapyrusData。
// 未直接暴露文件路径写入：安装路径和 manifest 由 CliManager 统一控制，降低误写用户数据风险。
async function executeCliTool(
  toolName: string,
  params: Record<string, unknown>,
  cliManager: CliManager,
): Promise<Record<string, unknown>> {
  if (toolName === 'cli_status') {
    return { ...(await cliManager.getStatus()) };
  }
  if (toolName === 'cli_install') {
    return { ...(await cliManager.install()) };
  }
  if (toolName === 'cli_run') {
    const args = Array.isArray(params.args) ? params.args : [];
    if (!args.every(arg => typeof arg === 'string')) {
      return { success: false, error: 'args 必须是字符串数组' };
    }
    return { ...(await cliManager.run(args)) };
  }
  return { success: false, error: `未知 CLI 工具: ${toolName}` };
}

function executeFileTool(toolName: string, logger?: PapyrusLogger): Record<string, unknown> {
  if (toolName !== 'list_files') {
    return { success: false, error: `未知文件工具: ${toolName}` };
  }
  const files = listFiles(logger).map(file => ({
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    mime_type: file.mime_type,
    parent_id: file.parent_id,
    is_folder: Boolean(file.is_folder),
    created_at: file.created_at,
    updated_at: file.updated_at,
  }));
  return { success: true, files, count: files.length };
}

function executeReviewTool(): Record<string, unknown> {
  const cards = loadAllCards();
  const now = Date.now() / 1000;
  const due = cards.filter(card => card.next_review <= now).length;
  const db = getDb();
  const progress = db.prepare('SELECT * FROM daily_progress ORDER BY date DESC LIMIT 30').all() as Array<{
    date: string;
    cards_created: number;
    cards_reviewed: number;
    notes_created: number;
    study_minutes: number;
  }>;
  return {
    success: true,
    stats: {
      total_cards: cards.length,
      due_cards: due,
      reviewed_30_days: progress.reduce((sum, row) => sum + row.cards_reviewed, 0),
      daily_progress: progress,
    },
  };
}

function executeVaultTool(toolName: string, params: Record<string, unknown>, logger?: PapyrusLogger): Record<string, unknown> {
  if (toolName === 'vault_index') {
    const notes = loadAllNotes(logger);
    return {
      success: true,
      notes: notes.map(n => ({
        id: n.id,
        title: n.title,
        folder: n.folder,
        preview: n.preview,
        tags: n.tags,
        word_count: n.word_count,
        updated_at: n.updated_at,
      })),
      total: notes.length,
    };
  }
  if (toolName === 'vault_read') {
    const ids = Array.isArray(params.ids) ? params.ids.map(id => String(id)) : [];
    const notes = ids.map(id => getNoteById(id)).filter(note => note !== null);
    return { success: true, notes };
  }
  return { success: false, error: 'Vault工具未完全实现' };
}

