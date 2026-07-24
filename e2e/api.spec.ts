import { test, expect } from '@playwright/test';

test.describe('Papyrus Backend API', () => {
  test('health check returns ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('can create and retrieve a card', async ({ request }) => {
    const createResponse = await request.post('/api/cards', {
      data: { q: 'E2E Test Question', a: 'E2E Test Answer', tags: ['e2e'] },
    });
    expect(createResponse.ok()).toBe(true);
    const createBody = await createResponse.json();
    expect(createBody.success).toBe(true);
    expect(createBody.card.q).toBe('E2E Test Question');

    const cardId = createBody.card.id;

    const listResponse = await request.get('/api/cards');
    expect(listResponse.ok()).toBe(true);
    const listBody = await listResponse.json();
    expect(listBody.cards.some((c: { id: string }) => c.id === cardId)).toBe(true);
  });

  test('can create and retrieve a note', async ({ request }) => {
    const createResponse = await request.post('/api/notes', {
      data: { title: 'E2E Note', content: 'E2E Content', folder: 'E2E', tags: ['test'] },
    });
    expect(createResponse.ok()).toBe(true);
    const createBody = await createResponse.json();
    expect(createBody.success).toBe(true);
    expect(createBody.note.title).toBe('E2E Note');

    const noteId = createBody.note.id;

    const getResponse = await request.get(`/api/notes/${noteId}`);
    expect(getResponse.ok()).toBe(true);
    const getBody = await getResponse.json();
    expect(getBody.note.id).toBe(noteId);
  });

  test('search returns results', async ({ request }) => {
    const response = await request.get('/api/search?query=E2E');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });

  test('markdown rendering works', async ({ request }) => {
    const response = await request.post('/api/markdown/render', {
      data: { content: '# Hello World' },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.html).toContain('<h1>');
  });
});
