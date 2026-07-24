import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { AIConfig } from '../../src/ai/config.js';

describe('ai-db-sync', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  let loadAIConfigFromDb: typeof import('../../src/ai/db-sync.js').loadAIConfigFromDb;
  let migrateJsonProvidersToDb: typeof import('../../src/ai/db-sync.js').migrateJsonProvidersToDb;
  let getProviderConfigFromDB: typeof import('../../src/ai/db-sync.js').getProviderConfigFromDB;
  let getProviderApiKeyFromDB: typeof import('../../src/ai/db-sync.js').getProviderApiKeyFromDB;
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;
  let saveProvider: typeof import('../../src/db/database.js').saveProvider;
  let saveApiKey: typeof import('../../src/db/database.js').saveApiKey;
  let saveModel: typeof import('../../src/db/database.js').saveModel;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-db-sync-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
    const mod = await import('../../src/ai/db-sync.js');
    loadAIConfigFromDb = mod.loadAIConfigFromDb;
    migrateJsonProvidersToDb = mod.migrateJsonProvidersToDb;
    getProviderConfigFromDB = mod.getProviderConfigFromDB;
    getProviderApiKeyFromDB = mod.getProviderApiKeyFromDB;
    const dbMod = await import('../../src/db/database.js');
    closeDb = dbMod.closeDb;
    getDb = dbMod.getDb;
    saveProvider = dbMod.saveProvider;
    saveApiKey = dbMod.saveApiKey;
    saveModel = dbMod.saveModel;
    getDb();
  });

  afterEach(() => {
    closeDb();
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('loadAIConfigFromDb does nothing when DB has no providers', () => {
    const cfg = new AIConfig(tempDir);
    cfg.config.current_provider = 'custom';
    loadAIConfigFromDb(cfg);
    // DB is empty (no seed), so current_provider stays unchanged
    expect(cfg.config.current_provider).toBe('custom');
  });

  it('loadAIConfigFromDb leaves current_provider unchanged when valid and force=false', () => {
    saveProvider({ id: 'p1', type: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', enabled: true, isDefault: true, models: [] });
    saveModel('p1', { id: 'm1a', modelId: 'gpt-4o', name: 'GPT-4o', enabled: true });
    const cfg = new AIConfig(tempDir);
    cfg.config.current_provider = 'openai';
    cfg.config.current_model = 'gpt-4o';
    loadAIConfigFromDb(cfg, false);
    expect(cfg.config.current_provider).toBe('openai');
  });

  it('loadAIConfigFromDb ignores disabled providers when checking current provider validity', () => {
    saveProvider({ id: 'p2', type: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', enabled: false, isDefault: false, models: [] });
    saveProvider({ id: 'p3', type: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', enabled: true, isDefault: true, models: [] });
    saveModel('p3', { id: 'm3a', modelId: 'gpt-4o', name: 'GPT-4o', enabled: true });
    const cfg = new AIConfig(tempDir);
    cfg.config.current_provider = 'deepseek';
    loadAIConfigFromDb(cfg, false);
    expect(cfg.config.current_provider).toBe('openai');
  });

  it('loadAIConfigFromDb falls back to default provider when current is invalid', () => {
    saveProvider({ id: 'p4', type: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', enabled: true, isDefault: true, models: [] });
    saveModel('p4', { id: 'm4a', modelId: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', enabled: true });
    const cfg = new AIConfig(tempDir);
    cfg.config.current_provider = 'nonexistent';
    loadAIConfigFromDb(cfg);
    expect(cfg.config.current_provider).toBe('anthropic');
  });

  it('loadAIConfigFromDb forces sync when forceSyncDefault=true', () => {
    saveProvider({ id: 'p5', type: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', enabled: true, isDefault: true, models: [] });
    saveModel('p5', { id: 'm5a', modelId: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true });
    const cfg = new AIConfig(tempDir);
    cfg.config.current_provider = 'openai';
    cfg.config.current_model = 'gpt-4o';
    loadAIConfigFromDb(cfg, true);
    expect(cfg.config.current_provider).toBe('deepseek');
    expect(cfg.config.current_model).toBe('deepseek-chat');
  });

  it('migrateJsonProvidersToDb does not throw with empty providers', () => {
    const cfg = new AIConfig(tempDir);
    cfg.config.providers = {};
    expect(() => migrateJsonProvidersToDb(cfg)).not.toThrow();
  });

  it('migrateJsonProvidersToDb preserves existing API key when config contains a masked key', () => {
    saveProvider({ id: 'p6', type: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', enabled: true, isDefault: false, models: [] });
    saveApiKey('p6', { id: 'k6', name: 'default', key: 'sk-real-key' });

    const cfg = new AIConfig(tempDir);
    cfg.config.providers['openai'] = { api_key: '****...****abcd', base_url: 'https://api.openai.com', models: ['gpt-4o'] };
    migrateJsonProvidersToDb(cfg);

    const apiKey = getProviderApiKeyFromDB('openai');
    expect(apiKey).toBe('sk-real-key');
  });

  it('migrateJsonProvidersToDb keeps syncing other providers when one provider fails', () => {
    const cfg = new AIConfig(tempDir);
    cfg.config.providers['deepseek'] = { api_key: 'sk-deepseek', base_url: 'https://api.deepseek.com', models: ['deepseek-chat'] };
    cfg.config.providers['broken'] = { api_key: '', base_url: '', models: [] };
    cfg.config.providers['openai'] = { api_key: 'sk-openai', base_url: 'https://api.openai.com', models: ['gpt-4o'] };

    expect(() => migrateJsonProvidersToDb(cfg)).not.toThrow();

    const synced = getProviderConfigFromDB('deepseek');
    expect(synced?.base_url).toBe('https://api.deepseek.com');
  });

  it('getProviderConfigFromDB returns null for non-existent provider', () => {
    expect(getProviderConfigFromDB('nonexistent')).toBeNull();
  });

  it('getProviderConfigFromDB returns api_key, base_url, and enabled models', () => {
    saveProvider({ id: 'p7', type: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', enabled: true, isDefault: false, models: [] });
    saveApiKey('p7', { id: 'k7', name: 'default', key: 'sk-test' });
    saveModel('p7', { id: 'm7a', modelId: 'gpt-4o', name: 'GPT-4o', enabled: true });
    saveModel('p7', { id: 'm7b', modelId: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: false });

    const result = getProviderConfigFromDB('openai');
    expect(result).not.toBeNull();
    expect(result!.api_key).toBe('sk-test');
    expect(result!.base_url).toBe('https://api.openai.com');
    expect(result!.models).toEqual(['gpt-4o']);
  });

  it('getProviderConfigFromDB handles provider with empty API key', () => {
    saveProvider({ id: 'p8', type: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', enabled: true, isDefault: false, models: [] });
    const result = getProviderConfigFromDB('ollama');
    expect(result).not.toBeNull();
    expect(result!.api_key).toBe('');
    expect(result!.base_url).toBe('http://localhost:11434');
  });

  it('getProviderApiKeyFromDB returns null for non-existent provider', () => {
    expect(getProviderApiKeyFromDB('nonexistent')).toBeNull();
  });

  it('getProviderApiKeyFromDB returns first non-empty key', () => {
    saveProvider({ id: 'p9', type: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', enabled: true, isDefault: false, models: [] });
    saveApiKey('p9', { id: 'k9', name: 'default', key: 'sk-real' });
    expect(getProviderApiKeyFromDB('openai')).toBe('sk-real');
  });

  it('getProviderApiKeyFromDB returns null when all keys are empty', () => {
    saveProvider({ id: 'p10', type: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', enabled: true, isDefault: false, models: [] });
    saveApiKey('p10', { id: 'k10', name: 'default', key: '   ' });
    expect(getProviderApiKeyFromDB('openai')).toBeNull();
  });
});
