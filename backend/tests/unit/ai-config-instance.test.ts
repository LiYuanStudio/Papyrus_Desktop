import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';

describe('ai-config-instance', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-ci-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('resetAIConfig runs without throwing', async () => {
    const { resetAIConfig } = await import('../../src/ai/config-instance.js');
    expect(() => resetAIConfig(tempDir)).not.toThrow();
  });

  it('initAIConfig runs without throwing', async () => {
    const { initAIConfig } = await import('../../src/ai/config-instance.js');
    expect(() => initAIConfig()).not.toThrow();
  });

  it('initAIConfig migrates ai_config.json to DB and removes JSON', async () => {
    const { initAIConfig, resetAIConfig } = await import('../../src/ai/config-instance.js');
    const { loadAllProviders, readUiSetting, closeDb } = await import('../../src/db/database.js');

    const aiConfigPath = path.join(tempDir, 'ai_config.json');
    fs.writeFileSync(
      aiConfigPath,
      JSON.stringify(
        {
          providers: {
            deepseek: {
              api_key: 'sk-test-key',
              base_url: 'https://api.deepseek.com',
              models: ['deepseek-chat'],
            },
          },
          current_provider: '',
          current_model: '',
          parameters: { temperature: 0.5 },
          features: { agent_enabled: true },
          log: { log_level: 'INFO' },
        },
        null,
        2
      )
    );

    resetAIConfig(tempDir);
    initAIConfig();

    expect(fs.existsSync(aiConfigPath)).toBe(false);
    expect(loadAllProviders().length).toBe(1);
    expect(readUiSetting('ai.current_provider')).toBe('deepseek');
    expect(readUiSetting('ai.current_model')).toBe('deepseek-chat');
    expect(JSON.parse(readUiSetting('ai.parameters') ?? '{}').temperature).toBe(0.5);
    expect(JSON.parse(readUiSetting('ai.features') ?? '{}').agent_enabled).toBe(true);
    expect(JSON.parse(readUiSetting('ai.log') ?? '{}').log_level).toBe('INFO');

    closeDb();
  });
});
