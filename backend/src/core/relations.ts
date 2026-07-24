import { v4 as uuidv4 } from 'uuid';
import {
  loadRelationsForNote,
  insertRelation,
  updateRelation as dbUpdateRelation,
  deleteRelationById,
  searchNotesForRelation,
  getGraphData,
} from '../db/database.js';
import type { PapyrusLogger } from '../utils/logger.js';

export interface RelatedNote {
  relation_id: string;
  note_id: string;
  title: string;
  folder: string;
  relation_type: string;
  description: string;
  is_outgoing: boolean;
}

export interface SearchableNote {
  id: string;
  title: string;
  folder: string;
  preview: string;
}

export interface GraphNode {
  id: string;
  title: string;
  folder: string;
  is_center: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
}

export function getNoteRelations(noteId: string, logger?: PapyrusLogger): { outgoing: RelatedNote[]; incoming: RelatedNote[] } {
  const raw = loadRelationsForNote(noteId);

  const outgoing: RelatedNote[] = raw.outgoing.map(r => ({
    relation_id: r.id,
    note_id: r.target_id,
    title: r.title ?? '',
    folder: r.folder ?? '',
    relation_type: r.relation_type,
    description: r.description,
    is_outgoing: true,
  }));

  const incoming: RelatedNote[] = raw.incoming.map(r => ({
    relation_id: r.id,
    note_id: r.source_id,
    title: r.title ?? '',
    folder: r.folder ?? '',
    relation_type: r.relation_type,
    description: r.description,
    is_outgoing: false,
  }));

  logger?.info(`加载笔记关联: ${noteId}, 出链 ${outgoing.length}, 入链 ${incoming.length}`);
  return { outgoing, incoming };
}

export function createRelation(
  sourceId: string,
  targetId: string,
  relationType: string,
  description: string,
  logger?: PapyrusLogger,
): string {
  const now = Date.now() / 1000;
  const id = uuidv4().replace(/-/g, '');

  insertRelation({
    id,
    source_id: sourceId,
    target_id: targetId,
    relation_type: relationType,
    description: description.trim(),
    created_at: now,
    updated_at: now,
  }, logger);

  logger?.info(`创建关联: ${sourceId} -> ${targetId} (${relationType})`);
  return id;
}

export function updateRelation(
  relationId: string,
  updates: { relation_type?: string; description?: string },
  logger?: PapyrusLogger,
): boolean {
  const result = dbUpdateRelation(relationId, {
    relation_type: updates.relation_type,
    description: updates.description,
  }, logger);
  logger?.info(`更新关联: ${relationId}`);
  return result;
}

export function deleteRelation(relationId: string, logger?: PapyrusLogger): boolean {
  const result = deleteRelationById(relationId, logger);
  logger?.info(`删除关联: ${relationId}`);
  return result;
}

export function searchForRelation(
  query: string,
  excludeNoteId: string,
  limit: number,
  logger?: PapyrusLogger,
): SearchableNote[] {
  const notes = searchNotesForRelation(query, excludeNoteId, limit);
  logger?.info(`搜索可关联笔记: "${query}", 找到 ${notes.length} 条`);
  return notes.map(n => ({
    id: n.id,
    title: n.title,
    folder: n.folder,
    preview: n.preview,
  }));
}

export function getNoteGraph(
  noteId: string,
  depth: number,
  logger?: PapyrusLogger,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const data = getGraphData(noteId, depth);
  logger?.info(`加载图谱: ${noteId}, 深度 ${depth}, 节点 ${data.nodes.length}, 连线 ${data.links.length}`);
  return data;
}
