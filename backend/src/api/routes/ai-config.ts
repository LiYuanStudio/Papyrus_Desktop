import type { FastifyInstance } from 'fastify';
import { aiConfig } from '../../ai/config-instance.js';
import { isPrivateUrl } from '../../ai/config.js';
import { getProviderApiKeyFromDB, getProviderConfigFromDB, loadAIConfigFromDb } from '../../ai/db-sync.js';
import { loadAllProvidersForClient } from '../../db/database.js';
import { fetchWithProxy } from '../../utils/proxy.js';
import { isKeylessProvider } from './ai-common.js';
import type { AIConfigPayload } from './ai-common.js';
import { validateProviderBaseUrl } from '../../utils/provider-security.js';

export default async function aiConfigRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/config/ai', async (request, reply) => {
    const masked = aiConfig.getMaskedConfig();
    const dbProviders = loadAllProvidersForClient();
    const providersFromDB: Record<string, { api_key: string; base_url: string; models: string[] }> = {};
    for (const p of dbProviders) {
      if (providersFromDB[p.type]) {
        request.log.warn(`Duplicate provider type "${p.type}" found in database; using first occurrence`);
        continue;
      }
      const firstKey = p.apiKeys.find((k) => k.hasKey || k.key.trim() !== '');
      providersFromDB[p.type] = {
        api_key: firstKey?.key ?? '',
        base_url: p.baseUrl ?? '',
        models: p.models.filter((m) => m.enabled).map((m) => m.modelId),
      };
    }
    reply.send({
      success: true,
      config: {
        current_provider: masked.current_provider,
        current_model: masked.current_model,
        title_provider: masked.title_provider,
        title_model: masked.title_model,
        translation_provider: masked.translation_provider,
        translation_model: masked.translation_model,
        providers: providersFromDB,
        parameters: masked.parameters,
        features: masked.features,
      },
    });
  });

  fastify.post('/config/ai', async (request, reply) => {
    try {
      const payload = request.body as AIConfigPayload;

      if (payload.current_provider !== undefined) {
        aiConfig.config.current_provider = payload.current_provider;
      }
      if (payload.current_model !== undefined) {
        aiConfig.config.current_model = payload.current_model;
      }
      if (payload.title_provider !== undefined) {
        aiConfig.config.title_provider = payload.title_provider;
      }
      if (payload.title_model !== undefined) {
        aiConfig.config.title_model = payload.title_model;
      }
      if (payload.translation_provider !== undefined) {
        aiConfig.config.translation_provider = payload.translation_provider;
      }
      if (payload.translation_model !== undefined) {
        aiConfig.config.translation_model = payload.translation_model;
      }

      if (payload.parameters) {
        aiConfig.config.parameters = {
          temperature: payload.parameters.temperature ?? aiConfig.config.parameters.temperature,
          top_p: payload.parameters.top_p ?? aiConfig.config.parameters.top_p,
          max_tokens: payload.parameters.max_tokens ?? aiConfig.config.parameters.max_tokens,
          presence_penalty: payload.parameters.presence_penalty ?? aiConfig.config.parameters.presence_penalty,
          frequency_penalty: payload.parameters.frequency_penalty ?? aiConfig.config.parameters.frequency_penalty,
        };
      }

      if (payload.features) {
        aiConfig.config.features = {
          auto_hint: payload.features.auto_hint ?? aiConfig.config.features.auto_hint,
          auto_explain: payload.features.auto_explain ?? aiConfig.config.features.auto_explain,
          context_length: payload.features.context_length ?? aiConfig.config.features.context_length,
          agent_enabled: payload.features.agent_enabled ?? aiConfig.config.features.agent_enabled,
          cache_enabled: payload.features.cache_enabled ?? aiConfig.config.features.cache_enabled,
        };
      }

      aiConfig.saveConfig();
      reply.send({ success: true });
    } catch (e) {
      reply.status(400).send({ success: false, error: e instanceof Error ? e.message : '保存配置失败' });
    }
  });

  fastify.post('/config/ai/test', async (_request, reply) => {
    try {
      // 在处理请求前，同步最新的配置
      loadAIConfigFromDb(aiConfig);
      
      const providerName = aiConfig.config.current_provider;
      const providerConfig = getProviderConfigFromDB(providerName);
      if (!providerConfig) {
        reply.send({ success: false, error: 'Provider 未配置' });
        return;
      }

      if (!providerConfig.api_key) {
        const dbKey = getProviderApiKeyFromDB(providerName);
        if (dbKey) providerConfig.api_key = dbKey;
      }

      // 对于所有 keyless providers，执行类似 ollama 的简单连接测试
      if (isKeylessProvider(providerName)) {
        const baseUrl = providerConfig.base_url || (providerName === 'ollama' ? 'http://localhost:11434' : '');
        if (!baseUrl) {
          reply.send({ success: false, error: 'Base URL 未设置' });
          return;
        }
        const urlError = validateProviderBaseUrl(baseUrl, providerName);
        if (urlError) {
          reply.send({ success: false, error: urlError });
          return;
        }
        try {
          // 对于 keyless providers，尝试连接 base URL
          // 不同的 provider 可能有不同的健康检查端点，这里我们做一个简单的 GET 请求
          // keyless Provider 只允许 localhost/127.0.0.1（validateProviderBaseUrl 已保证），故放行回环。
          const resp = await fetchWithProxy(baseUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          }, { allowLoopback: true });
          if (resp.ok || resp.status === 404 || resp.status === 401) {
            // 即使返回 404 或 401，也说明服务器是可访问的
            reply.send({ success: true, message: `${providerName} 连接成功` });
          } else {
            reply.send({ success: false, error: `${providerName} 返回错误: ${resp.status}` });
          }
        } catch (e) {
          reply.send({ success: false, error: `${providerName} 连接失败: ${e instanceof Error ? e.message : String(e)}` });
        }
        return;
      }

      const apiKey = providerConfig.api_key;
      if (!apiKey && !isKeylessProvider(providerName)) {
        reply.send({ success: false, error: 'API Key 未设置' });
        return;
      }

      const baseUrl = providerConfig.base_url;
      if (!baseUrl) {
        reply.send({ success: false, error: 'Base URL 未设置' });
        return;
      }
      const urlError = validateProviderBaseUrl(baseUrl, providerName);
      if (urlError) {
        reply.send({ success: false, error: urlError });
        return;
      }
      if (isPrivateUrl(baseUrl)) {
        reply.send({ success: false, error: 'SSRF: 禁止通过连接测试访问私有地址' });
        return;
      }

      try {
        const headers: Record<string, string> = {};
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const resp = await fetchWithProxy(`${baseUrl}/models`, {
          headers,
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          reply.send({ success: true, message: `${providerName.toUpperCase()} 连接成功` });
        } else if (resp.status === 401) {
          reply.send({ success: false, error: 'API Key 无效或已过期' });
        } else if (resp.status === 404) {
          reply.send({ success: true, message: '配置格式正确（无法验证实际调用）' });
        } else {
          reply.send({ success: false, error: `连接失败: HTTP ${resp.status}` });
        }
      } catch (e) {
        reply.send({ success: false, error: `连接测试失败: ${e instanceof Error ? e.message : String(e)}` });
      }
    } catch {
      reply.send({ success: false, error: '连接测试失败，请检查网络或配置' });
    }
  });
}
