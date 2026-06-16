import fs from 'node:fs';
import { AIConfig } from './config.js';
import { paths } from '../utils/paths.js';
import { migrateJsonProvidersToDb, loadAIConfigFromDb, loadAIConfigFromJson } from './db-sync.js';
import { loadAllProviders, readUiSetting } from '../db/database.js';

export let aiConfig = new AIConfig(paths.dataDir);

export function resetAIConfig(dataDir?: string): void {
  aiConfig = new AIConfig(dataDir ?? paths.dataDir);
}

/**
 * 初始化 AI 配置。
 * - 若 DB providers 为空且 ai_config.json 存在：一次性迁移 JSON→DB，验证后删除 JSON
 * - 之后始终从 DB 加载配置
 */
export function initAIConfig(): void {
  try {
    const dbProviders = loadAllProviders();

    if (dbProviders.length === 0 && fs.existsSync(aiConfig.configFile)) {
      console.log('[initAIConfig] 检测到 ai_config.json，开始一次性迁移...');

      // 0. 将 ai_config.json 加载到内存，后续迁移依赖其中的 providers 与非 provider 配置
      const jsonLoaded = loadAIConfigFromJson(aiConfig);
      if (!jsonLoaded) {
        console.error('[initAIConfig] 读取 ai_config.json 失败，保留 JSON 文件');
        return;
      }

      // 确保 current_provider 有效：若为空或指向 JSON 中不存在的 provider，则回退到第一个
      const jsonProviders = aiConfig.config.providers;
      const providerTypes = Object.keys(jsonProviders);
      if (providerTypes.length > 0) {
        const validCurrentProvider = jsonProviders[aiConfig.config.current_provider];
        if (!aiConfig.config.current_provider || !validCurrentProvider) {
          aiConfig.config.current_provider = providerTypes[0] ?? '';
        }
      }

      // 1. 迁移 providers
      const migratedTypes = migrateJsonProvidersToDb(aiConfig);

      // 2. 验证 provider 迁移完整性
      const jsonProviderCount = Object.keys(aiConfig.config.providers).length;
      if (migratedTypes.length < jsonProviderCount) {
        console.error(
          `[initAIConfig] 迁移不完整：JSON 有 ${jsonProviderCount} 个 provider，成功迁移 ${migratedTypes.length} 个，保留 JSON 文件`
        );
        // 不删除 JSON，让用户下次启动重试
      } else {
        // 若 current_model 为空，且当前 provider 在 JSON 中有模型，则默认选中第一个模型
        const currentProviderConfig = aiConfig.config.current_provider
          ? aiConfig.config.providers[aiConfig.config.current_provider]
          : undefined;
        if (!aiConfig.config.current_model && currentProviderConfig && currentProviderConfig.models.length > 0) {
          aiConfig.config.current_model = currentProviderConfig.models[0] ?? '';
        }

        // 3. 写入非 provider 配置到 DB
        const saved = aiConfig.saveConfig();

        // 4. 二次验证：读回确认落盘，并记录具体缺失项
        const verifyCurrentProvider = readUiSetting('ai.current_provider');
        const verifyCurrentModel = readUiSetting('ai.current_model');
        const verifyParameters = readUiSetting('ai.parameters');
        const verifyFeatures = readUiSetting('ai.features');
        const verifyLog = readUiSetting('ai.log');

        const missing: string[] = [];
        if (verifyCurrentProvider === undefined) missing.push('ai.current_provider');
        if (verifyCurrentModel === undefined) missing.push('ai.current_model');
        if (verifyParameters === undefined) missing.push('ai.parameters');
        if (verifyFeatures === undefined) missing.push('ai.features');
        if (verifyLog === undefined) missing.push('ai.log');

        if (saved && missing.length === 0) {
          // 5. 验证通过，删除 JSON
          fs.unlinkSync(aiConfig.configFile);
          console.log('[initAIConfig] 迁移完成，ai_config.json 已删除');
        } else {
          const reasons: string[] = [];
          if (!saved) reasons.push('saveConfig() 返回 false');
          if (missing.length > 0) reasons.push(`以下设置未落盘: ${missing.join(', ')}`);
          console.error(`[initAIConfig] 二次验证失败，保留 JSON 文件。原因: ${reasons.join('; ')}`);
        }
      }
    }

    // 从 DB 加载最新配置到内存
    loadAIConfigFromDb(aiConfig);
  } catch (e) {
    console.warn('初始化 AI 配置失败:', e instanceof Error ? e.message : String(e));
  }
}
