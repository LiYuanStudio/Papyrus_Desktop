import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import type { ChatSession } from '../api';
import { SidebarChatHistory } from './SidebarChatHistory';

const translations = {
  common: {
    delete: '删除',
  },
  sidebar: {
    chatHistory: '历史对话',
    loadingChatHistory: '正在加载对话…',
    noChatHistory: '暂无历史对话',
    openConversation: '打开对话：{{title}}',
    renameConversation: '重命名对话',
    deleteConversation: '删除对话',
    confirmDeleteConversation: '确定删除对话“{{title}}”吗？',
  },
};

const sessions: ChatSession[] = [
  {
    id: 'session-1',
    title: '第一条对话',
    model: 'gpt-test',
    provider: 'openai',
    isActive: true,
    messageCount: 2,
    createdAt: 1,
    updatedAt: 2,
  },
];

/**
 * 将历史组件渲染为稳定 HTML，供无浏览器的结构测试断言。
 * 原因：项目尚未引入 DOM 测试库，服务端渲染足以覆盖收起入口和管理控件是否存在。
 * 未模拟点击：交互副作用由浏览器验证覆盖，避免仅为一个组件增加新的测试依赖。
 */
function renderHistory(collapsed: boolean): string {
  const instance = i18next.createInstance();
  void instance.init({
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    resources: { 'zh-CN': { translation: translations } },
    initAsync: false,
  });

  return renderToStaticMarkup(
    <I18nextProvider i18n={instance}>
      <SidebarChatHistory
        collapsed={collapsed}
        sessions={sessions}
        loading={false}
        activeSessionId="session-1"
        onSelectSession={() => undefined}
        onRenameSession={async () => true}
        onDeleteSession={async () => true}
      />
    </I18nextProvider>,
  );
}

describe('SidebarChatHistory', () => {
  it('侧边栏收起时保留历史入口', () => {
    const html = renderHistory(true);

    assert.match(html, /sidebar-chat-history-trigger/);
    assert.match(html, /aria-label="历史对话"/);
    assert.match(html, /aria-expanded="false"/);
  });

  it('侧边栏展开时显示会话及管理操作', () => {
    const html = renderHistory(false);

    assert.match(html, /第一条对话/);
    assert.match(html, /sidebar-chat-history-item-active/);
    assert.doesNotMatch(html, /sidebar-chat-history-active-dot/);
    assert.match(html, /aria-label="重命名对话"/);
    assert.match(html, /aria-label="删除对话"/);
    assert.match(html, /sidebar-chat-history-action-danger/);
    assert.doesNotMatch(html, /sidebar-chat-history-action-danger-confirming/);
    assert.doesNotMatch(html, />删除<\/span>/);
  });
});
