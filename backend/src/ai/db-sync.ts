import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { AIConfig, type AIConfigData } from './config.js';
import { loadAllProviders, saveProvider, saveApiKey, saveModel, readUiSetting } from '../db/database.js';

function isMaskedKey(key: string): boolean {
  return key.length > 0 && key.startsWith('*');
}

/**
 * 从 ai_config.json 一次性加载完整 AI 配置到 AIConfig 实例内存。
 * 用于迁移前填充 aiConfig.config，使 migrateJsonProvidersToDb 能读取 JSON 中的 providers。
 *
 * @returns 是否成功读取并解析 JSON 文件
 */
export function loadAIConfigFromJson(aiConfig: AIConfig): boolean {
  try {
    if (!fs.existsSync(aiConfig.configFile)) return false;
    const content = fs.readFileSync(aiConfig.configFile, 'utf8');
    const raw = JSON.parse(content) as Partial<AIConfigData>;

    if (raw.providers && typeof raw.providers === 'object' && !Array.isArray(raw.providers)) {
      aiConfig.config.providers = { ...aiConfig.config.providers, ...raw.providers };
    }
    if (typeof raw.current_provider === 'string') {
      aiConfig.config.current_provider = raw.current_provider;
    }
    if (typeof raw.current_model === 'string') {
      aiConfig.config.current_model = raw.current_model;
    }
    if (typeof raw.translation_provider === 'string') {
      aiConfig.config.translation_provider = raw.translation_provider;
    }
    if (typeof raw.translation_model === 'string') {
      aiConfig.config.translation_model = raw.translation_model;
    }
    if (raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters)) {
      aiConfig.config.parameters = { ...aiConfig.config.parameters, ...raw.parameters };
    }
    if (raw.features && typeof raw.features === 'object' && !Array.isArray(raw.features)) {
      aiConfig.config.features = { ...aiConfig.config.features, ...raw.features };
    }
    if (raw.log && typeof raw.log === 'object' && !Array.isArray(raw.log)) {
      aiConfig.config.log = { ...aiConfig.config.log, ...raw.log };
    }
    return true;
  } catch (e) {
    console.warn('[loadAIConfigFromJson] 读取 ai_config.json 失败:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * 一次性迁移：将 ai_config.json 中的 provider 配置同步到数据库。
 * 仅在首次启动、DB providers 表为空且 JSON 存在时调用。
 * 调用方负责迁移前后的验证和 JSON 删除。
 */
export function migrateJsonProvidersToDb(aiConfig: AIConfig): string[] {
  try {
    const dbProviders = loadAllProviders();
    const migrated: string[] = [];
    for (const [providerType, providerConfig] of Object.entries(aiConfig.config.providers)) {
      const sameType = dbProviders.filter((p) => p.type === providerType);
      if (sameType.length > 1) {
        console.warn(`[migrateJsonProvidersToDb] 发现 ${sameType.length} 个同名 provider type "${providerType}"，使用第一个`);
      }
      const existing = sameType[0];
      const providerId = existing?.id ?? `p-${providerType}-${randomUUID()}`;

      try {
        saveProvider({
          id: providerId,
          type: providerType,
          name: existing?.name ?? providerType,
          baseUrl: providerConfig.base_url,
          enabled: true,
          isDefault: aiConfig.config.current_provider === providerType,
        });

        const existingKey = existing?.apiKeys[0];
        if (!isMaskedKey(providerConfig.api_key)) {
          saveApiKey(providerId, {
            id: existingKey?.id ?? `${providerId}-key`,
            name: 'default',
            key: providerConfig.api_key,
          });
        }

        for (const modelId of providerConfig.models) {
          if (modelId) {
            saveModel(providerId, {
              id: `${providerId}-${modelId}`,
              modelId,
              name: modelId,
              enabled: true,
            });
          }
        }
      } catch (innerErr) {
        console.warn(`[migrateJsonProvidersToDb] 同步 provider "${providerType}" 失败:`, innerErr instanceof Error ? innerErr.message : String(innerErr));
        continue;
      }
      migrated.push(providerType);
    }
    return migrated;
  } catch (e) {
    console.warn('迁移 AI 配置到数据库失败:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * 从数据库加载完整 AI 配置到 AIConfig 实例内存。
 * - 读取 current_provider / current_model / translation_* / parameters / features / log 从 ui_settings 表
 * - 同步 isDefault provider 到 current_provider / current_model
 * - 从此不再涉及 ai_config.json
 *
 * @param forceSyncDefault 强制用 DB 的 isDefault provider 覆盖当前值
 */
export function loadAIConfigFromDb(aiConfig: AIConfig, forceSyncDefault: boolean = false): void {
  try {
    // 从 ui_settings 加载非 provider 配置
    const dbCurrentProvider = readUiSetting('ai.current_provider');
    const dbCurrentModel = readUiSetting('ai.current_model');
    const dbTranslationProvider = readUiSetting('ai.translation_provider');
    const dbTranslationModel = readUiSetting('ai.translation_model');
    const dbParameters = readUiSetting('ai.parameters');
    const dbFeatures = readUiSetting('ai.features');
    const dbLog = readUiSetting('ai.log');

    if (dbCurrentProvider) aiConfig.config.current_provider = dbCurrentProvider;
    if (dbCurrentModel) aiConfig.config.current_model = dbCurrentModel;
    // 允许空字符串：用户可清空翻译专用配置以回退到聊天默认模型
    if (dbTranslationProvider !== undefined) aiConfig.config.translation_provider = dbTranslationProvider;
    if (dbTranslationModel !== undefined) aiConfig.config.translation_model = dbTranslationModel;
    if (dbParameters) {
      try {
        const parsed = JSON.parse(dbParameters);
        aiConfig.config.parameters = { ...aiConfig.config.parameters, ...parsed };
      } catch { /* ignore corrupt JSON */ }
    }
    if (dbFeatures) {
      try {
        const parsed = JSON.parse(dbFeatures);
        aiConfig.config.features = { ...aiConfig.config.features, ...parsed };
      } catch { /* ignore corrupt JSON */ }
    }
    if (dbLog) {
      try {
        const parsed = JSON.parse(dbLog);
        aiConfig.config.log = { ...aiConfig.config.log, ...parsed };
      } catch { /* ignore corrupt JSON */ }
    }

    // 从 providers 表同步 default provider 选择
    const dbProviders = loadAllProviders();
    if (dbProviders.length === 0) return;

    const currentProviderType = aiConfig.config.current_provider;
    const currentProviderValid = dbProviders.some(
      (p) => p.type === currentProviderType && p.enabled
    );

    if (!currentProviderValid || forceSyncDefault) {
      const defaultProvider = dbProviders.find((p) => p.isDefault);
      if (defaultProvider && defaultProvider.type) {
        aiConfig.config.current_provider = defaultProvider.type;
        const enabledModels = defaultProvider.models
          .filter((m) => m.enabled)
          .map((m) => m.modelId);
        const currentModel = aiConfig.config.current_model;
        if (enabledModels.length > 0 && !enabledModels.includes(currentModel)) {
          aiConfig.config.current_model = enabledModels[0] ?? currentModel;
        }
      }
    }
  } catch (e) {
    console.warn('从数据库加载 AI 配置失败:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * 从数据库获取指定 provider 的配置。
 * 用于 AI 聊天/补全路由，替代旧的 aiConfig.getProviderConfig()。
 */
export function getProviderConfigFromDB(providerType: string): {
  api_key: string;
  base_url: string;
  models: string[];
} | null {
  try {
    const dbProviders = loadAllProviders();
    const dbProvider = dbProviders.find((p) => p.type === providerType);
    if (!dbProvider) return null;
    const firstKey = dbProvider.apiKeys.find((k) => k.key.trim() !== '');
    return {
      api_key: firstKey?.key ?? '',
      base_url: dbProvider.baseUrl ?? '',
      models: dbProvider.models
        .filter((m) => m.enabled)
        .map((m) => m.modelId)
        .filter((m) => m.length > 0),
    };
  } catch (e) {
    console.warn('从数据库获取 provider 配置失败:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * 从数据库获取指定 provider 的第一个非空 API key。
 * 用于 /chat 和 /completion 的临时 fallback。
 */
export function getProviderApiKeyFromDB(providerType: string): string | null {
  try {
    const dbProviders = loadAllProviders();
    const dbProvider = dbProviders.find((p) => p.type === providerType);
    if (!dbProvider) return null;
    const firstKey = dbProvider.apiKeys.find((k) => k.key.trim() !== '');
    return firstKey?.key ?? null;
  } catch (e) {
    console.warn('从数据库获取 API key 失败:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
