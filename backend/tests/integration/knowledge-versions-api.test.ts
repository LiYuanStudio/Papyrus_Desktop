import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { app, initApp } from '../../src/api/server.js';
import { patchAppInjectWithAuth } from '../test-auth.js';

describe('Knowledge version control API', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-knowledge-version-api-${Date.now()}`);
  let noteId = '';
  let baseVersionId = '';
  let branchId = '';
  let branchBaseVersionId = '';

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    await initApp();
    patchAppInjectWithAuth(app);
  });

  afterAll(async () => {
    await app.close();
    const database = await import('../../src/db/database.js');
    database.closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  it('starts with a protected empty main branch', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/knowledge-versions' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.activeBranch).toMatchObject({
      id: 'main',
      name: 'main',
      isActive: true,
      isProtected: true,
      headVersionId: null,
    });
    expect(body.versions).toEqual([]);
  });

  it('creates manual versions and validates names', async () => {
    const noteResponse = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: {
        title: 'Versioned note',
        content: 'base content',
        folder: 'Tests',
        tags: ['version-control'],
      },
    });
    expect(noteResponse.statusCode).toBe(200);
    noteId = JSON.parse(noteResponse.body).note.id;

    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/api/knowledge-versions',
      payload: { name: ' ' },
    });
    expect(invalidResponse.statusCode).toBe(422);
    expect(JSON.parse(invalidResponse.body).code).toBe('INVALID_NAME');

    const baseResponse = await app.inject({
      method: 'POST',
      url: '/api/knowledge-versions',
      payload: { name: 'Base', description: 'Branch point' },
    });
    expect(baseResponse.statusCode).toBe(201);
    const baseBody = JSON.parse(baseResponse.body);
    baseVersionId = baseBody.version.id;
    expect(baseBody.version).toMatchObject({
      name: 'Base',
      description: 'Branch point',
      kind: 'manual',
      isHead: true,
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      payload: { content: 'main content' },
    });
    const mainResponse = await app.inject({
      method: 'POST',
      url: '/api/knowledge-versions',
      payload: { name: 'Main work' },
    });
    expect(mainResponse.statusCode).toBe(201);
  });

  it('branches, switches and restores isolated knowledge', async () => {
    const branchResponse = await app.inject({
      method: 'POST',
      url: `/api/knowledge-versions/${baseVersionId}/branch`,
      payload: { name: 'experiment' },
    });
    expect(branchResponse.statusCode).toBe(201);
    const branchBody = JSON.parse(branchResponse.body);
    branchId = branchBody.activeBranch.id;
    branchBaseVersionId = branchBody.activeBranch.headVersionId;
    expect(branchBody.activeBranch.name).toBe('experiment');

    const branchNote = await app.inject({ method: 'GET', url: `/api/notes/${noteId}` });
    expect(JSON.parse(branchNote.body).note.content).toBe('base content');

    await app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      payload: { content: 'branch content' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/knowledge-versions',
      payload: { name: 'Experiment work' },
    });

    const switchMain = await app.inject({
      method: 'POST',
      url: '/api/knowledge-branches/main/switch',
    });
    expect(switchMain.statusCode).toBe(200);
    expect(JSON.parse(switchMain.body).activeBranch.id).toBe('main');
    const mainNote = await app.inject({ method: 'GET', url: `/api/notes/${noteId}` });
    expect(JSON.parse(mainNote.body).note.content).toBe('main content');

    const switchBranch = await app.inject({
      method: 'POST',
      url: `/api/knowledge-branches/${branchId}/switch`,
    });
    expect(switchBranch.statusCode).toBe(200);
    const branchChangedNote = await app.inject({ method: 'GET', url: `/api/notes/${noteId}` });
    expect(JSON.parse(branchChangedNote.body).note.content).toBe('branch content');

    const restoreResponse = await app.inject({
      method: 'POST',
      url: `/api/knowledge-versions/${branchBaseVersionId}/restore`,
    });
    expect(restoreResponse.statusCode).toBe(200);
    const restoredNote = await app.inject({ method: 'GET', url: `/api/notes/${noteId}` });
    expect(JSON.parse(restoredNote.body).note.content).toBe('base content');
    expect(
      JSON.parse(restoreResponse.body).versions.some(
        (version: { kind: string }) => version.kind === 'safety',
      ),
    ).toBe(true);
  });

  it('renames resources and protects active/main/head deletion', async () => {
    const renameVersion = await app.inject({
      method: 'PATCH',
      url: `/api/knowledge-versions/${branchBaseVersionId}`,
      payload: { name: 'Experiment base', description: 'Renamed through API' },
    });
    expect(renameVersion.statusCode).toBe(200);
    expect(JSON.parse(renameVersion.body).version.name).toBe('Experiment base');

    const renameBranch = await app.inject({
      method: 'PATCH',
      url: `/api/knowledge-branches/${branchId}`,
      payload: { name: 'experiment-renamed' },
    });
    expect(renameBranch.statusCode).toBe(200);
    expect(JSON.parse(renameBranch.body).branch.name).toBe('experiment-renamed');

    const deleteHead = await app.inject({
      method: 'DELETE',
      url: `/api/knowledge-versions/${branchBaseVersionId}`,
    });
    expect(deleteHead.statusCode).toBe(409);
    expect(JSON.parse(deleteHead.body).code).toBe('HEAD_VERSION_PROTECTED');

    const deleteActiveBranch = await app.inject({
      method: 'DELETE',
      url: `/api/knowledge-branches/${branchId}`,
    });
    expect(deleteActiveBranch.statusCode).toBe(409);
    expect(JSON.parse(deleteActiveBranch.body).code).toBe('ACTIVE_BRANCH');

    const deleteMain = await app.inject({
      method: 'DELETE',
      url: '/api/knowledge-branches/main',
    });
    expect(deleteMain.statusCode).toBe(409);
    expect(JSON.parse(deleteMain.body).code).toBe('PROTECTED_BRANCH');
  });

  it('deletes a non-active branch and its exclusive history', async () => {
    const switchResponse = await app.inject({
      method: 'POST',
      url: '/api/knowledge-branches/main/switch',
    });
    expect(switchResponse.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/knowledge-branches/${branchId}`,
    });
    expect(deleteResponse.statusCode).toBe(200);

    const stateResponse = await app.inject({ method: 'GET', url: '/api/knowledge-versions' });
    const state = JSON.parse(stateResponse.body);
    expect(state.branches.map((branch: { id: string }) => branch.id)).toEqual(['main']);
    expect(state.activeBranch.id).toBe('main');
  });

  it('creates a branch directly from the current working state', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/knowledge-branches',
      payload: { name: 'current-work' },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body);
    expect(created.activeBranch.name).toBe('current-work');
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]).toMatchObject({
      kind: 'safety',
      isHead: true,
    });

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: '/api/knowledge-branches',
      payload: { name: 'CURRENT-WORK' },
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(JSON.parse(duplicateResponse.body).code).toBe('BRANCH_NAME_CONFLICT');

    const currentNote = await app.inject({ method: 'GET', url: `/api/notes/${noteId}` });
    expect(JSON.parse(currentNote.body).note.content).toBe('main content');
  });
});
