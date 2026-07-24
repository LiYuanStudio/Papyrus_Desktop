import { app, initApp } from '../../src/api/server.js';
import { patchAppInjectWithAuth } from '../test-auth.js';

describe('CLI Manager API', () => {
  beforeAll(async () => {
    await initApp();
    patchAppInjectWithAuth(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns CLI status from the Desktop API without requiring direct file access', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cli/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(typeof body.installed).toBe('boolean');
    expect(body.packageName).toBe('@papyrus/cli');
  });

  it('validates cli run args at the Desktop API boundary', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cli/run',
      payload: { args: ['status', 3] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain('args');
  });
});
