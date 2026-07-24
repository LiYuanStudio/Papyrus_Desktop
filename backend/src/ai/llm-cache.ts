import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { StreamChunk } from './provider.js';

export interface CacheEntry {
  key: string;
  chunks: StreamChunk[];
  createdAt: number;
}

export interface LLMCacheOptions {
  maxEntries?: number;
  enabled?: boolean;
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class LLMCache {
  private cacheDir: string;
  private maxEntries: number;
  private ttlMs: number;
  enabled: boolean;

  constructor(cacheDir: string, options: LLMCacheOptions = {}) {
    this.cacheDir = cacheDir;
    this.maxEntries = options.maxEntries ?? 100;
    this.enabled = options.enabled ?? true;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  private getCacheFilePath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash.slice(0, 16)}.json`);
  }

  buildCacheKey(
    provider: string,
    model: string,
    messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>,
    params: { temperature?: number; max_tokens?: number; top_p?: number; presence_penalty?: number; frequency_penalty?: number },
    systemPrompt?: string,
    sessionId?: string,
    mode?: string,
  ): string {
    const payload = JSON.stringify({
      provider,
      model,
      messages,
      params: {
        temperature: params.temperature,
        max_tokens: params.max_tokens,
        top_p: params.top_p,
        presence_penalty: params.presence_penalty,
        frequency_penalty: params.frequency_penalty,
      },
      systemPrompt,
      sessionId,
      mode,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  get(key: string): StreamChunk[] | null {
    if (!this.enabled) return null;

    const filePath = this.getCacheFilePath(key);
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content) as unknown;
      if (parsed === null || typeof parsed !== 'object') return null;

      const entry = parsed as Record<string, unknown>;
      if (entry.key !== key) return null;
      if (!Array.isArray(entry.chunks)) return null;

      const createdAt = entry.createdAt;
      if (typeof createdAt === 'number' && Date.now() - createdAt >= this.ttlMs) {
        fs.rmSync(filePath, { force: true });
        return null;
      }

      return entry.chunks as StreamChunk[];
    } catch {
      return null;
    }
  }

  set(key: string, chunks: StreamChunk[]): void {
    if (!this.enabled) return;

    const filePath = this.getCacheFilePath(key);
    const entry: CacheEntry = {
      key,
      chunks,
      createdAt: Date.now(),
    };

    const tempFile = `${filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(entry), 'utf8');
    fs.renameSync(tempFile, filePath);

    this.enforceMaxEntries();
  }

  clear(): void {
    if (!fs.existsSync(this.cacheDir)) return;
    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.rmSync(path.join(this.cacheDir, file), { force: true });
      }
    }
  }

  private enforceMaxEntries(): void {
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    if (files.length <= this.maxEntries) return;

    const entries: Array<{ file: string; createdAt: number }> = [];
    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content) as unknown;
        if (parsed !== null && typeof parsed === 'object') {
          const createdAt = (parsed as Record<string, unknown>).createdAt;
          entries.push({ file, createdAt: typeof createdAt === 'number' ? createdAt : 0 });
        }
      } catch {
        entries.push({ file, createdAt: 0 });
      }
    }

    entries.sort((a, b) => a.createdAt - b.createdAt);
    const toDelete = entries.slice(0, entries.length - this.maxEntries);
    for (const { file } of toDelete) {
      fs.rmSync(path.join(this.cacheDir, file), { force: true });
    }
  }
}
