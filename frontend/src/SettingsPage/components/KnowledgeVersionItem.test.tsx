import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import type { KnowledgeVersion } from '../../api';
import { KnowledgeVersionItem } from './KnowledgeVersionItem';

const translations = {
  versionControl: {
    versionActions: '版本操作',
    createBranchFrom: '从此版本旁开分支',
    restore: '恢复此版本',
    rename: '重命名',
    delete: '删除',
    safetyVersion: '安全快照',
    manualVersion: '手动版本',
    currentVersion: '当前版本',
    currentVersionDeleteHint: '当前版本不能删除',
    currentVersionRestoreHint: '当前版本无需恢复',
    moreActions: '更多操作',
    versionActionsFor: '管理版本：{{name}}',
    versionAriaLabel: '知识库版本：{{name}}',
    contentSummary: '{{notes}} 篇笔记 · {{cards}} 张卡片 · {{files}} 个文件',
  },
};

const version: KnowledgeVersion = {
  id: '12345678-1234-4234-9234-123456789abc',
  branchId: 'main',
  name: '发布前版本',
  description: '完整描述',
  kind: 'manual',
  isHead: true,
  stats: {
    cards: 3,
    notes: 2,
    relations: 1,
    files: 4,
    progressDays: 5,
    sizeBytes: 2048,
  },
  createdAt: 1_700_000_000,
};

// 收窄 JSON 语言包对象，输入未知值，输出可安全索引的普通记录判断。
// 原因：JSON.parse 的结果必须在读取翻译键前进行运行时验证。
// 未使用类型断言：测试也应遵循项目的 unknown 优先规则，避免掩盖损坏语言包。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 静态渲染版本条目，输入可选字段覆盖，输出可断言 HTML。
// 原因：项目未引入 DOM 测试库，服务端标记足以验证状态标签、摘要和可访问名称。
// 未模拟下拉点击：API 行为由后端集成测试覆盖，浏览器交互由 Playwright 覆盖。
function renderVersion(overrides: Partial<KnowledgeVersion> = {}): string {
  const instance = i18next.createInstance();
  void instance.init({
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    resources: { 'zh-CN': { translation: translations } },
    initAsync: false,
  });

  return renderToStaticMarkup(
    <I18nextProvider i18n={instance}>
      <KnowledgeVersionItem
        version={{ ...version, ...overrides }}
        disabled={false}
        onCreateBranch={() => undefined}
        onRestore={() => undefined}
        onRename={() => undefined}
        onDelete={() => undefined}
      />
    </I18nextProvider>,
  );
}

describe('KnowledgeVersionItem', () => {
  it('renders stable version metadata and protected head state', () => {
    const html = renderVersion();

    assert.match(html, /knowledge-version-item-head/);
    assert.match(html, /aria-label="知识库版本：发布前版本"/);
    assert.match(html, />发布前版本</);
    assert.match(html, />手动版本</);
    assert.match(html, />当前版本</);
    assert.match(html, /12345678/);
    assert.match(html, /2 篇笔记 · 3 张卡片 · 4 个文件/);
    assert.match(html, /2\.00 KB/);
    assert.match(html, /aria-label="从此版本旁开分支"/);
    assert.match(html, /aria-label="恢复此版本"[^>]*disabled/);
    assert.match(html, /aria-label="删除"[^>]*disabled/);
  });

  it('distinguishes automatic safety snapshots', () => {
    const html = renderVersion({
      name: '自动保护点',
      kind: 'safety',
      isHead: false,
      description: '',
    });

    assert.match(html, />安全快照</);
    assert.doesNotMatch(html, />当前版本</);
    assert.doesNotMatch(html, /完整描述/);
  });

  it('keeps the settings entry and all locale contracts wired', () => {
    const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
    const settingsSource = fs.readFileSync(
      path.join(sourceRoot, 'SettingsPage', 'SettingsPage.tsx'),
      'utf8',
    );
    assert.match(settingsSource, /key: 'version-control'/);
    assert.match(settingsSource, /VersionControlView/);

    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP']) {
      const raw: unknown = JSON.parse(
        fs.readFileSync(path.join(sourceRoot, 'locales', `${locale}.json`), 'utf8'),
      );
      assert.equal(isRecord(raw), true);
      if (!isRecord(raw) || !isRecord(raw.settings) || !isRecord(raw.versionControl)) {
        throw new Error(`Locale ${locale} is missing settings or versionControl objects`);
      }
      const settings = raw.settings;
      const versionControl = raw.versionControl;
      assert.equal(typeof settings.versionControl, 'string');
      assert.equal(typeof versionControl.title, 'string');
      assert.equal(typeof versionControl.createVersion, 'string');
      assert.equal(typeof versionControl.deleteBranchConfirmContent, 'string');
    }
  });
});
