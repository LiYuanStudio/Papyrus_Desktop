/**
 * dateFormat.ts 单元测试
 * 原因：验证日期格式设置读写、四种格式的正确转换。
 * 未使用 Jest/Vitest：前端未配置测试框架，使用 Node.js 内置 test runner + tsx。
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { getDateFormat, setDateFormat, formatDateBySetting, type DateFormat } from './dateFormat.js';

// Mock localStorage
const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  length: 0,
  get length() { return storage.size; },
} as unknown as Storage;

describe('dateFormat', () => {
  beforeEach(() => {
    storage.clear();
  });

  describe('getDateFormat / setDateFormat', () => {
    it('默认返回 yyyy-MM-dd', () => {
      assert.strictEqual(getDateFormat(), 'yyyy-MM-dd');
    });

    it('保存并读取四种有效格式', () => {
      const formats: DateFormat[] = ['yyyy-MM-dd', 'yyyy/MM/dd', 'dd/MM/yyyy', 'MM/dd/yyyy'];
      for (const fmt of formats) {
        setDateFormat(fmt);
        assert.strictEqual(getDateFormat(), fmt);
      }
    });

    it('非法值回退到默认格式', () => {
      storage.set('papyrus_date_format', 'invalid');
      assert.strictEqual(getDateFormat(), 'yyyy-MM-dd');
    });
  });

  describe('formatDateBySetting', () => {
    const sampleDate = new Date(2024, 5, 15); // 2024-06-15

    it('yyyy-MM-dd', () => {
      setDateFormat('yyyy-MM-dd');
      assert.strictEqual(formatDateBySetting(sampleDate), '2024-06-15');
    });

    it('yyyy/MM/dd', () => {
      setDateFormat('yyyy/MM/dd');
      assert.strictEqual(formatDateBySetting(sampleDate), '2024/06/15');
    });

    it('dd/MM/yyyy', () => {
      setDateFormat('dd/MM/yyyy');
      assert.strictEqual(formatDateBySetting(sampleDate), '15/06/2024');
    });

    it('MM/dd/yyyy', () => {
      setDateFormat('MM/dd/yyyy');
      assert.strictEqual(formatDateBySetting(sampleDate), '06/15/2024');
    });

    it('支持秒级时间戳', () => {
      setDateFormat('yyyy-MM-dd');
      const timestamp = Math.floor(sampleDate.getTime() / 1000);
      assert.strictEqual(formatDateBySetting(timestamp), '2024-06-15');
    });

    it('支持 ISO 字符串', () => {
      setDateFormat('yyyy-MM-dd');
      assert.strictEqual(formatDateBySetting('2024-06-15T08:30:00.000Z'), '2024-06-15');
    });

    it('空值返回空字符串', () => {
      assert.strictEqual(formatDateBySetting(null), '');
      assert.strictEqual(formatDateBySetting(''), '');
      assert.strictEqual(formatDateBySetting(undefined as unknown as null), '');
    });

    it('非法日期返回空字符串', () => {
      assert.strictEqual(formatDateBySetting('not-a-date'), '');
    });

    it('补零正确', () => {
      setDateFormat('yyyy-MM-dd');
      assert.strictEqual(formatDateBySetting(new Date(2024, 0, 1)), '2024-01-01');
      assert.strictEqual(formatDateBySetting(new Date(2024, 10, 11)), '2024-11-11');
    });
  });
});
