import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type * as KnowledgeVersioningModule from '../../src/core/knowledge-versioning.js';
import type * as NotesModule from '../../src/core/notes.js';
import type * as CardsModule from '../../src/core/cards.js';
import type * as FilesModule from '../../src/core/files.js';

describe('Knowledge version control', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-knowledge-versioning-${Date.now()}`);
  let versioning: typeof KnowledgeVersioningModule;
  let notes: typeof NotesModule;
  let cards: typeof CardsModule;
  let files: typeof FilesModule;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    versioning = await import('../../src/core/knowledge-versioning.js');
    notes = await import('../../src/core/notes.js');
    cards = await import('../../src/core/cards.js');
    files = await import('../../src/core/files.js');
  });

  afterAll(async () => {
    const database = await import('../../src/db/database.js');
    database.closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  it('creates, branches, switches, restores, renames and deletes without duplicating blobs', async () => {
    const note = notes.createNote('Main note', 'base content', 'Tests');
    cards.createCard('Question', 'Answer', ['version-control']);
    files.saveFile(
      'attachment.txt',
      Buffer.from('shared attachment', 'utf8').toString('base64'),
      'text/plain',
    );

    const base = await versioning.createKnowledgeVersion({
      name: 'Base',
      description: 'Branch point',
    });
    expect(base.stats).toMatchObject({ notes: 1, cards: 1, files: 1 });

    await notes.updateNote(note.id, { content: 'main content' });
    const mainVersion = await versioning.createKnowledgeVersion({ name: 'Main work' });
    expect(mainVersion.isHead).toBe(true);

    const branchState = await versioning.createKnowledgeBranchFromVersion(base.id, 'experiment');
    expect(branchState.activeBranch.name).toBe('experiment');
    expect(notes.getNoteById(note.id)?.content).toBe('base content');
    const branchBase = branchState.versions.find((version) => version.isHead);
    expect(branchBase).toBeDefined();

    await notes.updateNote(note.id, { content: 'branch content' });
    await versioning.createKnowledgeVersion({ name: 'Experiment work' });

    const mainBranch = branchState.branches.find((branch) => branch.id === 'main');
    expect(mainBranch).toBeDefined();
    if (!mainBranch || !branchBase) {
      throw new Error('Expected main branch and cloned branch base');
    }

    await versioning.switchKnowledgeBranch(mainBranch.id);
    expect(notes.getNoteById(note.id)?.content).toBe('main content');

    const experimentBranch = branchState.activeBranch;
    await versioning.switchKnowledgeBranch(experimentBranch.id);
    expect(notes.getNoteById(note.id)?.content).toBe('branch content');

    const restored = await versioning.restoreKnowledgeVersion(branchBase.id);
    expect(restored.activeBranch.id).toBe(experimentBranch.id);
    expect(notes.getNoteById(note.id)?.content).toBe('base content');

    const renamedVersion = await versioning.renameKnowledgeVersion(branchBase.id, {
      name: 'Experiment base',
      description: 'Renamed',
    });
    expect(renamedVersion.name).toBe('Experiment base');
    const renamedBranch = await versioning.renameKnowledgeBranch(experimentBranch.id, 'experiment-renamed');
    expect(renamedBranch.name).toBe('experiment-renamed');

    await versioning.switchKnowledgeBranch(mainBranch.id);
    await versioning.deleteKnowledgeBranch(experimentBranch.id);
    const finalState = await versioning.getKnowledgeVersionState();
    expect(finalState.branches.map((branch) => branch.id)).toEqual(['main']);
    expect(notes.getNoteById(note.id)?.content).toBe('main content');

    const blobDir = path.join(testDir, 'versions', 'blobs');
    const blobs = fs.readdirSync(blobDir).filter((name) => /^[a-f0-9]{64}$/.test(name));
    expect(blobs).toHaveLength(1);
  });

  it('protects main, the active branch and branch head versions', async () => {
    const state = await versioning.getKnowledgeVersionState();
    const main = state.activeBranch;
    const head = state.versions.find((version) => version.isHead);

    await expect(versioning.renameKnowledgeBranch(main.id, 'renamed-main')).rejects.toMatchObject({
      code: 'PROTECTED_BRANCH',
    });
    await expect(versioning.deleteKnowledgeBranch(main.id)).rejects.toMatchObject({
      code: 'PROTECTED_BRANCH',
    });
    if (!head) {
      throw new Error('Expected a current main version');
    }
    await expect(versioning.deleteKnowledgeVersion(head.id)).rejects.toMatchObject({
      code: 'HEAD_VERSION_PROTECTED',
    });
  });

  it('rejects a corrupted manifest before replacing current knowledge', async () => {
    const state = await versioning.getKnowledgeVersionState();
    const nonHead = state.versions.find((version) => !version.isHead);
    if (!nonHead) {
      throw new Error('Expected a non-head version for corruption test');
    }

    const database = await import('../../src/db/database.js');
    const row = database.getKnowledgeVersionRow(nonHead.id);
    if (!row) {
      throw new Error('Expected persisted version metadata');
    }
    fs.writeFileSync(row.manifest_path, '{"invalid":true}', 'utf8');
    const contentBefore = notes.getNoteById(
      database.loadAllNotes()[0]?.id ?? '',
    )?.content;

    await expect(versioning.restoreKnowledgeVersion(nonHead.id)).rejects.toMatchObject({
      code: 'CORRUPTED_VERSION',
    });
    const contentAfter = notes.getNoteById(
      database.loadAllNotes()[0]?.id ?? '',
    )?.content;
    expect(contentAfter).toBe(contentBefore);
  });
});
