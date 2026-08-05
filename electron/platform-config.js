const path = require('path');

const MACOS_VIBRANCY = 'under-window';

/**
 * 根据目标平台返回窗口和 Dock 使用的应用图标文件名。
 * 原因：Windows、macOS 与 Linux 的窗口资源格式不同，集中选择能避免主进程与测试出现分叉。
 * 未在调用处内联三元表达式：窗口、托盘和诊断逻辑都需要平台图标，重复判断容易漏掉 macOS。
 */
function getWindowIconName(platform) {
  switch (platform) {
    case 'win32':
      return 'icon.ico';
    case 'darwin':
      return 'icon.icns';
    default:
      return 'icon.png';
  }
}

/**
 * 根据目标平台返回系统托盘图标文件名。
 * 原因：macOS 菜单栏需要可缩放为 Template Image 的 PNG，而 `.icns` 更适合应用包与 Dock。
 * 未复用窗口图标选择：直接把 `.icns` 交给 Tray 会在浅色/深色菜单栏中产生不一致的缩放与着色。
 */
function getTrayIconName(platform) {
  if (platform === 'darwin') {
    return 'trayTemplate.png';
  }
  return platform === 'win32' ? 'icon.ico' : 'icon.png';
}

/**
 * 生成与平台匹配的 BrowserWindow 外观选项。
 * 原因：macOS 需要保留 traffic lights、原生 vibrancy 与减少透明度偏好，Windows 则继续使用 DWM Acrylic。
 * 未启用 transparent 窗口：透明窗口会改变阴影、缩放边界和全屏行为，原生材质已能实现所需层次。
 */
function getWindowAppearance(platform, appearance = {}) {
  const baseAppearance = {
    frame: false,
    roundedCorners: true,
    titleBarOverlay: false,
  };

  if (platform === 'darwin') {
    const backgroundColor = appearance.darkMode ? '#1e1e22' : '#f7f7f5';
    return {
      ...baseAppearance,
      frame: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 17 },
      backgroundColor,
      ...(appearance.reduceTransparency
        ? {}
        : {
            vibrancy: MACOS_VIBRANCY,
            visualEffectState: 'active',
          }),
    };
  }

  return {
    ...baseAppearance,
    titleBarStyle: 'hidden',
    backgroundMaterial: platform === 'win32' ? 'acrylic' : undefined,
  };
}

/**
 * 生成开发态或打包态的后端启动命令。
 * 原因：开发态依赖本地 tsx，打包态必须让 Electron 自身以 Node 模式执行 resources 内的编译产物。
 * 未依赖 shell 命令字符串：显式 command/args/cwd 能正确处理 macOS 应用路径中的空格并降低注入风险。
 */
function getBackendLaunchInfo(options) {
  const platformPath = options.platform === 'win32' ? path.win32 : path.posix;
  if (options.isDevMode) {
    return {
      command: options.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['tsx', 'watch', 'src/api/server.ts'],
      cwd: platformPath.join(options.appRoot, 'backend'),
    };
  }

  return {
    command: options.processExecPath,
    args: [platformPath.join(options.resourcesPath, 'backend', 'dist', 'api', 'server.js')],
    cwd: platformPath.join(options.resourcesPath, 'backend'),
  };
}

module.exports = {
  MACOS_VIBRANCY,
  getBackendLaunchInfo,
  getTrayIconName,
  getWindowAppearance,
  getWindowIconName,
};
