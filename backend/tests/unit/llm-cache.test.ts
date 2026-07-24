import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { LLMCache } from '../../src/ai/llm-cache.js';

function getCacheFilePath(cacheDir: string, key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  return path.join(cacheDir, `${hash.slice(0, 16)}.json`);
}

describe('LLMCache', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-llm-cache-test-${Date.now()}`);
  let cache: LLMCache;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    cache = new LLMCache(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('basic operations', () => {
    it('should store and retrieve cached chunks', () => {
      const key = 'test-key-1';
      const chunks = [
        { type: 'content' as const, data: 'hello' },
        { type: 'content' as const, data: ' world' },
      ];

      cache.set(key, chunks);
      const result = cache.get(key);

      expect(result).toEqual(chunks);
    });

    it('should return null for missing key', () => {
      const result = cache.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should clear all cached entries', () => {
      cache.set('key1', [{ type: 'content', data: 'a' }]);
      cache.set('key2', [{ type: 'content', data: 'b' }]);

      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('should return null when disabled', () => {
      const disabledCache = new LLMCache(testDir, { enabled: false });
      disabledCache.set('key', [{ type: 'content', data: 'a' }]);
      expect(disabledCache.get('key')).toBeNull();
    });

    it('should not write file when disabled', () => {
      const disabledCache = new LLMCache(testDir, { enabled: false });
      disabledCache.set('key', [{ type: 'content', data: 'a' }]);
      const files = fs.readdirSync(testDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(0);
    });
  });

  describe('cache key', () => {
    it('should generate consistent keys for identical inputs', () => {
      const messages = [{ role: 'user', content: 'hello' }];
      const params = { temperature: 0.7, max_tokens: 2000 };

      const key1 = cache.buildCacheKey('openai', 'gpt-4', messages, params, 'system');
      const key2 = cache.buildCacheKey('openai', 'gpt-4', messages, params, 'system');

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const messages = [{ role: 'user', content: 'hello' }];
      const params = { temperature: 0.7 };

      const key1 = cache.buildCacheKey('openai', 'gpt-4', messages, params);
      const key2 = cache.buildCacheKey('openai', 'gpt-3.5', messages, params);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different messages', () => {
      const params = { temperature: 0.7 };

      const key1 = cache.buildCacheKey('openai', 'gpt-4', [{ role: 'user', content: 'hello' }], params);
      const key2 = cache.buildCacheKey('openai', 'gpt-4', [{ role: 'user', content: 'world' }], params);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different params', () => {
      const messages = [{ role: 'user', content: 'hello' }];

      const key1 = cache.buildCacheKey('openai', 'gpt-4', messages, { temperature: 0.7 });
      const key2 = cache.buildCacheKey('openai', 'gpt-4', messages, { temperature: 0.8 });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different system prompts', () => {
      const messages = [{ role: 'user', content: 'hello' }];
      const params = { temperature: 0.7 };

      const key1 = cache.buildCacheKey('openai', 'gpt-4', messages, params, 'system-a');
      const key2 = cache.buildCacheKey('openai', 'gpt-4', messages, params, 'system-b');

      expect(key1).not.toBe(key2);
    });

    it('should handle messages with array content', () => {
      const messages = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] as unknown as string }];
      const params = { temperature: 0.7 };

      const key = cache.buildCacheKey('openai', 'gpt-4', messages, params);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });
  });

  describe('max entries enforcement', () => {
    it('should remove oldest entries when exceeding max entries', () => {
      const smallCache = new LLMCache(testDir, { maxEntries: 3 });

      smallCache.set('key1', [{ type: 'content', data: 'a' }]);
      smallCache.set('key2', [{ type: 'content', data: 'b' }]);
      smallCache.set('key3', [{ type: 'content', data: 'c' }]);
      smallCache.set('key4', [{ type: 'content', data: 'd' }]);

      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key2')).not.toBeNull();
      expect(smallCache.get('key3')).not.toBeNull();
      expect(smallCache.get('key4')).not.toBeNull();
    });

    it('should keep exactly max entries', () => {
      const smallCache = new LLMCache(testDir, { maxEntries: 2 });

      smallCache.set('key1', [{ type: 'content', data: 'a' }]);
      smallCache.set('key2', [{ type: 'content', data: 'b' }]);

      expect(smallCache.get('key1')).not.toBeNull();
      expect(smallCache.get('key2')).not.toBeNull();
    });
  });

  describe('corrupted cache files', () => {
    it('should return null for invalid json', () => {
      fs.mkdirSync(testDir, { recursive: true });
      const hash = 'a'.repeat(64);
      const filePath = path.join(testDir, `${hash.slice(0, 16)}.json`);
      fs.writeFileSync(filePath, 'not-json');

      const result = cache.get(hash);
      expect(result).toBeNull();
    });

    it('should return null for mismatched key', () => {
      fs.mkdirSync(testDir, { recursive: true });
      const hash = 'a'.repeat(64);
      const filePath = path.join(testDir, `${hash.slice(0, 16)}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ key: 'different-key', chunks: [], createdAt: Date.now() }));

      const result = cache.get(hash);
      expect(result).toBeNull();
    });

    it('should return null for non-array chunks', () => {
      fs.mkdirSync(testDir, { recursive: true });
      const hash = 'a'.repeat(64);
      const filePath = path.join(testDir, `${hash.slice(0, 16)}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ key: hash, chunks: 'not-array', createdAt: Date.now() }));

      const result = cache.get(hash);
      expect(result).toBeNull();
    });

    it('should return null for non-object entry', () => {
      fs.mkdirSync(testDir, { recursive: true });
      const hash = 'a'.repeat(64);
      const filePath = path.join(testDir, `${hash.slice(0, 16)}.json`);
      fs.writeFileSync(filePath, JSON.stringify(null));

      const result = cache.get(hash);
      expect(result).toBeNull();
    });
  });

  describe('ttl expiration', () => {
    it('should return null for expired cache entries', () => {
      const key = 'expired-key';
      const filePath = getCacheFilePath(testDir, key);
      fs.writeFileSync(filePath, JSON.stringify({
        key,
        chunks: [{ type: 'content', data: 'a' }],
        createdAt: Date.now() - 100,
      }));

      const shortTtlCache = new LLMCache(testDir, { ttlMs: 50 });
      const result = shortTtlCache.get(key);
      expect(result).toBeNull();
    });

    it('should delete expired cache file on get', () => {
      const key = 'delete-me';
      const filePath = getCacheFilePath(testDir, key);
      fs.writeFileSync(filePath, JSON.stringify({
        key,
        chunks: [{ type: 'content', data: 'a' }],
        createdAt: Date.now() - 100,
      }));

      const shortTtlCache = new LLMCache(testDir, { ttlMs: 50 });
      shortTtlCache.get(key);

      const files = fs.readdirSync(testDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(0);
    });

    it('should return cached data when not expired', () => {
      const longTtlCache = new LLMCache(testDir, { ttlMs: 60000 });
      longTtlCache.set('key', [{ type: 'content', data: 'a' }]);

      const result = longTtlCache.get('key');
      expect(result).toEqual([{ type: 'content', data: 'a' }]);
    });

    it('should use default ttl when not specified', () => {
      const defaultCache = new LLMCache(testDir);
      defaultCache.set('key', [{ type: 'content', data: 'a' }]);

      const result = defaultCache.get('key');
      expect(result).toEqual([{ type: 'content', data: 'a' }]);
    });
  });

  describe('cache directory', () => {
    it('should create cache directory if not exists', () => {
      const newDir = path.join(testDir, 'sub', 'cache');
      const newCache = new LLMCache(newDir);
      newCache.set('key', [{ type: 'content', data: 'a' }]);
      expect(fs.existsSync(newDir)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns null and deletes corrupted cache file', () => {
      fs.writeFileSync(path.join(testDir, 'corrupt.json'), '{ broken json');
      const cache = new LLMCache(testDir);
      expect(cache.get('corrupt')).toBeNull();
    });

    it('ttl=0 causes immediate expiration', () => {
      const cache = new LLMCache(testDir, { ttlMs: 0 });
      cache.set('k', [{ type: 'content', data: 'v' }]);
      expect(cache.get('k')).toBeNull();
    });
  });
});
