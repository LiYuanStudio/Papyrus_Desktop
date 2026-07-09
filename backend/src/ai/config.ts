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
      const dbTranslationProvider = readUiSetting('ai.translation_provider');
      const dbTranslationModel = readUiSetting('ai.translation_model');
      const dbParameters = readUiSetting('ai.parameters');
      const dbFeatures = readUiSetting('ai.features');
      const dbLog = readUiSetting('ai.log');

      if (
        !dbCurrentProvider &&
        !dbCurrentModel &&
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
   * 解析翻译请求应使用的供应商与模型。
   * 优先使用 translation_*；未配置时回退到聊天默认，避免破坏旧数据与未设置场景。
   * 未强制要求 translation_* 必填：与「可选专用模型」产品设计一致。
   */
  resolveTranslationTarget(): { provider: string; model: string } {
    const provider = this.config.translation_provider || this.config.current_provider;
    const model = this.config.translation_model || this.config.current_model;
    return { provider, model };
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
