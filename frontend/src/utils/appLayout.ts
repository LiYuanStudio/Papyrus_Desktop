// 聊天面板可拖拽宽度的闭区间，输入由窗口尺寸计算，输出供恢复值与拖拽共同使用。
// 原因：命名字段比二元元组更清楚地表达上下界，调用端不需要记忆索引含义。
// 未返回裸数组：数组容易把 min/max 顺序写反，也不利于后续增加正文宽度等诊断信息。
export interface ChatWidthBounds {
  max: number;
  min: number;
}

const CHAT_MIN_WIDTH = 280;
const CHAT_MAX_WIDTH = 600;
const MAIN_CONTENT_MIN_WIDTH = 420;

/**
 * 根据窗口和侧边栏宽度计算聊天面板的可拖拽边界。
 * 原因：13 英寸 MacBook 常见窗口宽度下必须优先保留正文可读区域，不能始终允许 600px 聊天栏。
 * 未用固定 CSS max-width：拖拽状态由 React 持有，纯函数边界可同时约束恢复值、resize 与 pointer move。
 */
export function getChatWidthBounds(viewportWidth: number, sidebarWidth: number): ChatWidthBounds {
  const availableWidth = Math.floor(viewportWidth - sidebarWidth - MAIN_CONTENT_MIN_WIDTH);
  return {
    min: CHAT_MIN_WIDTH,
    max: Math.max(CHAT_MIN_WIDTH, Math.min(CHAT_MAX_WIDTH, availableWidth)),
  };
}

/**
 * 把聊天面板宽度限制到当前窗口允许的范围。
 * 原因：从大屏恢复的 localStorage 宽度在小屏上可能挤空主内容，统一夹取能避免布局锁死。
 * 未在每个调用点重复 Math.min/Math.max：集中实现可保证窗口 resize 与拖拽使用完全一致的规则。
 */
export function clampChatWidth(width: number, viewportWidth: number, sidebarWidth: number): number {
  const bounds = getChatWidthBounds(viewportWidth, sidebarWidth);
  return Math.min(bounds.max, Math.max(bounds.min, width));
}
