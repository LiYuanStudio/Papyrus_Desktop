import { v4 as uuidv4 } from 'uuid';
import matter from 'gray-matter';
import fs from 'node:fs';
import path from 'node:path';
import { Mutex } from 'async-mutex';
import {
  loadAllNotes,
  insertNote,
  deleteNoteById,
  deleteNotesByIds,
  getNoteById as dbGetNoteById,
  updateNote as dbUpdateNote,
  getNotesByFolder,
  getNoteCount,
  getAllFolders,
} from '../db/database.js';
import { saveNoteVersion } from './versioning.js';
import { recordNoteCreated } from './progress.js';

import type { Note } from './types.js';
import type { PapyrusLogger } from '../utils/logger.js';

const noteMutex = new Mutex();

export function getNoteById(noteId: string): Note | null {
  return dbGetNoteById(noteId);
}

function extractHeadings(content: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match && headings.length < 10) {
      headings.push({ level: match[1]!.length, text: match[2]!.trim() });
    }
  }
  return headings;
}

function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]?.trim() ?? '');
  }
  return [...new Set(links)];
}

export function computeWordCount(content: string): number {
  const chineseChars = (content.match(/[一-鿿]/g) ?? []).length;
  const englishWords = (content.match(/[a-zA-Z]+/g) ?? []).length;
  return chineseChars + englishWords;
}

export function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

function generatePreview(content: string, maxLength = 100): string {
  const text = content.replace(/[#*\-_`\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

export function getAllNotes(logger?: PapyrusLogger): Note[] {
  return loadAllNotes(logger);
}

export function createNote(
  title: string,
  content: string,
  folder = '默认',
  tags: string[] = [],
  logger?: PapyrusLogger,
): Note {
  const now = Date.now() / 1000;
  const headings = extractHeadings(content);
  const outgoingLinks = extractWikiLinks(content);

  const note: Note = {
    id: uuidv4().replace(/-/g, ''),
    title: title.trim(),
    folder: folder.trim() || '默认',
    content,
    preview: generatePreview(content),
    tags: tags.map(t => t.trim()).filter(Boolean),
    created_at: now,
    updated_at: now,
    word_count: computeWordCount(content),
    hash: computeHash(content),
    headings,
    outgoing_links: outgoingLinks,
    incoming_count: 0,
  };

  insertNote(note, logger);
  recordNoteCreated();
  logger?.info(`创建笔记: ${note.id}`);
  return note;
}

export async function updateNote(
  noteId: string,
  updates: Partial<Pick<Note, 'title' | 'content' | 'folder' | 'tags'>>,
  logger?: PapyrusLogger,
): Promise<Note | null> {
  return noteMutex.runExclusive(() => {
    const note = getNoteById(noteId);
    if (!note) return null;

    saveNoteVersion(note, logger);

    if (updates.title !== undefined) note.title = updates.title.trim();
    if (updates.content !== undefined) {
      note.content = updates.content;
      note.preview = generatePreview(updates.content);
      note.word_count = computeWordCount(updates.content);
      note.hash = computeHash(updates.content);
      note.headings = extractHeadings(updates.content);
      note.outgoing_links = extractWikiLinks(updates.content);
    }
    if (updates.folder !== undefined) note.folder = updates.folder.trim() || '默认';
    if (updates.tags !== undefined) note.tags = updates.tags.map(t => t.trim()).filter(Boolean);

    note.updated_at = Date.now() / 1000;

    dbUpdateNote(note, logger);
    logger?.info(`更新笔记: ${noteId}`);
    return note;
  });
}

export function deleteNote(noteId: string, logger?: PapyrusLogger): boolean {
  return deleteNoteById(noteId, logger);
}

export function deleteNotes(noteIds: string[], logger?: PapyrusLogger): number {
  return deleteNotesByIds(noteIds, logger);
}

export function searchNotes(query: string): Note[] {
  const notes = loadAllNotes();
  const lowerQuery = query.toLowerCase();
  return notes.filter(
    n =>
      n.title.toLowerCase().includes(lowerQuery) ||
      n.content.toLowerCase().includes(lowerQuery) ||
      n.tags.some(t => t.toLowerCase().includes(lowerQuery)),
  );
}

export function getNotesInFolder(folder: string): Note[] {
  return getNotesByFolder(folder);
}

export function getFolders(): string[] {
  return getAllFolders();
}

export function getStats(): { total: number } {
  return { total: getNoteCount() };
}

export function importObsidianVault(
  vaultPath: string,
  excludeFolders: string[] = ['.obsidian', '.git'],
  logger?: PapyrusLogger,
): { imported: number; errors: number; error?: string } {
  let imported = 0;
  let errors = 0;

  if (!fs.existsSync(vaultPath)) {
    return { imported: 0, errors: 0, error: `路径不存在: ${vaultPath}` };
  }

  const stat = fs.statSync(vaultPath);
  if (!stat.isDirectory()) {
    return { imported: 0, errors: 0, error: `路径不是目录: ${vaultPath}` };
  }

  // Build set of existing note titles for deduplication
  const existingTitles = new Set(
    loadAllNotes().map(n => n.title.toLowerCase()),
  );

  const excludeSet = new Set(excludeFolders.map(f => f.toLowerCase()));

  function scanDir(dir: string, relPath = ''): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const entryRelPath = path.join(relPath, entry.name);
      if (entry.isDirectory()) {
        if (excludeSet.has(entry.name.toLowerCase())) {
          continue;
        }
        scanDir(fullPath, entryRelPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const parsed = matter(raw);
          const title = parsed.data.title ?? entry.name.replace(/\.md$/i, '');
          // Skip if a note with the same title already exists
          if (existingTitles.has(title.toLowerCase())) {
            continue;
          }
          const folder = relPath || 'Obsidian';
          const tags = Array.isArray(parsed.data.tags)
            ? parsed.data.tags.map(String)
            : typeof parsed.data.tags === 'string'
              ? parsed.data.tags.split(',').map(t => t.trim())
              : [];

          createNote(title, parsed.content, folder, tags, logger);
          existingTitles.add(title.toLowerCase());
          imported++;
        } catch {
          errors++;
        }
      }
    }
  }

  scanDir(vaultPath);

  logger?.info(`Obsidian 导入完成: ${imported} 成功, ${errors} 失败`);
  return { imported, errors };
}
