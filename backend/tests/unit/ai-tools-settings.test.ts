import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { SETTINGS_TOOLS } from '../../src/ai/tools/settings.js';
import { resetAIConfig } from '../../src/ai/config-instance.js';
import type { ToolRunContext } from '../../src/ai/tools/types.js';

describe('ai-tools-settings', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  const ctx: ToolRunContext = { logger: null };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-tools-settings-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
    resetAIConfig(tempDir);
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function getTool(name: string) {
    const tool = SETTINGS_TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  describe('get_settings', () => {
    it('returns allowed settings subset', () => {
      const result = getTool('get_settings').runner({}, ctx);
      expect(result.success).toBe(true);
      expect(result.settings).toBeDefined();
      const settings = result.settings as Record<string, unknown>;
      expect(settings.current_model).toBeDefined();
      expect(settings.parameters).toBeDefined();
      expect(settings.features).toBeDefined();
      // providers should NOT be present
      expect(settings.providers).toBeUndefined();
    });
  });

  describe('update_settings', () => {
    it('ignores disallowed paths like providers.api_key', () => {
      const result = getTool('update_settings').runner({
        updates: { 'providers.api_key': 'secret' }
      }, ctx);
      expect(result.success).toBe(true);
      expect((result.applied_keys as string[]).length).toBe(0);
      expect((result.ignored_keys as string[])).toContain('providers.api_key');
    });

    it('safely converts string temperature to number', () => {
      const result = getTool('update_settings').runner({
        updates: { 'parameters.temperature': '0.7' }
      }, ctx);
      expect(result.success).toBe(true);
      expect((result.applied_keys as string[])).toContain('parameters.temperature');
    });

    it('returns message for empty object', () => {
      const result = getTool('update_settings').runner({ updates: {} }, ctx);
      expect(result.success).toBe(true);
      expect(result.message).toContain('没有可更新的字段');
    });

    it('rejects non-object updates', () => {
      const result = getTool('update_settings').runner({ updates: 'not-an-object' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('对象');
    });

    it('rejects null updates', () => {
      const result = getTool('update_settings').runner({ updates: null }, ctx);
      expect(result.success).toBe(false);
    });

    it('updates current_model successfully', () => {
      const result = getTool('update_settings').runner({
        updates: { current_model: 'gpt-test' }
      }, ctx);
      expect(result.success).toBe(true);
      expect((result.applied_keys as string[])).toContain('current_model');
    });
  });
});
