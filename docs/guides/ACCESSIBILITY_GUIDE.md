# Papyrus 前端无障碍开发指南

> **目标**：让 Papyrus 对所有用户都可访问，包括使用屏幕阅读器、键盘导航或有其他辅助需求的用户。

---

## 📋 目录

- [核心原则](#核心原则)
- [快速检查清单](#快速检查清单)
- [组件开发规范](#组件开发规范)
- [常见场景示例](#常见场景示例)
- [测试方法](#测试方法)
- [资源链接](#资源链接)

---

## 🎯 核心原则

### 1. 语义化优先

使用正确的 HTML 标签，而非模拟元素：

```tsx
<!-- ❌ 错误：div 模拟按钮 -->
<div className="btn" onClick={handleClick}>点击</div>

<!-- ✅ 正确：使用 button -->
<button className="btn" onClick={handleClick}>点击</button>
```

### 2. 键盘可访问

所有交互功能必须可通过键盘完成：

- `Tab` / `Shift+Tab` - 在可聚焦元素间导航
- `Enter` / `Space` - 激活按钮或链接
- `Escape` - 关闭模态框或菜单
- `Arrow Keys` - 在列表或菜单中导航

### 3. 屏幕阅读器友好

为视觉内容提供文字替代：

```tsx
<!-- 图片 -->
<img src="scenery.jpg" alt="春日樱花庭院景色" />

<!-- 图标按钮 -->
<button aria-label="关闭对话框">
  <IconClose />
</button>

<!-- 当前页面标记 -->
<a href="/notes" aria-current="page">笔记</a>
```

### 4. 焦点可见

永远不要移除 `:focus-visible` 样式：

```css
/* ✅ 正确：自定义焦点样式 */
button:focus-visible {
  outline: 2px solid #206CCF;
  outline-offset: 2px;
}

/* ❌ 错误：完全移除焦点样式 */
button:focus {
  outline: none;
}
```

---

## ✅ 快速检查清单

提交代码前，请确认以下项目：

### 基础检查

- [ ] 所有 `<img>` 都有有意义的 `alt` 文本
- [ ] 所有按钮都使用 `<button>` 标签（不是 `div` 或 `span`）
- [ ] 所有链接都使用 `<a>` 标签
- [ ] 表单输入都有关联的 `<label>` 或 `aria-label`
- [ ] 没有空的 `href` 属性（`href="#"` 应避免）

### 进阶检查

- [ ] 页面有正确的 `<html lang="zh-CN">` 语言设置
- [ ] 动态内容更新使用 `aria-live` 通知
- [ ] 模态框有焦点陷阱（focus trap）
- [ ] **颜色对比度 ≥ 7:1（小文本）或 ≥ 4.5:1（大文本）—— WCAG AAA 级**
- [ ] 支持 `prefers-reduced-motion` 动画偏好

---

## 🧩 组件开发规范

### 按钮（Button）

```tsx
// ✅ 推荐：使用 Arco Design 的 Button 组件
import { Button } from '@arco-design/web-react';

<Button type="primary" onClick={handleClick}>
  保存
</Button>

// ✅ 自定义按钮：确保语义化和键盘支持
<button 
  className="custom-btn"
  onClick={handleClick}
  disabled={isLoading}
  aria-busy={isLoading}
>
  {isLoading ? '保存中...' : '保存'}
</button>
```

### 卡片/列表项（Card/List Item）

当整个卡片可点击时：

```tsx
// ✅ 方法 1：使用 button 包裹（推荐）
<button className="card-button" onClick={handleClick}>
  <h3>{title}</h3>
  <p>{description}</p>
</button>

// ✅ 方法 2：使用 div + 键盘事件
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
  aria-label={`打开 ${title}`}
>
  <h3>{title}</h3>
  <p>{description}</p>
</div>
```

### 表单输入（Form Input）

```tsx
// ✅ 使用 label 关联
<label htmlFor="note-title">笔记标题</label>
<input 
  id="note-title"
  type="text"
  value={title}
  onChange={handleChange}
  aria-required="true"
/>

// ✅ 或使用 aria-label
<input
  type="text"
  aria-label="搜索笔记"
  placeholder="搜索..."
  value={query}
  onChange={handleChange}
/>

// ✅ 错误提示关联
<input
  id="email"
  type="email"
  aria-invalid={hasError}
  aria-describedby={hasError ? 'email-error' : undefined}
/>
{hasError && (
  <span id="email-error" role="alert">
    请输入有效的邮箱地址
  </span>
)}
```

### 导航菜单（Navigation）

```tsx
<nav aria-label="主导航">
  <ul>
    <li>
      <a 
        href="/start" 
        aria-current={isActive ? 'page' : undefined}
      >
        开始
      </a>
    </li>
    <li>
      <a 
        href="/notes"
        aria-current={isActive ? 'page' : undefined}
      >
        笔记
      </a>
    </li>
  </ul>
</nav>
```

### 模态框/对话框（Modal/Dialog）

```tsx
function Modal({ isOpen, onClose, title, children }) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 焦点管理
  useEffect(() => {
    if (isOpen) {
      const firstFocusable = modalRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable as HTMLElement)?.focus();
    }
  }, [isOpen]);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={modalRef}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose}>关闭</button>
    </div>
  );
}
```

### 动态通知（Notification）

```tsx
// 在 App 根组件添加 aria-live 区域
function App() {
  return (
    <>
      {/* 主要应用内容 */}
      <main id="main-content">...</main>
      
      {/* 屏幕阅读器通知区域 */}
      <div 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </>
  );
}

// 使用方式
const [announcement, setAnnouncement] = useState('');

// 当需要通知用户时
setAnnouncement('已保存 5 张卡片');
```

---

## 📚 常见场景示例

### 场景 1：图标按钮

```tsx
// ❌ 错误：屏幕阅读器不知道这是什么
<button onClick={handleDelete}>
  <IconDelete />
</button>

// ✅ 正确：添加 aria-label
<button 
  onClick={handleDelete}
  aria-label="删除笔记"
>
  <IconDelete aria-hidden="true" />
</button>
```

### 场景 2：自定义复选框

```tsx
// ❌ 错误：无法被屏幕阅读器识别
<div className="checkbox" onClick={toggle}>
  {checked && <IconCheck />}
</div>

// ✅ 正确：使用原生 input + 自定义样式
<label className="checkbox-label">
  <input
    type="checkbox"
    checked={checked}
    onChange={toggle}
    className="visually-hidden"
  />
  <span className="checkbox-custom" aria-hidden="true">
    {checked && <IconCheck />}
  </span>
  <span>同意条款</span>
</label>
```

### 场景 3：加载状态

```tsx
// ✅ 按钮加载状态
<button 
  disabled={isLoading}
  aria-busy={isLoading}
  aria-label={isLoading ? '正在保存' : '保存'}
>
  {isLoading ? <Spinner /> : '保存'}
</button>

// ✅ 页面加载状态
<div role="status" aria-live="polite">
  <Spinner />
  <span>加载中...</span>
</div>
```

### 场景 4：Skip Link

在 `App.tsx` 中添加：

```tsx
function App() {
  return (
    <>
      {/* Skip Link - 键盘用户快速导航到主内容 */}
      <a 
        href="#main-content" 
        className="skip-link"
      >
        跳转到主内容
      </a>
      
      <main id="main-content" tabIndex={-1}>
        {/* 页面内容 */}
      </main>
    </>
  );
}
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
```

---

## 🧪 测试方法

### 1. 键盘测试

断开鼠标，仅用键盘操作：

1. 按 `Tab` 遍历所有可交互元素
2. 确认焦点顺序符合视觉顺序
3. 确认每个按钮都能用 `Enter` 或 `Space` 激活
4. 确认模态框能用 `Escape` 关闭
5. 确认有视觉焦点指示器

### 2. 屏幕阅读器测试

使用 NVDA（Windows）或 VoiceOver（macOS）：

```bash
# Windows - 安装 NVDA
# https://www.nvaccess.org/download/

# macOS - 启用 VoiceOver
# Cmd + F5 或系统设置 > 辅助功能 > 旁白
```

测试步骤：
1. 戴上耳机或关闭显示器
2. 尝试完成核心任务（创建笔记、复习卡片等）
3. 检查是否所有信息都能被正确朗读

### 3. 自动化测试

使用 axe DevTools 浏览器插件：

```bash
# Chrome/Edge 扩展商店搜索 "axe DevTools"
# 打开开发者工具 > axe DevTools > Scan
```

### 4. 对比度检查（WCAG AAA 级）

本项目要求 **WCAG 2.1 AAA 级**对比度标准：

| 文本类型 | 定义 | 对比度要求 |
|---------|------|-----------|
| 小文本 | < 19px 粗体 或 < 24px 常规 | **≥ 7:1** |
| 大文本 | ≥ 19px 粗体 或 ≥ 24px 常规 | **≥ 4.5:1** |

**检查工具：**
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Stark 插件](https://www.getstark.co/)（Figma/浏览器）

**Papyrus 安全色值：**
- 小文本（14px, 16px）：使用 `--color-text-1` 或 `--color-text-2`（调整后）
- 大文本（20px, 24px, 40px）：可以使用 `--color-text-3`

### 5. 验证清单（发布前）

**自动化**
- Lighthouse Accessibility ≥ 95
- axe DevTools：无 Serious / Critical

**键盘**
- Skip Link、侧边栏、页面切换均可仅用键盘完成
- 焦点可见（蓝色边框 + offset），顺序符合视觉顺序
- 模态框可用 `Escape` 关闭

**屏幕阅读器**
- NVDA / VoiceOver 能正确朗读页面标题、侧边栏、`aria-current`、设置变更（`aria-live`）

**设置面板**（设置 → 无障碍）
- 焦点指示器、屏幕阅读器优化、大光标、高对比度、阅读增强、完全禁用动画按预期生效

**缩放**
- 浏览器缩放到 200% 时布局仍可用

相关用户说明见 [无障碍设置](A11Y_SETTINGS.md)。

---

## 🔧 实用工具类

### CSS 隐藏但保持可访问

```css
/* 对屏幕阅读器可见，对视觉用户隐藏 */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### 焦点可见样式

```css
/* 全局焦点样式 */
:focus-visible {
  outline: 2px solid #206CCF;
  outline-offset: 2px;
}

/* 对鼠标用户隐藏焦点 */
:focus:not(:focus-visible) {
  outline: none;
}
```

### 减少动画偏好

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## ⚙️ 无障碍设置

Papyrus 提供了专门的无障碍设置面板（设置 → 无障碍）：

| 设置项 | 功能 |
|--------|------|
| **减少动画** | 减弱界面动画，适合对动画敏感的用户 |
| **高对比度** | 增强文字对比度至 AAA 级标准 |
| **屏幕阅读器优化** | 优化 ARIA 标签和朗读体验 |
| **焦点指示器** | 始终显示清晰的键盘焦点高亮 |
| **大光标** | 放大鼠标指针，提高可见度 |

**字体大小**调整位于：设置 → 外观 → 字体大小

---

## 📖 资源链接

### 中文资源

- [W3C WAI 中文资源](https://www.w3.org/WAI/translations/zh-hans/)
- [Web 无障碍指南 - MDN](https://developer.mozilla.org/zh-CN/docs/Web/Accessibility)
- [前端无障碍最佳实践](https://a11y.baidu.com/guide/)

### 英文资源

- [WCAG 2.1 标准](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA 创作实践](https://www.w3.org/WAI/ARIA/apg/)
- [a11y Project](https://www.a11yproject.com/)

### 工具

- [axe DevTools](https://www.deque.com/axe/devtools/)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/)（Chrome 内置）
- [WAVE](https://wave.webaim.org/)

---

## 🆘 需要帮助？

如果你在开发中遇到无障碍问题：

1. 查阅本指南的**常见场景示例**
2. 参考 [ARIA 创作实践](https://www.w3.org/WAI/ARIA/apg/patterns/) 的组件模式
3. 在团队群组中提问

---

**最后更新**：2026-07-10  
**维护者**：Papyrus 开发团队
