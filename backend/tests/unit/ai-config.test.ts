import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AIConfig } from '../../src/ai/config.js';
import { closeDb, writeUiSetting } from '../../src/db/database.js';

describe('AIConfig', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
  });

  afterEach(() => {
    closeDb();
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should create default config when no settings exist in DB', () => {
    const config = new AIConfig(tempDir);
    expect(config.config.current_provider).toBe('');
    expect(config.config.current_model).toBe('');
    // providers are no longer hardcoded; database is the source of truth
    expect(config.config.providers).toEqual({});
    expect(config.config.parameters.temperature).toBe(0.7);
  });

  it('should persist config to DB and reload', () => {
    const config1 = new AIConfig(tempDir);
    config1.config.current_provider = 'openai';
    config1.config.current_model = 'gpt-4o';
    config1.config.parameters.temperature = 0.5;
    config1.config.features.agent_enabled = true;
    config1.saveConfig();

    // Reload from DB
    const config2 = new AIConfig(tempDir);
    expect(config2.config.current_provider).toBe('openai');
    expect(config2.config.current_model).toBe('gpt-4o');
    expect(config2.config.parameters.temperature).toBe(0.5);
    expect(config2.config.features.agent_enabled).toBe(true);
  });

  it('should persist translation model config and resolve with fallback', () => {
    const config1 = new AIConfig(tempDir);
    config1.config.current_provider = 'openai';
    config1.config.current_model = 'gpt-4o';
    config1.config.translation_provider = 'deepseek';
    config1.config.translation_model = 'deepseek-chat';
    config1.saveConfig();

    const config2 = new AIConfig(tempDir);
    expect(config2.config.translation_provider).toBe('deepseek');
    expect(config2.config.translation_model).toBe('deepseek-chat');
    expect(config2.hasTranslationTarget()).toBe(true);
    expect(config2.resolveTranslationTarget()).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
    // 已配置完整翻译目标时，忽略聊天 fallback model
    expect(config2.resolveTranslationTarget('gpt-4o-mini')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    });

    config2.config.translation_provider = '';
    config2.config.translation_model = '';
    expect(config2.hasTranslationTarget()).toBe(false);
    expect(config2.resolveTranslationTarget()).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    });
    // 未配置翻译目标时，使用请求侧 fallback（fresh-provider / 聊天内存选中）
    expect(config2.resolveTranslationTarget('gpt-4o-mini')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('should persist title model config and resolve complete pairs with chat fallback', () => {
    const config1 = new AIConfig(tempDir);
    config1.config.current_provider = 'openai';
    config1.config.current_model = 'gpt-4o';
    config1.config.title_provider = 'deepseek';
    config1.config.title_model = 'deepseek-chat';
    config1.saveConfig();

    const config2 = new AIConfig(tempDir);
    expect(config2.config.title_provider).toBe('deepseek');
    expect(config2.config.title_model).toBe('deepseek-chat');
    expect(config2.hasTitleTarget()).toBe(true);
    expect(config2.resolveTitleTarget()).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    });

    config2.config.title_provider = '';
    config2.config.title_model = '';
    expect(config2.hasTitleTarget()).toBe(false);
    expect(config2.resolveTitleTarget()).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('should not mix title provider with the current chat model when the pair is incomplete', () => {
    const config = new AIConfig(tempDir);
    config.config.current_provider = 'openai';
    config.config.current_model = 'gpt-4o';
    config.config.title_provider = 'deepseek';
    config.config.title_model = '';

    expect(config.hasTitleTarget()).toBe(false);
    expect(config.resolveTitleTarget()).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('should not mix translation_provider with current_model when pair incomplete', () => {
    const config = new AIConfig(tempDir);
    config.config.current_provider = 'openai';
    config.config.current_model = 'gpt-4o';
    config.config.translation_provider = 'deepseek';
    config.config.translation_model = '';
    expect(config.hasTranslationTarget()).toBe(false);
    expect(config.resolveTranslationTarget()).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('getMaskedConfig should return empty providers', () => {
    const config = new AIConfig(tempDir);
    const masked = config.getMaskedConfig();
    expect(masked.providers).toEqual({});
    expect(masked.current_provider).toBe('');
  });

  it('getProviderConfig should read from DB', () => {
    const config = new AIConfig(tempDir);
    config.config.current_provider = 'nonexistent';
    // Provider not in DB should throw
    expect(() => config.getProviderConfig()).toThrow('未知 provider');
  });

  it('setLogConfig should persist to DB', () => {
    const config1 = new AIConfig(tempDir);
    config1.setLogConfig({
      log_dir: '/custom/logs',
      log_level: 'ERROR',
      max_log_files: 5,
      log_rotation: true,
    });

    const config2 = new AIConfig(tempDir);
    expect(config2.config.log.log_dir).toBe('/custom/logs');
    expect(config2.config.log.log_level).toBe('ERROR');
    expect(config2.config.log.max_log_files).toBe(5);
    expect(config2.config.log.log_rotation).toBe(true);
  });

 it('should normalize invalid parameters on load', () => {
    const configFile = path.join(tempDir, 'ai_config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      current_provider: 'openai',
      current_model: 'gpt-3.5-turbo',
      parameters: {
        temperature: 'invalid',
        max_tokens: 'also-invalid',
      },
    }), 'utf8');

    const config = new AIConfig(tempDir);
    expect(config.config.parameters.temperature).toBe(0.7);
    expect(config.config.parameters.max_tokens).toBe(2000);
  });

 it('should fallback to default provider when current_provider is invalid', () => {
    const configFile = path.join(tempDir, 'ai_config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      providers: {
        moonshot: { api_key: '', base_url: 'https://api.moonshot.cn/v1', models: ['kimi-k2.5'] },
      },
      current_provider: 'nonexistent-provider',
      current_model: 'gpt-3.5-turbo',
      parameters: {},
      features: {},
      log: {},
    }), 'utf8');

    const config = new AIConfig(tempDir);
    expect(config.config.current_provider).toBe('');
  });

 it('should preserve current_provider/current_model when providers field is empty (DB-managed)', () => {
    writeUiSetting('ai.current_provider', 'user-custom-provider');
    writeUiSetting('ai.current_model', 'user-custom-model');

    const config = new AIConfig(tempDir);
    expect(config.config.current_provider).toBe('user-custom-provider');
    expect(config.config.current_model).toBe('user-custom-model');
  });
  describe('edge cases', () => {
    it('isPrivateUrl blocks private IP ranges', async () => {
     const { isPrivateUrl } = await import('../../src/ai/config.js');
      expect(isPrivateUrl('http://127.0.0.1:11434')).toBe(true);
      expect(isPrivateUrl('http://localhost:8080')).toBe(true);
      expect(isPrivateUrl('http://192.168.1.1')).toBe(true);
      expect(isPrivateUrl('http://10.0.0.1')).toBe(true);
      expect(isPrivateUrl('http://172.16.0.1')).toBe(true);
      expect(isPrivateUrl('http://169.254.1.1')).toBe(true);
      expect(isPrivateUrl('http://0.0.0.0')).toBe(true);
      expect(isPrivateUrl('http://public.com')).toBe(false);
    });
  });
});
