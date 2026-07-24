const MACOS_MENU_ACTIONS = Object.freeze({
  FIND: 'find',
  HELP: 'help',
  IMPORT_TEXT: 'import-text',
  NEW_CARD: 'new-card',
  NEW_NOTE: 'new-note',
  PREFERENCES: 'preferences',
  TOGGLE_CHAT: 'toggle-chat',
  TOGGLE_SIDEBAR: 'toggle-sidebar',
});

/**
 * 向已选定窗口投递原生菜单动作，并在 renderer 尚未完成加载时排队到一次性 load 事件。
 * 原因：macOS 关闭最后一个窗口后仍保留应用，Dock 的“新建”需要重建窗口后再执行用户动作。
 * 未在加载阶段立即发送 IPC：webContents 不会为尚未注册的 React listener 缓存事件。
 */
function dispatchRendererMenuAction(targetWindow, action) {
  const deliverAction = () => {
    if (targetWindow.isDestroyed()) {
      return;
    }
    if (targetWindow.isMinimized()) {
      targetWindow.restore();
    }
    targetWindow.show();
    targetWindow.focus();
    targetWindow.webContents.send('menu:action', action);
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', deliverAction);
    return;
  }
  deliverAction();
}

/**
 * 创建 macOS 原生应用菜单模板，并把业务动作转发给当前 renderer。
 * 原因：Command 快捷键和 Application/File/View/Window 菜单应由系统菜单栏承载，才能符合 macOS 交互预期。
 * 未在主进程复制页面业务：菜单只发送稳定动作名，实际路由和新建逻辑仍由 React 的唯一业务入口处理。
 */
function createMacApplicationMenuTemplate(options) {
  const send = (action) => () => options.sendAction(action);
  const viewSubmenu = [
    {
      label: 'Toggle Sidebar',
      accelerator: 'Control+Command+S',
      click: send(MACOS_MENU_ACTIONS.TOGGLE_SIDEBAR),
    },
    {
      label: 'Toggle AI Chat',
      accelerator: 'Alt+Command+I',
      click: send(MACOS_MENU_ACTIONS.TOGGLE_CHAT),
    },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  if (options.isDevMode) {
    viewSubmenu.splice(3, 0, { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' });
  }

  return [
    {
      label: options.appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'Command+,',
          click: send(MACOS_MENU_ACTIONS.PREFERENCES),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'Command+N',
          click: send(MACOS_MENU_ACTIONS.NEW_NOTE),
        },
        {
          label: 'New Card',
          accelerator: 'Shift+Command+N',
          click: send(MACOS_MENU_ACTIONS.NEW_CARD),
        },
        { type: 'separator' },
        {
          label: 'Import Cards from Text…',
          accelerator: 'Shift+Command+I',
          click: send(MACOS_MENU_ACTIONS.IMPORT_TEXT),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'Command+F',
          click: send(MACOS_MENU_ACTIONS.FIND),
        },
      ],
    },
    {
      label: 'View',
      submenu: viewSubmenu,
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Papyrus Help',
          click: send(MACOS_MENU_ACTIONS.HELP),
        },
      ],
    },
  ];
}

/**
 * 创建 Windows/Linux 的最小应用菜单模板。
 * 原因：无原生菜单栏的平台仍需要 Electron role 提供可靠的剪贴板和撤销快捷键。
 * 未复制自绘 File 菜单：非 macOS 的文件操作继续由 renderer 标题栏展示，避免出现两套可见入口。
 */
function createDesktopApplicationMenuTemplate() {
  return [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];
}

module.exports = {
  MACOS_MENU_ACTIONS,
  createDesktopApplicationMenuTemplate,
  createMacApplicationMenuTemplate,
  dispatchRendererMenuAction,
};
