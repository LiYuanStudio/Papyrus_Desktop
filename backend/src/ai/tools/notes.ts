import {
  createNote,
  deleteNote,
  searchNotes,
  getNoteById,
} from '../../core/notes.js';
import { getNoteById as dbGetNote, updateNote as dbUpdateNote } from '../../db/database.js';
import { saveNoteVersion } from '../../core/versioning.js';
import type { ToolDescriptor } from './types.js';
import { requireString, optionalString, requireId, isErr } from './types.js';

export const NOTE_TOOLS: ToolDescriptor[] = [
  {
    name: 'create_note',
    category: 'notes',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'create_note',
        description: '创建一篇新笔记。可指定标题、内容、文件夹与标签',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题' },
            content: { type: 'string', description: '笔记正文（支持 Markdown）' },
            folder: { type: 'string', description: '所属文件夹，默认为「默认」' },
            tags: { type: 'array', description: '标签列表', items: { type: 'string' } },
          },
          required: ['title', 'content'],
        },
      },
    },
    runner: (params, ctx) => {
      const title = requireString(params, 'title', 200);
      if (isErr(title)) return { success: false, error: title.error };
      const content = requireString(params, 'content', 100000);
      if (isErr(content)) return { success: false, error: content.error };
      const folderRaw = optionalString(params, 'folder', 100);
      if (isErr(folderRaw)) return { success: false, error: folderRaw.error };
      const folder = folderRaw ?? '默认';
      const tagsRaw = params.tags;
      const tags = Array.isArray(tagsRaw) ? tagsRaw.map(t => String(t)).slice(0, 50) : [];

      const note = createNote(title, content, folder, tags, ctx.logger ?? undefined);
      return {
        success: true,
        message: '笔记已创建',
        note: { id: note.id, title: note.title, folder: note.folder, tags: note.tags, word_count: note.word_count },
      };
    },
  },
  {
    name: 'update_note',
    category: 'notes',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'update_note',
        description: '根据 ID 更新笔记的标题、内容、文件夹或标签。仅传需要修改的字段',
        parameters: {
          type: 'object',
          properties: {
            note_id: { type: 'string', description: '笔记 ID' },
            title: { type: 'string', description: '新标题（可选）' },
            content: { type: 'string', description: '新内容（可选）' },
            folder: { type: 'string', description: '新文件夹（可选）' },
            tags: { type: 'array', description: '新标签列表（可选）', items: { type: 'string' } },
          },
          required: ['note_id'],
        },
      },
    },
    runner: (params, ctx) => {
      const noteId = requireId(params, 'note_id');
      if (isErr(noteId)) return { success: false, error: noteId.error };
      const updates: { title?: string; content?: string; folder?: string; tags?: string[] } = {};
      const title = optionalString(params, 'title', 200);
      if (isErr(title)) return { success: false, error: title.error };
      if (title !== undefined) updates.title = title;
      const content = optionalString(params, 'content', 100000);
      if (isErr(content)) return { success: false, error: content.error };
      if (content !== undefined) updates.content = content;
      const folder = optionalString(params, 'folder', 100);
      if (isErr(folder)) return { success: false, error: folder.error };
      if (folder !== undefined) updates.folder = folder;
      if (Array.isArray(params.tags)) updates.tags = params.tags.map(t => String(t)).slice(0, 50);

      const note = dbGetNote(noteId);
      if (!note) return { success: false, error: '笔记不存在' };
      saveNoteVersion(note, ctx.logger ?? undefined);
      if (updates.title !== undefined) note.title = updates.title;
      if (updates.content !== undefined) note.content = updates.content;
      if (updates.folder !== undefined) note.folder = updates.folder;
      if (updates.tags !== undefined) note.tags = updates.tags;
      dbUpdateNote(note, ctx.logger ?? undefined);
      return {
        success: true,
        message: '笔记已更新',
        note: { id: note.id, title: note.title, folder: note.folder, tags: note.tags, word_count: note.word_count },
      };
    },
  },
  {
    name: 'delete_note',
    category: 'notes',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'delete_note',
        description: '根据 ID 删除一篇笔记（不可撤销）',
        parameters: {
          type: 'object',
          properties: {
            note_id: { type: 'string', description: '笔记 ID' },
          },
          required: ['note_id'],
        },
      },
    },
    runner: (params, ctx) => {
      const noteId = requireId(params, 'note_id');
      if (isErr(noteId)) return { success: false, error: noteId.error };
      const ok = deleteNote(noteId, ctx.logger ?? undefined);
      if (!ok) return { success: false, error: '笔记不存在或删除失败' };
      return { success: true, message: '笔记已删除', note_id: noteId };
    },
  },
  {
    name: 'search_notes',
    category: 'notes',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'search_notes',
        description: '在笔记标题、内容、标签中搜索关键词',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '查询关键词' },
            limit: { type: 'integer', description: '最多返回多少条，默认 20' },
          },
          required: ['query'],
        },
      },
    },
    runner: (params) => {
      const query = requireString(params, 'query', 500);
      if (isErr(query)) return { success: false, error: query.error };
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(1, Math.floor(params.limit)), 100) : 20;
      const notes = searchNotes(query).slice(0, limit);
      const results = notes.map(n => ({
        id: n.id,
        title: n.title,
        folder: n.folder,
        preview: n.preview,
        tags: n.tags,
        updated_at: n.updated_at,
      }));
      return { success: true, count: results.length, results };
    },
  },
  {
    name: 'get_note',
    category: 'notes',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'get_note',
        description: '根据 ID 读取一篇完整笔记的内容',
        parameters: {
          type: 'object',
          properties: {
            note_id: { type: 'string', description: '笔记 ID' },
          },
          required: ['note_id'],
        },
      },
    },
    runner: (params) => {
      const noteId = requireId(params, 'note_id');
      if (isErr(noteId)) return { success: false, error: noteId.error };
      const note = getNoteById(noteId);
      if (!note) return { success: false, error: '笔记不存在' };
      return { success: true, note };
    },
  },
];

export const NOTES_PROMPT_HINT = `笔记相关：
- create_note / update_note / delete_note：增删改笔记
- search_notes：按关键字搜索笔记
- get_note：根据 ID 读取笔记完整内容`;
