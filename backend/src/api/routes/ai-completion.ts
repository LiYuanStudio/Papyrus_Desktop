import type { FastifyInstance } from 'fastify';
import { aiConfig } from '../../ai/config-instance.js';
import { getProviderConfigFromDB, loadAIConfigFromDb } from '../../ai/db-sync.js';
import { validateProviderBaseUrl } from '../../utils/provider-security.js';
import { fetchWithProxy } from '../../utils/proxy.js';
import { isKeylessProvider } from './ai-common.js';
import type { CompletionPayload } from './ai-common.js';
import { readUiSetting, writeUiSetting } from '../../db/database.js';

const COMPLETION_CONFIG_KEY = 'completion.config';

interface CompletionConfig {
  enabled: boolean;
  require_confirm: boolean;
  trigger_delay: number;
  max_tokens: number;
}

const DEFAULT_COMPLETION_CONFIG: CompletionConfig = {
  enabled: true,
  require_confirm: false,
  trigger_delay: 500,
  max_tokens: 150,
};

let _completionConfig: CompletionConfig = { ...DEFAULT_COMPLETION_CONFIG };
let _configLoaded = false;

const ALLOWED_COMPLETION_KEYS = new Set(['enabled', 'require_confirm', 'trigger_delay', 'max_tokens']);

function isValidCompletionValue(key: keyof CompletionConfig, value: unknown): boolean {
  switch (key) {
    case 'enabled':
    case 'require_confirm':
      return typeof value === 'boolean';
    case 'trigger_delay':
    case 'max_tokens':
      return typeof value === 'number' && Number.isFinite(value);
    default:
      return false;
  }
}

function loadCompletionConfig(): void {
  if (_configLoaded) return;
  const raw = readUiSetting(COMPLETION_CONFIG_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const merged: Partial<CompletionConfig> = {};
      for (const key of Object.keys(parsed)) {
        if (!ALLOWED_COMPLETION_KEYS.has(key)) continue;
        const typedKey = key as keyof CompletionConfig;
        if (isValidCompletionValue(typedKey, parsed[key])) {
          merged[typedKey] = parsed[key] as never;
        }
      }
      _completionConfig = { ...DEFAULT_COMPLETION_CONFIG, ...merged };
    } catch {
      // 持久化配置解析失败时使用默认配置，避免服务启动异常
    }
  }
  _configLoaded = true;
}

export default async function aiCompletionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/completion/config', async (_request, reply) => {
    loadCompletionConfig();
    reply.send({ success: true, config: _completionConfig });
  });

  fastify.post('/completion/config', async (request, reply) => {
    loadCompletionConfig();
    const payload = request.body as Record<string, unknown>;
    if ('enabled' in payload && typeof payload.enabled !== 'boolean') {
      reply.status(400).send({ success: false, error: 'enabled 字段必须为布尔值' });
      return;
    }
    const update: Partial<CompletionConfig> = {};
    for (const key of Object.keys(payload)) {
      if (!ALLOWED_COMPLETION_KEYS.has(key)) {
        reply.status(400).send({ success: false, error: `不允许的配置项: ${key}` });
        return;
      }
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        reply.status(400).send({ success: false, error: '非法配置项名称' });
        return;
      }
      const typedKey = key as keyof CompletionConfig;
      const value = payload[key];
      if (!isValidCompletionValue(typedKey, value)) {
        reply.status(400).send({ success: false, error: `字段 ${key} 类型不正确` });
        return;
      }
      update[typedKey] = value as never;
    }
    _completionConfig = { ..._completionConfig, ...update };
    writeUiSetting(COMPLETION_CONFIG_KEY, JSON.stringify(_completionConfig));
    reply.send({ success: true });
  });

  fastify.post('/completion', async (request, reply) => {
    // 在处理请求前，同步最新的配置
    loadAIConfigFromDb(aiConfig);
    loadCompletionConfig();

    const payload = request.body as CompletionPayload;
    const providerName = aiConfig.config.current_provider;
    const providerConfig = getProviderConfigFromDB(providerName);
    if (!providerConfig) {
      reply.status(400).send({ success: false, error: 'Provider 未配置' });
      return;
    }

    const systemPrompt = `你是一个智能写作助手。根据用户提供的文本上下文，预测并续写接下来的内容。
要求：
1. 续写内容要自然流畅，与上下文保持一致
2. 只输出续写的文本，不要解释
3. 如果是列表、代码块等特殊格式，保持格式一致`;

    const userPrompt = `请根据以下内容续写：\n\n${payload.prefix}`;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      if (providerName === 'ollama') {
        const baseUrl = providerConfig.base_url || 'http://localhost:11434';
        const firstOllamaModel = providerConfig.models?.[0] ?? '';
        const model = aiConfig.config.current_model || firstOllamaModel;

        const urlError = validateProviderBaseUrl(baseUrl, providerName);
        if (urlError) {
          reply.raw.write(`data: {"error":"${urlError}"}\n\n`);
          reply.raw.write(`data: {"done":true}\n\n`);
          reply.raw.end();
          return;
        }

        const resp = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            stream: true,
            options: { temperature: 0.7 },
          }),
        });

        if (!resp.ok || !resp.body) {
          reply.raw.write(`data: {"error":"Ollama API 错误: ${resp.status}"}\n\n`);
          reply.raw.write(`data: {"done":true}\n\n`);
          reply.raw.end();
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line) as unknown;
              if (chunk === null || typeof chunk !== 'object') continue;
              const dict = chunk as Record<string, unknown>;
              const message = dict.message as Record<string, unknown> | undefined;
              const content = message?.content;
              if (typeof content === 'string' && content) {
                reply.raw.write(`data: {"text":${JSON.stringify(content)}}\n\n`);
              }
            } catch {
              // ignore
            }
          }
        }
      } else {
        if (!providerConfig.api_key && !isKeylessProvider(providerName)) {
          reply.raw.write(`data: {"error":"AI API Key 未设置"}\n\n`);
          reply.raw.write(`data: {"done":true}\n\n`);
          reply.raw.end();
          return;
        }
        const baseUrl = providerConfig.base_url || 'https://api.openai.com/v1';
        const urlError = validateProviderBaseUrl(baseUrl, providerName);
        if (urlError) {
          reply.raw.write(`data: {"error":"${urlError}"}\n\n`);
          reply.raw.write(`data: {"done":true}\n\n`);
          reply.raw.end();
          return;
        }
        const apiKey = providerConfig.api_key;
        const firstModel = providerConfig.models?.[0] ?? '';
        const model = aiConfig.config.current_model || firstModel;

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ];

        const maxTokens = payload.max_tokens ?? _completionConfig.max_tokens ?? 150;

        const reqBody: Record<string, unknown> = {
          model,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: maxTokens,
        };

        const endpoint = providerName === 'gemini'
          ? `${baseUrl}/openai/chat/completions`
          : `${baseUrl}/chat/completions`;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        const resp = await fetchWithProxy(endpoint, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify(reqBody),
        });

        if (!resp.ok || !resp.body) {
          reply.raw.write(`data: {"error":"API 错误: ${resp.status}"}\n\n`);
          reply.raw.write(`data: {"done":true}\n\n`);
          reply.raw.end();
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let lineStr = line;
            if (lineStr.startsWith('data: ')) {
              lineStr = lineStr.slice(6);
            }
            if (lineStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(lineStr) as unknown;
              if (chunk === null || typeof chunk !== 'object') continue;
              const dict = chunk as Record<string, unknown>;
              const choices = dict.choices as Array<Record<string, unknown>> | undefined;
              if (!choices || !choices[0]) continue;
              const delta = choices[0].delta as Record<string, unknown> | undefined;
              for (const field of ['content', 'reasoning_content'] as const) {
                const text = delta?.[field];
                if (typeof text === 'string' && text) {
                  reply.raw.write(`data: {"text":${JSON.stringify(text)}}\n\n`);
                }
              }
            } catch {
              // ignore
            }
          }
        }
      }

      reply.raw.write(`data: {"done":true}\n\n`);
      reply.raw.end();
    } catch (e) {
      reply.raw.write(`data: {"error":${JSON.stringify(e instanceof Error ? e.message : String(e))}}\n\n`);
      reply.raw.write(`data: {"done":true}\n\n`);
      reply.raw.end();
    }
  });
}
