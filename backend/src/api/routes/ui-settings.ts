import type { FastifyInstance } from 'fastify';
import {
  getUiSettings,
  getSidebarSettings,
  saveUiSettings,
  saveSidebarSettings,
  type ChatPanelSide,
  type UiFontSize,
  type UiLanguage,
  isUiDateFormat,
  type UiSettings,
} from '../../db/database.js';

interface UiSettingsPayload {
  chatPanelSide?: unknown;
  language?: unknown;
  fontSize?: unknown;
  dateFormat?: unknown;
}

interface SidebarSettingsPayload {
  chatPanelSide?: unknown;
}

function isChatPanelSide(value: unknown): value is ChatPanelSide {
  return value === 'left' || value === 'right';
}

function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'zh-CN' || value === 'zh-TW' || value === 'en-US' || value === 'ja-JP';
}

function isUiFontSize(value: unknown): value is UiFontSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

/**
 * 注册 UI 设置路由，暴露语言、字号和侧边栏聊天面板方向。
 * 原因：根级语言和字号配置需要跨刷新持久化，并与其他 UI 偏好共用 SQLite 数据源。
 * 未合并到 AI/日志设置：这是通用界面状态，放入独立路由可避免配置职责混杂。
 */
export default async function uiSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request, reply) => {
    reply.send({ success: true, settings: getUiSettings() });
  });

  fastify.post('/', async (request, reply) => {
    const body = request.body as UiSettingsPayload;
    if (body.chatPanelSide !== undefined && !isChatPanelSide(body.chatPanelSide)) {
      reply.status(400).send({ success: false, error: 'Invalid chatPanelSide' });
      return;
    }
    if (body.language !== undefined && !isUiLanguage(body.language)) {
      reply.status(400).send({ success: false, error: 'Invalid language' });
      return;
    }
    if (body.fontSize !== undefined && !isUiFontSize(body.fontSize)) {
      reply.status(400).send({ success: false, error: 'Invalid fontSize' });
      return;
    }
    if (body.dateFormat !== undefined && !isUiDateFormat(body.dateFormat)) {
      reply.status(400).send({ success: false, error: 'Invalid dateFormat' });
      return;
    }

    const updates: Partial<UiSettings> = {};
    if (body.chatPanelSide !== undefined) updates.chatPanelSide = body.chatPanelSide;
    if (body.language !== undefined) updates.language = body.language;
    if (body.fontSize !== undefined) updates.fontSize = body.fontSize;
    if (body.dateFormat !== undefined) updates.dateFormat = body.dateFormat;

    const settings = saveUiSettings(updates);
    reply.send({ success: true, settings });
  });

  fastify.get('/sidebar', async (_request, reply) => {
    reply.send({ success: true, settings: getSidebarSettings() });
  });

  fastify.post('/sidebar', async (request, reply) => {
    const body = request.body as SidebarSettingsPayload;
    if (!isChatPanelSide(body.chatPanelSide)) {
      reply.status(400).send({ success: false, error: 'Invalid chatPanelSide' });
      return;
    }

    const settings = saveSidebarSettings({ chatPanelSide: body.chatPanelSide });
    reply.send({ success: true, settings });
  });
}
