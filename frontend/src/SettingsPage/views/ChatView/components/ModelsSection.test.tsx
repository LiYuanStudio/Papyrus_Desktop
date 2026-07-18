import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Provider } from '../types';
import ModelsSection from './ModelsSection';

const provider: Provider = {
  id: 'provider-1',
  type: 'openai',
  name: 'OpenAI',
  apiKeys: [{ id: 'key-1', name: 'default', key: '', hasKey: true }],
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  isDefault: true,
  models: [
    {
      id: 'model-chat',
      name: 'Chat Model',
      modelId: 'chat-model',
      enabled: true,
      port: '',
      capabilities: ['text'],
      apiKeyId: 'key-1',
    },
    {
      id: 'model-title',
      name: 'Title Model',
      modelId: 'title-model',
      enabled: true,
      port: '',
      capabilities: ['text'],
      apiKeyId: 'key-1',
    },
  ],
};

const translations: Record<string, string> = {
  'chatView.specialModelHint': '未设置标题模型时使用默认聊天模型。',
  'chatView.default': '默认',
  'chatView.configured': '已配置',
  'chatView.notConfigured': '未配置',
  'chatView.title': '标题',
  'chatView.translation': '翻译',
  'chatView.setAsDefault': '设为默认',
  'chatView.setAsTitleModel': '设为标题模型',
  'chatView.setAsTranslationModel': '设为翻译模型',
  'chatView.edit': '编辑',
  'chatView.confirmDeleteModel': '删除模型？',
};

/**
 * 以服务端静态渲染检查标题模型标记与操作控件。
 * 原因：前端当前没有 DOM 测试库，静态结构足以验证设置页把第三种模型用途传递到卡片。
 * 未模拟点击：保存行为由后端配置测试覆盖，避免为单一按钮引入新的测试依赖。
 */
function renderModelsSection(titleModelId: string): string {
  return renderToStaticMarkup(
    <ModelsSection
      providers={[provider]}
      currentModelId="model-chat"
      titleModelId={titleModelId}
      translationModelId=""
      saveDefaultModel={() => undefined}
      saveTitleModel={() => undefined}
      saveTranslationModel={() => undefined}
      deleteModel={() => undefined}
      openModelModal={() => undefined}
      renderCapabilityIcons={() => null}
      t={(key) => translations[key] ?? key}
    />,
  );
}

describe('ModelsSection title model controls', () => {
  it('marks the selected title model and disables its title action', () => {
    const html = renderModelsSection('model-title');

    assert.match(html, />标题</);
    assert.match(html, /title="设为标题模型"/);
    assert.match(html, /aria-label="设为标题模型"/);
    assert.match(html, /title="设为标题模型"[^>]*disabled/);
    assert.match(html, /未设置标题模型时使用默认聊天模型。/);
  });

  it('keeps title actions enabled when no dedicated title model is selected', () => {
    const html = renderModelsSection('');

    assert.doesNotMatch(html, />标题</);
    assert.match(html, /title="设为标题模型"/);
    assert.doesNotMatch(html, /title="设为标题模型"[^>]*disabled/);
  });
});
