// renderer 使用的稳定平台联合类型，输入来自 Electron preload，输出用于 CSS 与交互分支。
// 原因：产品层只关心四种明确运行环境，联合类型可让 switch 保持穷尽检查。
// 未直接传播 NodeJS.Platform：其中包含当前应用不支持且不应误判为原生桌面的取值。
export type AppPlatform = 'linux' | 'macos' | 'web' | 'windows';

// 主进程提供的系统外观快照，包含深色模式和透明度无障碍偏好。
// 原因：两个值必须作为同一时点的快照同步给 CSS，避免原生材质与 renderer 表面不一致。
// 未使用两个独立布尔参数：对象协议更适合 IPC 扩展，也能避免调用端交换参数顺序。
export interface SystemAppearance {
  darkMode: boolean;
  reduceTransparency: boolean;
}

/**
 * 把 Electron 的 Node 平台名转换为 renderer 使用的稳定平台枚举。
 * 原因：CSS、组件和测试只需要产品语义，不应在多处重复理解 `darwin`/`win32`。
 * 未从 userAgent 推断：浏览器预览不具备原生菜单和 traffic lights，误判会隐藏必要的 Web 控件。
 */
export function resolveAppPlatform(rawPlatform?: string): AppPlatform {
  if (rawPlatform === 'darwin') {
    return 'macos';
  }
  if (rawPlatform === 'win32') {
    return 'windows';
  }
  if (rawPlatform === 'linux') {
    return 'linux';
  }
  return 'web';
}

const runtimePlatform = typeof window === 'undefined'
  ? undefined
  : window.electronEnv?.PLATFORM;

export const appPlatform = resolveAppPlatform(runtimePlatform);

/**
 * 将跨平台存储的快捷键文本格式化为当前平台熟悉的视觉符号。
 * 原因：配置继续用 `Ctrl` 表示主修饰键可保持数据兼容，而 macOS 界面应显示 ⌘/⌥/⇧。
 * 未修改持久化值：直接迁移 localStorage 会破坏用户在不同平台同步或回退时的自定义快捷键。
 */
export function formatShortcutForPlatform(
  shortcut: string,
  platform: AppPlatform,
): string {
  if (platform !== 'macos') {
    return shortcut;
  }

  return shortcut
    .split(' ')
    .map((chord) => chord
      .split('+')
      .map((key) => {
        switch (key) {
          case 'Ctrl':
          case 'Meta':
          case 'Command':
            return '⌘';
          case 'Alt':
          case 'Option':
            return '⌥';
          case 'Shift':
            return '⇧';
          default:
            return key;
        }
      })
      .join(''))
    .join(' ');
}

/**
 * 在首个 React render 前把平台写入根元素，供全局设计令牌和组件选择器使用。
 * 原因：同步数据属性不会产生 TitleBar 从 Windows 布局跳到 macOS 布局的首帧闪烁。
 * 未把平台放入 React state：运行期间平台不会变化，state/effect 只会制造一次无意义重渲染。
 */
export function applyPlatformToDom(
  platform: AppPlatform,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.platform = platform;
}

/**
 * 把原生主题的透明度偏好同步到 DOM。
 * 原因：macOS 的“减少透明度”可能在应用运行中切换，CSS 需要稳定属性立即回退为不透明表面。
 * 未只依赖媒体查询：Chromium 对该 macOS 偏好的 CSS 暴露并不稳定，而 Electron 已提供原生状态。
 */
export function applySystemAppearance(
  appearance: SystemAppearance,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.reduceTransparency = appearance.reduceTransparency ? 'true' : 'false';
}
