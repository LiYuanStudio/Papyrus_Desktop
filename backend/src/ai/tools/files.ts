import fs from 'node:fs';
import { listFiles, getFileById, isSafeFileStoragePath } from '../../core/files.js';
import type { ToolDescriptor } from './types.js';
import { requireId, isErr } from './types.js';

const MAX_FILE_SIZE = 1024 * 1024;
const PREVIEW_BYTES = 8 * 1024;

const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_EXACT = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
]);

function isTextMime(mime: string): boolean {
  if (!mime) return false;
  if (TEXT_MIME_EXACT.has(mime)) return true;
  return TEXT_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
}

export const FILE_TOOLS: ToolDescriptor[] = [
  {
    name: 'list_files',
    category: 'files',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'list_files',
        description: '列出文件库中的文件与文件夹（仅元数据，不返回文件内容）',
        parameters: {
          type: 'object',
          properties: {
            parent_id: { type: 'string', description: '父文件夹 ID（可选；不传则返回所有）' },
          },
          required: [],
        },
      },
    },
    runner: (params, ctx) => {
      const all = listFiles(ctx.logger ?? undefined);
      const parentRaw = params.parent_id;
      let filtered = all;
      if (typeof parentRaw === 'string' && parentRaw.length > 0) {
        if (!/^[a-zA-Z0-9_-]+$/.test(parentRaw)) return { success: false, error: 'parent_id 含非法字符' };
        filtered = all.filter(f => f.parent_id === parentRaw);
      }
      const records = filtered.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        mime_type: f.mime_type,
        parent_id: f.parent_id,
        is_folder: !!f.is_folder,
      }));
      return { success: true, count: records.length, files: records };
    },
  },
  {
    name: 'read_file',
    category: 'files',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'read_file',
        description: '读取文件库中的一个文本文件的内容（>1MB 仅返回前 8KB 预览，二进制文件拒绝）',
        parameters: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: '文件 ID' },
          },
          required: ['file_id'],
        },
      },
    },
    runner: (params) => {
      const fileId = requireId(params, 'file_id');
      if (isErr(fileId)) return { success: false, error: fileId.error };
      const file = getFileById(fileId);
      if (!file) return { success: false, error: '文件不存在' };
      if (file.is_folder) return { success: false, error: '不能读取文件夹的内容' };
      if (!file.file_storage_path || !fs.existsSync(file.file_storage_path)) {
        return { success: false, error: '文件存储路径不存在' };
      }
      if (!isSafeFileStoragePath(file.file_storage_path)) {
        return { success: false, error: '文件路径不在允许的存储目录内' };
      }
      if (!isTextMime(file.mime_type)) {
        return { success: false, error: '仅支持文本文件预览', mime_type: file.mime_type };
      }
      const stat = fs.statSync(file.file_storage_path);
      const isTruncated = stat.size > MAX_FILE_SIZE;
      const fd = fs.openSync(file.file_storage_path, 'r');
      try {
        const readLength = isTruncated ? PREVIEW_BYTES : Math.min(stat.size, MAX_FILE_SIZE);
        const buf = Buffer.alloc(readLength);
        fs.readSync(fd, buf, 0, readLength, 0);
        return {
          success: true,
          file: { id: file.id, name: file.name, mime_type: file.mime_type, size: stat.size },
          truncated: isTruncated,
          preview_bytes: readLength,
          content: buf.toString('utf8'),
        };
      } finally {
        fs.closeSync(fd);
      }
    },
  },
];

export const FILES_PROMPT_HINT = `文件相关：
- list_files：列出文件库中的文件
- read_file：读取文件内容（仅文本，>1MB 截断为前 8KB）`;
