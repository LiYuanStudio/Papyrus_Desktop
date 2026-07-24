# Tailwind CSS 使用指南

## 🚀 快速开始

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 查看示例

打开示例组件查看 Tailwind 的实际效果：
- 文件位置：`src/components/TailwindExample.tsx`

---

## 📋 使用规则

### 前缀规则

**所有 Tailwind 类名都必须带 `tw-` 前缀**，以避免与 Arco Design 的类名冲突。

```tsx
// ✅ 正确
<div className="tw-flex tw-p-4 tw-bg-primary" />

// ❌ 错误
<div className="flex p-4 bg-primary" />
```

---

## 🎨 主题颜色

Tailwind 已配置与 Arco Design 相同的 CSS 变量，自动支持深色/浅色模式切换。

### 主要颜色

| Tailwind 类名 | 说明 | Arco 变量 |
|--------------|------|----------|
| `tw-bg-primary` | 主色背景 | `--color-primary` |
| `tw-bg-success` | 成功色背景 | `--color-success` |
| `tw-bg-danger` | 危险色背景 | `--color-danger` |
| `tw-bg-warning` | 警告色背景 | `--color-warning` |

### Arco 背景色

| Tailwind 类名 | 说明 |
|--------------|------|
| `tw-bg-arco-bg-1` | 主背景色 |
| `tw-bg-arco-bg-2` | 次级背景色 |
| `tw-bg-arco-bg-3` | 三级背景色 |

### Arco 文字色

| Tailwind 类名 | 说明 |
|--------------|------|
| `tw-text-arco-text-1` | 主文字色 |
| `tw-text-arco-text-2` | 次要文字色 |
| `tw-text-arco-text-3` | 辅助文字色 |
| `tw-text-arco-text-4` | 禁用文字色 |

### Arco 边框色

| Tailwind 类名 | 说明 |
|--------------|------|
| `tw-border-arco-border-1` | 浅色边框 |
| `tw-border-arco-border-2` | 默认边框 |
| `tw-border-arco-border-hover` | 悬停边框色 |

---

## 🔄 从 style 属性迁移

### 示例 1：布局

```tsx
// Before
<div style={{ 
  display: 'flex', 
  flexDirection: 'column',
  flex: 1, 
  overflow: 'hidden'
}} />

// After
<div className="tw-flex tw-flex-col tw-flex-1 tw-overflow-hidden" />
```

### 示例 2：间距和背景

```tsx
// Before
<div style={{ 
  padding: '16px 24px',
  marginBottom: '8px',
  backgroundColor: 'var(--color-bg-2)',
  borderRadius: '8px'
}} />

// After
<div className="tw-py-4 tw-px-6 tw-mb-2 tw-bg-arco-bg-2 tw-rounded-arco-lg" />
```

### 示例 3：定位和层级

```tsx
// Before
<div style={{ 
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10
}} />

// After
<div className="tw-absolute tw-inset-x-0 tw-top-0 tw-z-10" />
```

---

## 🧩 与 Arco 组件混用

Tailwind 与 Arco Design 组件可以完美混用：

```tsx
import { Button, Card } from '@arco-design/web-react';

function MyComponent() {
  return (
    <Card className="tw-mb-4 tw-shadow-lg">
      <div className="tw-flex tw-gap-4 tw-items-center">
        <Button type="primary">Arco 按钮</Button>
        <span className="tw-px-2 tw-py-1 tw-bg-success tw-text-white tw-rounded">
          Tailwind 标签
        </span>
      </div>
    </Card>
  );
}
```

---

## 📱 响应式设计

使用 Tailwind 的响应式前缀：

```tsx
<div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>
```

断点：
- `sm:` - 640px
- `md:` - 768px
- `lg:` - 1024px
- `xl:` - 1280px

---

## 🌙 深色模式

所有主题颜色都使用 CSS 变量，**自动适配**深色/浅色模式，无需额外处理。

当切换 Arco 主题时（`document.body.setAttribute('arco-theme', 'dark')`），Tailwind 的颜色会自动跟随变化。

---

## ⚙️ 配置文件

### tailwind.config.js

位于 `frontend/tailwind.config.js`，包含：
- `prefix: 'tw-'` - 类名前缀
- `content` - 扫描路径
- `corePlugins.preflight: false` - 禁用浏览器重置

### tailwind.css

位于 `frontend/src/tailwind.css`，包含：
- Tailwind 指令导入
- 主题变量映射
- 自定义工具类

---

## ❓ 常见问题

### Q: 为什么我的 Tailwind 类名不生效？

A: 确保所有类名都带 `tw-` 前缀，例如 `tw-flex` 而不是 `flex`。

### Q: 如何添加自定义颜色？

A: 在 `tailwind.css` 中的 `@theme` 部分添加新的 CSS 变量。

### Q: 可以和原来的 CSS 文件共存吗？

A: 可以！现有 CSS 文件完全不受影响，可以逐步迁移。

### Q: 深色模式需要额外配置吗？

A: 不需要。Tailwind 配置的颜色都使用 Arco 的 CSS 变量，会自动跟随主题变化。

---

## 📚 更多资源

- [Tailwind CSS 官方文档](https://tailwindcss.com/docs)
- [Tailwind 类名速查表](https://tailwindcss.com/docs/cheatsheet)
