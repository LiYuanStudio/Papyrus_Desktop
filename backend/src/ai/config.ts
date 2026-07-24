import path from 'node:path';
import { paths } from '../utils/paths.js';
import { encryptApiKey, decryptApiKey } from '../core/crypto.js';
import { isPrivateNetworkUrl } from '../utils/security.js';
import { readUiSetting, writeUiSetting } from '../db/database.js';
import { getProviderConfigFromDB } from './db-sync.js';

export interface ProviderConfig {
  api_key: string;
  base_url: string;
  models: string[];
}

export interface ParametersConfig {
  temperature: number;
  top_p: number;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
}

export interface FeaturesConfig {
  auto_hint: boolean;
  auto_explain: boolean;
  context_length: number;
  agent_enabled: boolean;
  cache_enabled: boolean;
}

export interface LogConfig {
  log_dir: string;
  log_level: string;
  max_log_files: number;
  log_rotation: boolean;
}

export interface AIConfigData {
  providers: Record<string, ProviderConfig>;
  current_provider: string;
  current_model: string;
  /**
   * 对话标题生成专用供应商 type。
   * 原因：轻量标题任务可使用更快、更便宜的独立模型。
   * 未单独配置时不做字段级混搭，而是整组回退聊天默认目标。
   */
  title_provider: string;
  /**
   * 对话标题生成专用模型 API ID。
   * 原因：模型 ID 只在所属供应商内有意义，必须与 title_provider 成对保存。
   * 未复用翻译模型：翻译与摘要命名对输出能力和成本的偏好不同。
   */
  title_model: string;
  /**
   * 翻译专用供应商 type（如 openai / deepseek）。
   * 为空时回退到 current_provider，保证未配置翻译模型时行为与旧版一致。
   * 未与 current_provider 合并：翻译可选用与聊天不同的供应商与密钥。
   */
  translation_provider: string;
  /**
   * 翻译专用模型 API ID。
   * 为空时回退到 current_model。
   * 未复用 completion 独立配置：翻译需要显式模型选择，与聊天默认模型同属 AIConfig。
   */
  translation_model: string;
  parameters: ParametersConfig;
  features: FeaturesConfig;
  log: LogConfig;
}

function toStr(value: unknown, defaultValue = ''): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

function toInt(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

/**
 * 检测 URL 是否指向私有/内网地址。
 * 保留用于外部调用（provider.ts、ai-completion.ts、ai-config.ts）。
 */
export function isPrivateUrl(urlStr: string): boolean {
  return isPrivateNetworkUrl(urlStr);
}

export class AIConfig {
  configFile: string;
  config: AIConfigData;

  constructor(dataDir: string = paths.dataDir) {
    this.configFile = path.join(dataDir, 'ai_config.json');
    this.config = this.buildDefaultConfig();
    this.loadConfig();
  }

  private buildDefaultConfig(): AIConfigData {
    const defaultLogDir = path.join(paths.dataDir, 'logs');
    return {
      providers: {},
      current_provider: '',
      current_model: '',
      title_provider: '',
      title_model: '',
      translation_provider: '',
      translation_model: '',
      parameters: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 2000,
        presence_penalty: 0.0,
        frequency_penalty: 0.0,
      },
      features: {
        auto_hint: false,
        auto_explain: false,
        context_length: 10,
        agent_enabled: false,
        cache_enabled: false,
      },
      log: {
        log_dir: defaultLogDir,
        log_level: 'DEBUG',
        max_log_files: 10,
        log_rotation: false,
      },
    };
  }

  private normalizeLogConfig(raw: unknown, fallback: LogConfig): LogConfig {
    if (raw === null || typeof raw !== 'object') return { ...fallback };
    const dict = raw as Record<string, unknown>;
    return {
      log_dir: dict.log_dir !== undefined ? toStr(dict.log_dir, fallback.log_dir) : fallback.log_dir,
      log_level: dict.log_level !== undefined ? toStr(dict.log_level, fallback.log_level) : fallback.log_level,
      max_log_files: toInt(dict.max_log_files ?? fallback.max_log_files, fallback.max_log_files),
      log_rotation: Boolean(dict.log_rotation ?? fallback.log_rotation),
    };
  }

  loadConfig(): void {
    const defaultConfig = this.buildDefaultConfig();

    try {
      const dbCurrentProvider = readUiSetting('ai.current_provider');
      const dbCurrentModel = readUiSetting('ai.current_model');
      const dbTitleProvider = readUiSetting('ai.title_provider');
      const dbTitleModel = readUiSetting('ai.title_model');
      const dbTranslationProvider = readUiSetting('ai.translation_provider');
      const dbTranslationModel = readUiSetting('ai.translation_model');
      const dbParameters = readUiSetting('ai.parameters');
      const dbFeatures = readUiSetting('ai.features');
      const dbLog = readUiSetting('ai.log');

      if (
        !dbCurrentProvider &&
        !dbCurrentModel &&
        !dbTitleProvider &&
        !dbTitleModel &&
        !dbTranslationProvider &&
        !dbTranslationModel &&
        !dbParameters &&
        !dbFeatures &&
        !dbLog
      ) {
        this.config = defaultConfig;
        return;
      }

      this.config = {
        providers: {},
        current_provider: dbCurrentProvider ?? defaultConfig.current_provider,
        current_model: dbCurrentModel ?? defaultConfig.current_model,
        title_provider: dbTitleProvider ?? defaultConfig.title_provider,
        title_model: dbTitleModel ?? defaultConfig.title_model,
        translation_provider: dbTranslationProvider ?? defaultConfig.translation_provider,
        translation_model: dbTranslationModel ?? defaultConfig.translation_model,
        parameters: dbParameters
          ? { ...defaultConfig.parameters, ...JSON.parse(dbParameters) }
          : defaultConfig.parameters,
        features: dbFeatures
          ? { ...defaultConfig.features, ...JSON.parse(dbFeatures) }
          : defaultConfig.features,
        log: dbLog
          ? this.normalizeLogConfig(JSON.parse(dbLog), defaultConfig.log)
          : defaultConfig.log,
      };
    } catch (e) {
      console.error('从数据库加载 AI 配置失败，使用默认配置:', e instanceof Error ? e.message : String(e));
      this.config = defaultConfig;
    }
  }

  saveConfig(): boolean {
    try {
      writeUiSetting('ai.current_provider', this.config.current_provider);
      writeUiSetting('ai.current_model', this.config.current_model);
      writeUiSetting('ai.title_provider', this.config.title_provider);
      writeUiSetting('ai.title_model', this.config.title_model);
      writeUiSetting('ai.translation_provider', this.config.translation_provider);
      writeUiSetting('ai.translation_model', this.config.translation_model);
      writeUiSetting('ai.parameters', JSON.stringify(this.config.parameters));
      writeUiSetting('ai.features', JSON.stringify(this.config.features));
      writeUiSetting('ai.log', JSON.stringify(this.config.log));
      return true;
    } catch (e) {
      console.error('保存 AI 配置到数据库失败:', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /**
   * 解析标题生成应使用的供应商与模型。
   * 原因：只有完整的 title_provider/title_model 配对才能保证模型属于正确供应商。
   * 未做字段级回退：供应商 A 与聊天模型 B 的组合可能请求不存在的模型。
   */
  resolveTitleTarget(): { provider: string; model: string } {
    const titleProvider = this.config.title_provider.trim();
    const titleModel = this.config.title_model.trim();
    if (titleProvider && titleModel) {
      return { provider: titleProvider, model: titleModel };
    }

    return {
      provider: this.config.current_provider,
      model: this.config.current_model,
    };
  }

  /**
   * 判断是否存在完整的标题专用模型配置。
   * 原因：设置页与调用层需要区分显式标题目标和聊天默认回退。
   * 未仅检查模型字段：缺少供应商时无法可靠解析密钥与 Base URL。
   */
  hasTitleTarget(): boolean {
    return (
      this.config.title_provider.trim().length > 0 &&
      this.config.title_model.trim().length > 0
    );
  }

  /**
   * 解析翻译请求应使用的供应商与模型。
   * 仅当 translation_provider 与 translation_model 成对配置时才使用专用翻译目标；
   * 否则整组回退到聊天默认（或请求侧 fallbackModel），避免「供应商 A + 模型 B」错配。
   * 未做字段级独立 fallback：半配置状态比回退到聊天默认更危险。
   *
   * @param fallbackModel 聊天面板当前选中模型 API ID；仅在未配置完整翻译目标时使用
   */
  resolveTranslationTarget(fallbackModel?: string): { provider: string; model: string } {
    const translationProvider = this.config.translation_provider.trim();
    const translationModel = this.config.translation_model.trim();
    if (translationProvider && translationModel) {
      return { provider: translationProvider, model: translationModel };
    }

    const fallback = (fallbackModel ?? '').trim();
    if (fallback) {
      return {
        provider: this.config.current_provider,
        model: fallback,
      };
    }

    return {
      provider: this.config.current_provider,
      model: this.config.current_model,
    };
  }

  /**
   * 是否已配置完整的翻译专用模型（provider + model 成对）。
   * 用于路由/前端判断是否应忽略聊天侧 fallback model。
   */
  hasTranslationTarget(): boolean {
    return (
      this.config.translation_provider.trim().length > 0 &&
      this.config.translation_model.trim().length > 0
    );
  }

  getMaskedConfig(): AIConfigData {
    const cfg: AIConfigData = JSON.parse(JSON.stringify(this.config));
    cfg.providers = {};
    return cfg;
  }

  getProviderConfig(): ProviderConfig {
    const providerName = this.config.current_provider;
    const dbConfig = getProviderConfigFromDB(providerName);
    if (!dbConfig) {
      throw new Error(`未知 provider: ${providerName}`);
    }
    return dbConfig;
  }

  getCurrentModel(): string {
    return this.config.current_model;
  }

  getParameters(): ParametersConfig {
    return this.config.parameters;
  }

  getLogConfig(): LogConfig {
    return this.config.log;
  }

  setLogConfig(config: LogConfig): void {
    this.config.log = this.normalizeLogConfig(config, this.buildDefaultConfig().log);
    this.saveConfig();
  }
}
