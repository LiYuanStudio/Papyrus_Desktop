import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

describe('Rate Limit', () => {
  it('should return 429 after exceeding the limit', async () => {
    const testApp = Fastify();
    await testApp.register(rateLimit, {
      max: 3,
      timeWindow: '1 minute',
    });
    testApp.get('/test', async () => 'ok');

    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      const res = await testApp.inject({ method: 'GET', url: '/test' });
      expect(res.statusCode).toBe(200);
    }

    // 4th request should be rate limited
    const res = await testApp.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.statusCode).toBe(429);
    expect(body.message).toBeTruthy();

    await testApp.close();
  });

  it('should include rate limit headers', async () => {
    const testApp = Fastify();
    await testApp.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });
    testApp.get('/test', async () => 'ok');

    const res = await testApp.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();

    await testApp.close();
  });
});
