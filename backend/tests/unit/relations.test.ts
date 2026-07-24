import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Relations', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-relations-test-${Date.now()}`);

  let createNote: typeof import('../../src/core/notes.js').createNote;
  let deleteNote: typeof import('../../src/core/notes.js').deleteNote;
  let getNoteRelations: typeof import('../../src/core/relations.js').getNoteRelations;
  let createRelation: typeof import('../../src/core/relations.js').createRelation;
  let updateRelation: typeof import('../../src/core/relations.js').updateRelation;
  let deleteRelation: typeof import('../../src/core/relations.js').deleteRelation;
  let searchForRelation: typeof import('../../src/core/relations.js').searchForRelation;
  let getNoteGraph: typeof import('../../src/core/relations.js').getNoteGraph;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;

    const notes = await import('../../src/core/notes.js');
    createNote = notes.createNote;
    deleteNote = notes.deleteNote;

    const relations = await import('../../src/core/relations.js');
    getNoteRelations = relations.getNoteRelations;
    createRelation = relations.createRelation;
    updateRelation = relations.updateRelation;
    deleteRelation = relations.deleteRelation;
    searchForRelation = relations.searchForRelation;
    getNoteGraph = relations.getNoteGraph;
  });

  afterAll(async () => {
    const { closeDb } = await import('../../src/db/database.js');
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  describe('getNoteRelations', () => {
    it('should return empty relations for a note with no links', () => {
      const note = createNote('孤立笔记', '没有任何关联');
      const result = getNoteRelations(note.id);

      expect(result.outgoing).toEqual([]);
      expect(result.incoming).toEqual([]);
    });

    it('should return outgoing relations', () => {
      const source = createNote('源笔记', '这是源笔记');
      const target = createNote('目标笔记', '这是目标笔记');
      createRelation(source.id, target.id, 'reference', '引用关系');

      const result = getNoteRelations(source.id);

      expect(result.outgoing.length).toBe(1);
      expect(result.outgoing[0]?.note_id).toBe(target.id);
      expect(result.outgoing[0]?.relation_type).toBe('reference');
      expect(result.incoming).toEqual([]);
    });

    it('should return incoming relations', () => {
      const source = createNote('源笔记', '这是源笔记');
      const target = createNote('目标笔记', '这是目标笔记');
      createRelation(source.id, target.id, 'related', '相关关系');

      const result = getNoteRelations(target.id);

      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0]?.note_id).toBe(source.id);
      expect(result.incoming[0]?.relation_type).toBe('related');
      expect(result.outgoing).toEqual([]);
    });

    it('should return both outgoing and incoming relations', () => {
      const center = createNote('中心笔记', '中心');
      const left = createNote('左侧笔记', '左侧');
      const right = createNote('右侧笔记', '右侧');

      createRelation(center.id, left.id, 'reference', '引用左侧');
      createRelation(right.id, center.id, 'reference', '右侧引用中心');

      const result = getNoteRelations(center.id);

      expect(result.outgoing.length).toBe(1);
      expect(result.outgoing[0]?.note_id).toBe(left.id);
      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0]?.note_id).toBe(right.id);
    });
  });

  describe('createRelation', () => {
    it('should create a relation and return its id', () => {
      const source = createNote('源', '内容');
      const target = createNote('目标', '内容');

      const id = createRelation(source.id, target.id, 'reference', '');

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should throw when creating duplicate relation', () => {
      const source = createNote('源', '内容');
      const target = createNote('目标', '内容');

      createRelation(source.id, target.id, 'reference', '');

      expect(() => {
        createRelation(source.id, target.id, 'reference', '');
      }).toThrow();
    });

    it('should allow reverse direction between same notes', () => {
      const a = createNote('A', '内容');
      const b = createNote('B', '内容');

      const id1 = createRelation(a.id, b.id, 'parent', '');
      const id2 = createRelation(b.id, a.id, 'child', '');

      expect(id1).not.toBe(id2);
    });
  });

  describe('updateRelation', () => {
    it('should update relation type and description', () => {
      const source = createNote('源', '内容');
      const target = createNote('目标', '内容');
      const id = createRelation(source.id, target.id, 'reference', '旧描述');

      const success = updateRelation(id, { relation_type: 'related', description: '新描述' });

      expect(success).toBe(true);
      const result = getNoteRelations(source.id);
      expect(result.outgoing[0]?.relation_type).toBe('related');
      expect(result.outgoing[0]?.description).toBe('新描述');
    });

    it('should return false for non-existent relation', () => {
      const success = updateRelation('non-existent-id', { relation_type: 'reference' });
      expect(success).toBe(false);
    });

    it('should support partial update (type only)', () => {
      const source = createNote('源', '内容');
      const target = createNote('目标', '内容');
      const id = createRelation(source.id, target.id, 'reference', '描述');

      const success = updateRelation(id, { relation_type: 'sequence' });

      expect(success).toBe(true);
      const result = getNoteRelations(source.id);
      expect(result.outgoing[0]?.relation_type).toBe('sequence');
      expect(result.outgoing[0]?.description).toBe('描述');
    });
  });

  describe('deleteRelation', () => {
    it('should delete an existing relation', () => {
      const source = createNote('源', '内容');
      const target = createNote('目标', '内容');
      const id = createRelation(source.id, target.id, 'reference', '');

      const success = deleteRelation(id);

      expect(success).toBe(true);
      const result = getNoteRelations(source.id);
      expect(result.outgoing).toEqual([]);
    });

    it('should return false for non-existent relation', () => {
      const success = deleteRelation('non-existent-id');
      expect(success).toBe(false);
    });
  });

  describe('searchForRelation', () => {
    it('should find notes by title', () => {
      createNote('JavaScript 基础', '内容');
      createNote('Python 指南', '内容');

      const results = searchForRelation('javascript', '', 10);

      expect(results.length).toBe(1);
      expect(results[0]?.title).toBe('JavaScript 基础');
    });

    it('should exclude specified note id', () => {
      const exclude = createNote('排除我', '内容');
      createNote('包含我', '内容');

      const results = searchForRelation('我', exclude.id, 10);

      expect(results.some((n) => n.id === exclude.id)).toBe(false);
      expect(results.length).toBe(1);
    });

    it('should respect limit parameter', () => {
      createNote('笔记 A', '内容');
      createNote('笔记 B', '内容');
      createNote('笔记 C', '内容');

      const results = searchForRelation('笔记', '', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array for no match', () => {
      createNote('笔记', '内容');

      const results = searchForRelation('xyz-not-found', '', 10);

      expect(results).toEqual([]);
    });
  });

  describe('getNoteGraph', () => {
    it('should return only center node for isolated note', () => {
      const note = createNote('孤立', '内容');

      const graph = getNoteGraph(note.id, 1);

      expect(graph.nodes.length).toBe(1);
      expect(graph.nodes[0]?.id).toBe(note.id);
      expect(graph.nodes[0]?.is_center).toBe(true);
      expect(graph.links).toEqual([]);
    });

    it('should return depth-1 neighbors', () => {
      const center = createNote('中心', '内容');
      const neighbor = createNote('邻居', '内容');
      createRelation(center.id, neighbor.id, 'reference', '');

      const graph = getNoteGraph(center.id, 1);

      expect(graph.nodes.length).toBe(2);
      expect(graph.links.length).toBe(1);
      expect(graph.links[0]?.source).toBe(center.id);
      expect(graph.links[0]?.target).toBe(neighbor.id);
    });

    it('should return depth-2 neighbors', () => {
      const a = createNote('A', '内容');
      const b = createNote('B', '内容');
      const c = createNote('C', '内容');
      createRelation(a.id, b.id, 'reference', '');
      createRelation(b.id, c.id, 'reference', '');

      const graph = getNoteGraph(a.id, 2);

      expect(graph.nodes.length).toBe(3);
      expect(graph.links.length).toBe(2);
    });

    it('should deduplicate nodes and links', () => {
      const a = createNote('A', '内容');
      const b = createNote('B', '内容');
      const c = createNote('C', '内容');
      // A -> B, A -> C, B -> C (C is reachable by depth 2)
      createRelation(a.id, b.id, 'reference', '');
      createRelation(a.id, c.id, 'reference', '');
      createRelation(b.id, c.id, 'reference', '');

      const graph = getNoteGraph(a.id, 2);

      expect(graph.nodes.length).toBe(3);
      expect(graph.links.length).toBe(3);
    });

    it('should include bidirectional links', () => {
      const a = createNote('A', '内容');
      const b = createNote('B', '内容');
      // A -> B and B -> A
      createRelation(a.id, b.id, 'reference', '');
      createRelation(b.id, a.id, 'related', '');

      const graph = getNoteGraph(a.id, 1);

      expect(graph.links.length).toBe(2);
    });
  });

  describe('cascade delete', () => {
    it('should remove relations when source note is deleted', () => {
      const source = createNote('源', '内容');
      const target = createNote('目标', '内容');
      createRelation(source.id, target.id, 'reference', '');

      deleteNote(source.id);

      const result = getNoteRelations(target.id);
      expect(result.incoming).toEqual([]);
    });

    it('should remove relations when target note is deleted', () => {
      const source = createNote('源', '内容');
      const target = createNote('目标', '内容');
      createRelation(source.id, target.id, 'reference', '');

      deleteNote(target.id);

      const result = getNoteRelations(source.id);
      expect(result.outgoing).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should allow self-relation (document behavior)', () => {
      const note = createNote('Self', 'content');
      const id = createRelation(note.id, note.id, 'self', '');
      expect(id).toBeTruthy();
      const rels = getNoteRelations(note.id);
      expect(rels.outgoing.length).toBe(1);
      expect(rels.incoming.length).toBe(1);
      expect(rels.outgoing[0]?.note_id).toBe(note.id);
    });

    it('getNoteGraph with depth=0 returns only center node', () => {
      const a = createNote('A', 'content');
      const b = createNote('B', 'content');
      createRelation(a.id, b.id, 'ref', '');
      const graph = getNoteGraph(a.id, 0);
     expect(graph.links.length).toBe(0);
      expect(graph.nodes.length).toBe(1);
      expect(graph.links.length).toBe(0);
      expect(graph.nodes[0]?.is_center).toBe(true);
      expect(graph.nodes[0]?.id).toBe(a.id);
    });

    it('searchForRelation excludes the requesting note from results', () => {
      const a = createNote('Requester', 'content');
      const b = createNote('TargetNote', 'TargetContent');
      const results = searchForRelation('Target', a.id, 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.id === b.id)).toBe(true);
      expect(results.some(r => r.id === a.id)).toBe(false);
    });
  });
});
