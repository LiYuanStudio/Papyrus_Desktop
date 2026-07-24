import {
  createRelation,
  updateRelation,
  deleteRelation,
  getNoteRelations,
} from '../../core/relations.js';
import type { ToolDescriptor } from './types.js';
import { requireString, optionalString, requireId, isErr } from './types.js';

export const RELATION_TOOLS: ToolDescriptor[] = [
  {
    name: 'create_relation',
    category: 'relations',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'create_relation',
        description: '在两篇笔记之间创建关联（带类型与描述）',
        parameters: {
          type: 'object',
          properties: {
            source_id: { type: 'string', description: '来源笔记 ID' },
            target_id: { type: 'string', description: '目标笔记 ID' },
            relation_type: { type: 'string', description: '关联类型，如「相关」「引用」' },
            description: { type: 'string', description: '关联描述' },
          },
          required: ['source_id', 'target_id', 'relation_type'],
        },
      },
    },
    runner: (params, ctx) => {
      const sourceId = requireId(params, 'source_id');
      if (isErr(sourceId)) return { success: false, error: sourceId.error };
      const targetId = requireId(params, 'target_id');
      if (isErr(targetId)) return { success: false, error: targetId.error };
      if (sourceId === targetId) return { success: false, error: '不能将笔记关联到自身' };
      const relationType = requireString(params, 'relation_type', 50);
      if (isErr(relationType)) return { success: false, error: relationType.error };
      const description = optionalString(params, 'description', 500);
      if (isErr(description)) return { success: false, error: description.error };

      const id = createRelation(sourceId, targetId, relationType, description ?? '', ctx.logger ?? undefined);
      return { success: true, message: '关联已创建', relation_id: id };
    },
  },
  {
    name: 'update_relation',
    category: 'relations',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'update_relation',
        description: '更新一条关联的类型或描述',
        parameters: {
          type: 'object',
          properties: {
            relation_id: { type: 'string', description: '关联 ID' },
            relation_type: { type: 'string', description: '新的关联类型（可选）' },
            description: { type: 'string', description: '新的描述（可选）' },
          },
          required: ['relation_id'],
        },
      },
    },
    runner: (params, ctx) => {
      const relationId = requireId(params, 'relation_id');
      if (isErr(relationId)) return { success: false, error: relationId.error };
      const updates: { relation_type?: string; description?: string } = {};
      const relType = optionalString(params, 'relation_type', 50);
      if (isErr(relType)) return { success: false, error: relType.error };
      if (relType !== undefined) updates.relation_type = relType;
      const desc = optionalString(params, 'description', 500);
      if (isErr(desc)) return { success: false, error: desc.error };
      if (desc !== undefined) updates.description = desc;
      const ok = updateRelation(relationId, updates, ctx.logger ?? undefined);
      if (!ok) return { success: false, error: '关联不存在或更新失败' };
      return { success: true, message: '关联已更新', relation_id: relationId };
    },
  },
  {
    name: 'delete_relation',
    category: 'relations',
    sideEffect: 'write',
    openai: {
      type: 'function',
      function: {
        name: 'delete_relation',
        description: '根据 ID 删除一条关联',
        parameters: {
          type: 'object',
          properties: {
            relation_id: { type: 'string', description: '关联 ID' },
          },
          required: ['relation_id'],
        },
      },
    },
    runner: (params, ctx) => {
      const relationId = requireId(params, 'relation_id');
      if (isErr(relationId)) return { success: false, error: relationId.error };
      const ok = deleteRelation(relationId, ctx.logger ?? undefined);
      if (!ok) return { success: false, error: '关联不存在或删除失败' };
      return { success: true, message: '关联已删除', relation_id: relationId };
    },
  },
  {
    name: 'list_relations',
    category: 'relations',
    sideEffect: 'read',
    openai: {
      type: 'function',
      function: {
        name: 'list_relations',
        description: '列出指定笔记的出链与入链关联',
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
      const data = getNoteRelations(noteId, ctx.logger ?? undefined);
      return {
        success: true,
        outgoing: data.outgoing,
        incoming: data.incoming,
        outgoing_count: data.outgoing.length,
        incoming_count: data.incoming.length,
      };
    },
  },
];

export const RELATIONS_PROMPT_HINT = `关联相关：
- create_relation / update_relation / delete_relation：增删改笔记关联
- list_relations：查看笔记的出链与入链`;
