import { getCardCount, getNoteCount, loadAllFiles } from '../../db/database.js';
import type { ToolDescriptor } from './types.js';

export const DATA_TOOLS: ToolDescriptor[] = [
  {
    name: 'read_data_stats',
    category: 'data',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'read_data_stats',
        description: '读取整体数据统计：卡片数、笔记数、文件数',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    runner: (_params, ctx) => {
      const cardCount = getCardCount();
      const noteCount = getNoteCount();
      const files = loadAllFiles(ctx.logger ?? undefined);
      const fileCount = files.filter(f => !f.is_folder).length;
      const folderCount = files.filter(f => f.is_folder).length;
      return {
        success: true,
        stats: {
          card_count: cardCount,
          note_count: noteCount,
          file_count: fileCount,
          folder_count: folderCount,
        },
      };
    },
  },
];

export const DATA_PROMPT_HINT = `数据相关：
- read_data_stats：读取卡片/笔记/文件数量统计`;
