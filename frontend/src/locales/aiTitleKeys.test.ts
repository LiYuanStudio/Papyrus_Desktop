import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const localeFiles = ['zh-CN.json', 'zh-TW.json', 'en-US.json', 'ja-JP.json'];
const requiredKeys = [
  'sidebar.aiRenameConversation',
  'chatView.setAsTitleModel',
  'chatView.title',
  'chatView.specialModelHint',
  'chatView.titleModelSet',
  'chatHistory.aiRenameSuccess',
  'chatHistory.aiRenameFailed',
];

/**
 * 从未知 JSON 对象中安全读取点分隔的字符串键。
 * 原因：语言包是运行时数据，测试不能假设解析结果始终具有预期结构。
 * 未使用类型断言：逐层对象守卫能在键缺失或结构损坏时返回 undefined。
 */
function readTranslation(value: unknown, dottedKey: string): string | undefined {
  let current = value;
  for (const segment of dottedKey.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      return undefined;
    }
    current = Reflect.get(current, segment);
  }
  return typeof current === 'string' ? current : undefined;
}

describe('AI conversation title locale keys', () => {
  for (const localeFile of localeFiles) {
    it(`${localeFile} contains every title-generation translation`, () => {
      const localePath = path.join(process.cwd(), 'frontend', 'src', 'locales', localeFile);
      const locale = JSON.parse(fs.readFileSync(localePath, 'utf8')) as unknown;

      for (const key of requiredKeys) {
        const translated = readTranslation(locale, key);
        assert.ok(translated?.trim(), `${localeFile} is missing ${key}`);
      }
    });
  }
});
