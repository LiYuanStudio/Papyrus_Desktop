import {
  saveNoteVersion as dbSaveNoteVersion,
  getNoteVersions,
  getNoteVersionById,
  getLatestNoteVersionHash,
  saveCardVersion as dbSaveCardVersion,
  getCardVersions,
  getCardVersionById,
  getLatestCardVersionHash,
  updateNote as dbUpdateNote,
  updateCard as dbUpdateCard,
  getNoteById,
  getCardById,
} from '../db/database.js';
import type { Note, CardRecord } from './types.js';
import type { PapyrusLogger } from '../utils/logger.js';

function computeCardContentHash(card: CardRecord): string {
  const raw = `${card.q}|${card.a}|${card.tags.join(',')}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

export function saveNoteVersion(note: Note, logger?: PapyrusLogger): void {
  const latestHash = getLatestNoteVersionHash(note.id);
  if (latestHash !== null && latestHash === note.hash) {
    return;
  }
  dbSaveNoteVersion(note, logger);
}

export function getNoteHistory(noteId: string): Array<Note & { version: number; version_id: string; version_created_at: number }> {
  return getNoteVersions(noteId);
}

export function rollbackNote(noteId: string, versionId: string, logger?: PapyrusLogger): Note | null {
  const currentNote = getNoteById(noteId);
  if (!currentNote) return null;

  const targetVersion = getNoteVersionById(versionId);
  if (!targetVersion || targetVersion.id !== noteId) return null;

  dbSaveNoteVersion(currentNote, logger);

  const rolledBackNote: Note = {
    id: noteId,
    title: targetVersion.title,
    folder: targetVersion.folder,
    content: targetVersion.content,
    preview: targetVersion.preview,
    tags: targetVersion.tags,
    created_at: currentNote.created_at,
    updated_at: Date.now() / 1000,
    word_count: targetVersion.word_count,
    hash: targetVersion.hash,
    headings: targetVersion.headings,
    outgoing_links: targetVersion.outgoing_links,
    incoming_count: currentNote.incoming_count,
  };
  dbUpdateNote(rolledBackNote, logger);
  logger?.info(`回滚笔记: ${noteId} -> ${versionId}`);
  return rolledBackNote;
}

export function saveCardVersion(card: CardRecord, logger?: PapyrusLogger): void {
  const contentHash = computeCardContentHash(card);
  const latestHash = getLatestCardVersionHash(card.id);
  if (latestHash !== null && latestHash === contentHash) {
    return;
  }
  dbSaveCardVersion(card, contentHash, logger);
}

export function getCardHistory(cardId: string): Array<CardRecord & { version: number; version_id: string; version_created_at: number }> {
  return getCardVersions(cardId);
}

export function rollbackCard(cardId: string, versionId: string, logger?: PapyrusLogger): CardRecord | null {
  const currentCard = getCardById(cardId);
  if (!currentCard) return null;

  const targetVersion = getCardVersionById(versionId);
  if (!targetVersion || targetVersion.id !== cardId) return null;

  dbSaveCardVersion(currentCard, computeCardContentHash(currentCard), logger);

  const rolledBackCard: CardRecord = {
    id: cardId,
    q: targetVersion.q,
    a: targetVersion.a,
    tags: targetVersion.tags,
    next_review: currentCard.next_review,
    interval: currentCard.interval,
    ef: currentCard.ef,
    repetitions: currentCard.repetitions,
  };
  dbUpdateCard(rolledBackCard, logger);
  logger?.info(`回滚卡片: ${cardId} -> ${versionId}`);
  return rolledBackCard;
}
