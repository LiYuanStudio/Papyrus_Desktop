import fs from 'node:fs';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

interface ParsedFlags {
  json: boolean;
  params: JsonObject;
  values: Record<string, string>;
}

const API_BASE = normalizeApiBase(process.env.PAPYRUS_API_URL ?? 'http://127.0.0.1:8000/api');

// 规范化 Desktop API 根地址，输入为环境变量中的 API 地址，输出为始终带 `/api` 前缀的可访问基地址。
// 原因：调用方可能传入 `http://127.0.0.1:8000` 或 `http://127.0.0.1:8000/api`，统一归一化可以避免每个命令分支重复拼接判断。
// 未把路径判断散落到各命令：分散处理更容易产生 `//api/api/...` 之类的拼接错误，排障也更难。
function normalizeApiBase(rawBase: string): string {
  const trimmedBase = rawBase.replace(/\/+$/, '');
  return trimmedBase.endsWith('/api') ? trimmedBase : `${trimmedBase}/api`;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 从命令行参数中抽取 `--json`、键值选项和 `--params` JSON，输入为原始 argv，输出为解析后的旗标结构。
// 原因：内置 CLI 首要任务是稳定代理 Desktop API，先支持当前设计文档需要的最小参数集即可满足自动化调用。
// 未引入参数解析库：这里只需要少量受控命令，手写解析更轻量，也避免为打包版增加额外依赖。
function parseFlags(args: string[]): ParsedFlags {
  const values: Record<string, string> = {};
  let json = false;
  let params: JsonObject = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--json') {
      json = true;
      continue;
    }
    if (!current?.startsWith('--')) {
      continue;
    }

    const next = args[index + 1];
    if (current === '--params') {
      if (!next) {
        throw new Error('--params 需要提供 JSON 字符串');
      }
      const parsedJson: unknown = JSON.parse(next);
      if (!isJsonObject(parsedJson)) {
        throw new Error('--params 必须是 JSON 对象');
      }
      params = parsedJson;
      index += 1;
      continue;
    }

    if (!next || next.startsWith('--')) {
      throw new Error(`${current} 需要提供值`);
    }
    values[current.slice(2)] = next;
    index += 1;
  }

  return { json, params, values };
}

// 删除 CLI 参数中的选项片段，输入为原始 argv，输出为仅保留命令路径和位置参数的数组。
// 原因：命令分发只关心主命令和少量位置参数，先去掉旗标能让分支判断更清晰。
// 未在遍历时同步分发命令：先规整数据再分发更容易维护，也方便未来扩展更多命令。
function stripFlags(args: string[]): string[] {
  const stripped: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current) {
      continue;
    }
    if (current === '--json') {
      continue;
    }
    if (current.startsWith('--')) {
      index += 1;
      continue;
    }
    stripped.push(current);
  }
  return stripped;
}

async function requestJson(
  relativePath: string,
  init?: RequestInit,
): Promise<unknown> {
  const url = `${API_BASE}${relativePath}`;
  const headers: Record<string, string> = {};
  if (process.env.PAPYRUS_AUTH_TOKEN) {
    headers['X-Papyrus-Token'] = process.env.PAPYRUS_AUTH_TOKEN;
  }
  if (init?.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const errorMessage = typeof parsed === 'object' && parsed !== null && 'error' in parsed && typeof parsed.error === 'string'
      ? parsed.error
      : `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }
  return parsed;
}

async function callMcpTool(tool: string, params: JsonObject): Promise<unknown> {
  return await requestJson('/mcp/call', {
    method: 'POST',
    body: JSON.stringify({ tool, params }),
  });
}

async function executeCommand(rawArgs: string[]): Promise<unknown> {
  const flags = parseFlags(rawArgs);
  const args = stripFlags(rawArgs);
  const primary = args[0];
  const secondary = args[1];

  if (!primary || primary === 'status') {
    const health = await requestJson('/health');
    return {
      success: true,
      cli: 'bundled',
      apiBase: API_BASE,
      mcpBase: process.env.PAPYRUS_MCP_URL ?? 'http://127.0.0.1:9200',
      health,
      json: flags.json,
    };
  }

  if ((primary === 'card' || primary === 'cards') && secondary === 'list') {
    return await requestJson('/cards');
  }

  if ((primary === 'card' || primary === 'cards') && (secondary === 'show' || secondary === 'get')) {
    const cardId = args[2];
    if (!cardId) {
      throw new Error('card show 需要提供卡片 ID');
    }
    return await requestJson(`/cards/${encodeURIComponent(cardId)}`);
  }

  if ((primary === 'card' || primary === 'cards') && (secondary === 'add' || secondary === 'create')) {
    const question = args[2];
    const answer = args[3];
    if (!question || !answer) {
      throw new Error('card add 需要提供 question 和 answer 两个位置参数');
    }
    const tags = flags.values.tags ? flags.values.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];
    return await requestJson('/cards', {
      method: 'POST',
      body: JSON.stringify({ q: question, a: answer, tags }),
    });
  }

  if ((primary === 'card' || primary === 'cards') && (secondary === 'edit' || secondary === 'update')) {
    const cardId = args[2];
    if (!cardId) {
      throw new Error('card edit 需要提供卡片 ID');
    }
    const question = flags.values.question;
    const answer = flags.values.answer;
    const tags = flags.values.tags ? flags.values.tags.split(',').map(tag => tag.trim()).filter(Boolean) : undefined;
    if (!question && !answer && !tags) {
      throw new Error('card edit 至少需要提供 --question、--answer 或 --tags');
    }
    return await requestJson(`/cards/${encodeURIComponent(cardId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(question ? { q: question } : {}),
        ...(answer ? { a: answer } : {}),
        ...(tags ? { tags } : {}),
      }),
    });
  }

  if ((primary === 'card' || primary === 'cards') && (secondary === 'delete' || secondary === 'rm')) {
    const cardId = args[2];
    if (!cardId) {
      throw new Error('card delete 需要提供卡片 ID');
    }
    return await requestJson(`/cards/${encodeURIComponent(cardId)}`, {
      method: 'DELETE',
    });
  }

  if ((primary === 'card' || primary === 'cards') && (secondary === 'search' || secondary === 'find')) {
    const query = args[2];
    if (!query) {
      throw new Error('card search 需要提供查询关键字');
    }
    return await requestJson(`/search?query=${encodeURIComponent(query)}`);
  }

  if ((primary === 'card' || primary === 'cards') && secondary === 'import') {
    const filePath = args[2];
    if (!filePath) {
      throw new Error('card import 需要提供文本文件路径');
    }
    const absolutePath = path.resolve(filePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    return await requestJson('/cards/import/txt', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  if ((primary === 'card' || primary === 'cards') && secondary === 'export') {
    return await requestJson('/cards');
  }

  if ((primary === 'card' || primary === 'cards') && (secondary === 'due' || secondary === 'due-today')) {
    return await requestJson('/review/next');
  }

  if (primary === 'review' && !secondary) {
    return await requestJson('/review/next');
  }

  if (primary === 'stats' || primary === 'statistics') {
    return await callMcpTool('get_review_stats', {});
  }

  if (primary === 'review' && (secondary === 'stats' || secondary === 'summary')) {
    return await callMcpTool('get_review_stats', {});
  }

  if (primary === 'review' && secondary === 'rate') {
    const cardId = args[2];
    const gradeText = flags.values.grade;
    if (!cardId || !gradeText) {
      throw new Error('review rate 需要提供卡片 ID 和 --grade');
    }
    const grade = Number.parseInt(gradeText, 10);
    if (![1, 2, 3].includes(grade)) {
      throw new Error('--grade 必须是 1、2 或 3');
    }
    return await requestJson(`/review/${encodeURIComponent(cardId)}/rate`, {
      method: 'POST',
      body: JSON.stringify({ grade }),
    });
  }

  if (primary === 'files' && secondary === 'list') {
    return await requestJson('/files');
  }

  if (primary === 'ext' && secondary === 'list') {
    return await requestJson('/extensions');
  }

  if (primary === 'ext' && secondary === 'install') {
    const filePath = args[2];
    if (!filePath) {
      throw new Error('ext install 需要提供本地 zip 路径');
    }
    const absolutePath = path.resolve(filePath);
    const base64Content = fs.readFileSync(absolutePath).toString('base64');
    return await requestJson('/extensions/install-local', {
      method: 'POST',
      body: JSON.stringify({
        filename: path.basename(absolutePath),
        content: base64Content,
      }),
    });
  }

  if (primary === 'mcp' && secondary === 'tools') {
    return await requestJson('/mcp/tools');
  }

  if (primary === 'mcp' && secondary === 'call') {
    const toolName = args[2];
    if (!toolName) {
      throw new Error('mcp call 需要提供工具名');
    }
    return await callMcpTool(toolName, flags.params);
  }

  if (primary === 'data' && secondary === 'backup') {
    return await requestJson('/backup', {
      method: 'POST',
    });
  }

  if (primary === 'data' && secondary === 'export') {
    return await requestJson('/export');
  }

  if (primary === 'data' && secondary === 'import') {
    const filePath = args[2];
    if (!filePath) {
      throw new Error('data import 需要提供 JSON 文件路径');
    }
    const absolutePath = path.resolve(filePath);
    const payload: unknown = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return await requestJson('/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  if (primary === 'data' && secondary === 'stats') {
    return await callMcpTool('get_review_stats', {});
  }

  if (primary === 'serve' || primary === 'server') {
    return {
      success: true,
      message: 'Desktop 内置后端由应用主进程托管，无需通过 CLI 单独启动。',
      apiBase: API_BASE,
    };
  }

  if (primary === 'stop') {
    throw new Error('Desktop 托管模式下不支持通过内置 CLI 停止后端');
  }

  if (primary === 'docs') {
    return {
      success: true,
      docs: `${API_BASE.replace(/\/api$/, '')}/api/health`,
      note: 'Desktop 模式下请直接通过内置界面或 API 路由调试。',
    };
  }

  if (primary === 'config') {
    return {
      success: true,
      config: {
        apiUrl: API_BASE,
        mcpUrl: process.env.PAPYRUS_MCP_URL ?? 'http://127.0.0.1:9200',
      },
      message: 'Desktop 内置 CLI 当前直接复用环境变量，不写独立配置文件。',
    };
  }

  if (primary === 'quickstart') {
    return {
      success: true,
      steps: [
        'papyrus status',
        'papyrus card add "Question" "Answer"',
        'papyrus review',
        'papyrus stats',
      ],
    };
  }

  throw new Error(`未知命令: ${args.join(' ')}`);
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

try {
  const result = await executeCommand(process.argv.slice(2));
  writeJson(result);
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeJson({ success: false, error: message });
  process.exit(1);
}
