import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadAllFiles,
  insertFile,
  getFileById,
  getFilesByParentId,
  deleteFileById,
} from '../db/database.js';
import { paths } from '../utils/paths.js';
import { assertPathInsideDirectory, isPathInsideDirectory } from '../utils/security.js';

import type { FileRecord } from './types.js';
import type { PapyrusLogger } from '../utils/logger.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function sanitizeFilename(name: string): string {
  const withoutTraversal = name.replace(/\.\./g, '_');
  return withoutTraversal.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200);
}

function assertFileStoragePath(filePath: string): string {
  return assertPathInsideDirectory(filePath, paths.vaultDir, '文件存储路径不在应用文件库目录内');
}

export function isSafeFileStoragePath(filePath: string): boolean {
  return isPathInsideDirectory(filePath, paths.vaultDir);
}

export function listFiles(logger?: PapyrusLogger): FileRecord[] {
  const files = loadAllFiles(logger);

  // Count children for folders (itemCount)
  const childCounts = new Map<string, number>();
  for (const f of files) {
    if (f.parent_id) {
      childCounts.set(f.parent_id, (childCounts.get(f.parent_id) ?? 0) + 1);
    }
  }

  return files.map(f => ({
    ...f,
    itemCount: f.is_folder ? (childCounts.get(f.id) ?? 0) : undefined,
  }));
}

export function createFolder(
  name: string,
  parentId?: string,
  logger?: PapyrusLogger,
): FileRecord & { itemCount: number } {
  const now = Date.now() / 1000;
  const record: FileRecord = {
    id: uuidv4().replace(/-/g, ''),
    name: name.trim(),
    type: 'folder',
    size: 0,
    mime_type: '',
    parent_id: parentId ?? null,
    file_storage_path: null,
    is_folder: 1,
    created_at: now,
    updated_at: now,
  };

  insertFile(record, logger);
  logger?.info(`创建文件夹: ${record.id} -> ${name}`);
  return { ...record, itemCount: 0 };
}

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

function validateFileContent(buffer: Buffer, ext: string): boolean {
  if (ext === 'svg') {
    const text = buffer.toString('utf8', 0, Math.min(buffer.length, 4096)).toLowerCase();
    if (text.includes('<script') || text.includes('onload=') || text.includes('javascript:')) return false;
  }
  if (buffer.length < 8) return true;
  const signatures: Record<string, Array<{ offset: number; bytes: number[] }>> = {
    png: [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }],
    jpg: [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
    jpeg: [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
    gif: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
    pdf: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
    zip: [{ offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }],
    docx: [{ offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }],
    xlsx: [{ offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }],
    '7z': [{ offset: 0, bytes: [0x37, 0x7A, 0xBC, 0xAF] }],
    mp4: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
    webp: [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }],
  };
  const sigList = signatures[ext];
  if (!sigList) return true;
  return sigList.some(sig => sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte));
}

function inferType(ext: string): string {
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'md', 'json'].includes(ext)) return 'document';
  return 'unknown';
}

export function saveFile(
  name: string,
  base64Content: string,
  mimeType?: string,
  parentId?: string,
  logger?: PapyrusLogger,
): FileRecord {
  const now = Date.now() / 1000;
  const id = uuidv4().replace(/-/g, '');
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const safeName = sanitizeFilename(name);
  const storageName = `${id}_${safeName}`;

  // Ensure vault directory exists
  const vaultDir = paths.vaultDir;
  fs.mkdirSync(vaultDir, { recursive: true });

  const mime = mimeType || getMimeType(ext);
  const fileType = inferType(ext);

  const record: FileRecord = {
    id,
    name: name.trim(),
    type: fileType,
    size: 0,
    mime_type: mime,
    parent_id: parentId ?? null,
    file_storage_path: null,
    is_folder: 0,
    created_at: now,
    updated_at: now,
  };

    try {
      // Decode and write file content first
      const buffer = Buffer.from(base64Content, 'base64');
      if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
      }
      if (!validateFileContent(buffer, ext)) {
        throw new Error(`文件内容与实际扩展名 ${ext} 不匹配，可能为伪造文件`);
      }
    const storagePath = path.join(vaultDir, storageName);
    fs.writeFileSync(storagePath, buffer);

    // Then write database record with complete data
    record.file_storage_path = storagePath;
    record.size = buffer.length;
    insertFile(record, logger);

    logger?.info(`保存文件: ${record.id} -> ${name} (${buffer.length} bytes)`);
    return record;
  } catch (err) {
    // 磁盘写入失败，删除数据库记录避免孤儿文件
    try {
      deleteFileById(id, logger);
    } catch (cleanupErr) {
      logger?.error(`清理失败的数据库记录时出错: ${id} - ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`);
    }
    throw err;
  }
}

export function deleteFileItem(
  fileId: string,
  logger?: PapyrusLogger,
): { deleted: number } {
  const file = getFileById(fileId);
  if (!file) return { deleted: 0 };

  let count = 0;

  // If folder, recursively delete children first
  if (file.is_folder) {
    const children = getFilesByParentId(fileId);
    for (const child of children) {
      const result = deleteFileItem(child.id, logger);
      count += result.deleted;
    }
  }

  // Delete the file from disk if it has a storage path
  if (file.file_storage_path && fs.existsSync(file.file_storage_path)) {
    const safeStoragePath = assertFileStoragePath(file.file_storage_path);
    fs.unlinkSync(safeStoragePath);
    logger?.info(`删除磁盘文件: ${safeStoragePath}`);
  }

  deleteFileById(fileId, logger);
  count += 1;
  return { deleted: count };
}

export function getFileStream(fileId: string): { stream: fs.ReadStream; file: FileRecord } | null {
  const file = getFileById(fileId);
  if (!file || !file.file_storage_path || !fs.existsSync(file.file_storage_path)) {
    return null;
  }
  const safeStoragePath = assertFileStoragePath(file.file_storage_path);
  return {
    stream: fs.createReadStream(safeStoragePath),
    file,
  };
}

export { getFileById };
