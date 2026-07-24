import type { ToolDescriptor } from './types.js';
import { getExtensionsList } from '../../api/routes/extensions.js';

export const EXTENSION_TOOLS: ToolDescriptor[] = [
  {
    name: 'list_extensions',
    category: 'extensions',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'list_extensions',
        description: '列出当前可用与已安装的扩展（插件）',
        parameters: {
          type: 'object',
          properties: {
            installed_only: { type: 'boolean', description: '仅返回已启用的扩展' },
          },
          required: [],
        },
      },
    },
    runner: (params) => {
      const all = getExtensionsList();
      const installedOnly = params.installed_only === true;
      const filtered = installedOnly ? all.filter(e => e.isEnabled) : all;
      return {
        success: true,
        count: filtered.length,
        extensions: filtered,
      };
    },
  },
];

export const EXTENSIONS_PROMPT_HINT = `扩展相关：
- list_extensions：列出可用 / 已启用扩展`;
