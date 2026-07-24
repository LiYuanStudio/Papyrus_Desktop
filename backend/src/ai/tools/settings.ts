import { aiConfig } from '../config-instance.js';
import type { ToolDescriptor } from './types.js';
import { safeFloat, safeInt } from './types.js';

export const ALLOWED_SETTING_PATHS = new Set<string>([
  'features.agent_enabled',
  'parameters.temperature',
  'parameters.top_p',
  'parameters.max_tokens',
  'parameters.presence_penalty',
  'parameters.frequency_penalty',
  'current_model',
]);

interface MaskedSubset {
  current_provider: string;
  current_model: string;
  parameters: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    presence_penalty: number;
    frequency_penalty: number;
  };
  features: {
    agent_enabled: boolean;
  };
}

function getSettingsSubset(): MaskedSubset {
  const masked = aiConfig.getMaskedConfig();
  return {
    current_provider: masked.current_provider,
    current_model: masked.current_model,
    parameters: {
      temperature: masked.parameters.temperature,
      top_p: masked.parameters.top_p,
      max_tokens: masked.parameters.max_tokens,
      presence_penalty: masked.parameters.presence_penalty,
      frequency_penalty: masked.parameters.frequency_penalty,
    },
    features: {
      agent_enabled: masked.features.agent_enabled,
    },
  };
}

interface ApplyResult {
  applied: string[];
  ignored: string[];
  errors: string[];
}

function flattenInput(input: Record<string, unknown>, prefix = ''): Array<{ path: string; value: unknown }> {
  const out: Array<{ path: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenInput(value as Record<string, unknown>, path));
    } else {
      out.push({ path, value });
    }
  }
  return out;
}

function applyAllowedSettings(input: Record<string, unknown>): ApplyResult {
  const applied: string[] = [];
  const ignored: string[] = [];
  const errors: string[] = [];

  const flat = flattenInput(input);
  for (const { path, value } of flat) {
    if (!ALLOWED_SETTING_PATHS.has(path)) {
      ignored.push(path);
      continue;
    }
    if (path === 'features.agent_enabled') {
      aiConfig.config.features.agent_enabled = Boolean(value);
      applied.push(path);
    } else if (path === 'parameters.temperature') {
      const v = safeFloat(value, aiConfig.config.parameters.temperature);
      if (v < 0 || v > 2) { errors.push(`${path} 必须在 [0, 2] 之间`); continue; }
      aiConfig.config.parameters.temperature = v;
      applied.push(path);
    } else if (path === 'parameters.top_p') {
      const v = safeFloat(value, aiConfig.config.parameters.top_p);
      if (v < 0 || v > 1) { errors.push(`${path} 必须在 [0, 1] 之间`); continue; }
      aiConfig.config.parameters.top_p = v;
      applied.push(path);
    } else if (path === 'parameters.max_tokens') {
      const v = safeInt(value, aiConfig.config.parameters.max_tokens);
      if (v < 1 || v > 32000) { errors.push(`${path} 必须在 [1, 32000] 之间`); continue; }
      aiConfig.config.parameters.max_tokens = v;
      applied.push(path);
    } else if (path === 'parameters.presence_penalty') {
      const v = safeFloat(value, aiConfig.config.parameters.presence_penalty);
      if (v < -2 || v > 2) { errors.push(`${path} 必须在 [-2, 2] 之间`); continue; }
      aiConfig.config.parameters.presence_penalty = v;
      applied.push(path);
    } else if (path === 'parameters.frequency_penalty') {
      const v = safeFloat(value, aiConfig.config.parameters.frequency_penalty);
      if (v < -2 || v > 2) { errors.push(`${path} 必须在 [-2, 2] 之间`); continue; }
      aiConfig.config.parameters.frequency_penalty = v;
      applied.push(path);
    } else if (path === 'current_model') {
      if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push(`${path} 必须是非空字符串`);
        continue;
      }
      const trimmed = value.trim();
      if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\x00')) {
        errors.push(`${path} 包含非法字符`);
        continue;
      }
      aiConfig.config.current_model = trimmed;
      applied.push(path);
    }
  }

  return { applied, ignored, errors };
}

export const SETTINGS_TOOLS: ToolDescriptor[] = [
  {
    name: 'get_settings',
    category: 'settings',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'get_settings',
        description: '读取允许的 AI 设置子集（不含 API Key 等敏感字段）',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    runner: () => {
      return { success: true, settings: getSettingsSubset() };
    },
  },
  {
    name: 'update_settings',
    category: 'settings',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'update_settings',
        description: '更新允许的 AI 设置（仅 features.agent_enabled、parameters.* 与 current_model）。其他字段会被忽略并以 ignored_keys 返回',
        parameters: {
          type: 'object',
          properties: {
            updates: { type: 'object', description: '欲更新的设置（按 ai_config 嵌套结构）' },
          },
          required: ['updates'],
        },
      },
    },
    runner: (params) => {
      const updatesRaw = params.updates;
      if (updatesRaw === null || typeof updatesRaw !== 'object' || Array.isArray(updatesRaw)) {
        return { success: false, error: 'updates 必须是对象' };
      }
      const updates = updatesRaw as Record<string, unknown>;
      const { applied, ignored, errors } = applyAllowedSettings(updates);
      if (errors.length > 0) {
        return { success: false, error: errors.join('; '), applied_keys: applied, ignored_keys: ignored };
      }
      if (applied.length > 0) {
        aiConfig.saveConfig();
      }
      return {
        success: true,
        message: applied.length > 0 ? '设置已更新' : '没有可更新的字段',
        applied_keys: applied,
        ignored_keys: ignored,
      };
    },
  },
];

export const SETTINGS_PROMPT_HINT = `设置相关：
- get_settings：读取允许的 AI 设置子集
- update_settings：更新允许的 AI 设置（agent_enabled、temperature 等；providers/api_key 不可改）`;
