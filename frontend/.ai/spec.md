# Papyrus Frontend 技术规范

## 技术栈

- React 19 + TypeScript
- Arco Design (字节跳动组件库 v2.66)
- Vite 5 开发构建
- Fastify 后端 API (`/api/*`)

## 代码规范

### 组件写法

- 箭头函数组件 + `export default`
- 分号结尾
- 不使用 `React.FC`，直接 `const Comp = () => {}`

```tsx
import { Button } from '@arco-design/web-react';

const MyComponent = () => {
  return <Button type="primary">OK</Button>;
};

export default MyComponent;
```

### 样式规范

- 每个组件对应一个同名 CSS 文件（`Comp.tsx` → `Comp.css`）
- 颜色使用 Arco CSS 变量，不硬编码：
  - 背景：`var(--color-bg-1)`
  - 文字：`var(--color-text-1)` / `var(--color-text-2)` / `var(--color-text-3)`
  - 边框：`var(--color-border-2)` / `var(--color-border-3)`
  - 填充：`var(--color-fill-2)`
  - 主色：`var(--primary-6)`
- 品牌蓝：`rgb(32, 108, 207)`（hover/选中状态）
- 字体继承 Arco 全局设置，不自定义 `font-family`
- 间距使用 8px 倍数

### 国际化

- `ConfigProvider` 包裹根组件，locale 使用 `zh-CN`

```tsx
import { ConfigProvider } from '@arco-design/web-react';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';

<ConfigProvider locale={zhCN}>
  <App />
</ConfigProvider>
```

### React 19 适配

- 入口必须引入适配器：

```tsx
import '@arco-design/web-react/es/_util/react-19-adapter';
```

## 布局结构

```
┌─────────────────────────────────────────┐
│ TitleBar (40px)                         │
│ Logo | 文件 编辑 | 搜索栏 | 最小/最大/关闭 │
├────┬────────────────────────────────────┤
│    │                                    │
│ S  │         内容区域                    │
│ i  │                                    │
│ d  │                                    │
│ e  │                                    │
│ b  │                                    │
│ a  │                                    │
│ r  │                                    │
│    │                                    │
│48px│                                    │
├────┴────────────────────────────────────┤
│ StatusBar (24px)                        │
└─────────────────────────────────────────┘
```

- 画布固定 1440×900
- 顶栏 40px，纯白背景，底部 1px 边框
- 侧边栏 48px，可展开至 160px，右侧 1px 边框
- 底部状态栏 24px，顶部 1px 边框

## 侧边栏图标（从上到下）

| 图标 | 名称 | 说明 |
|------|------|------|
| IconNav | 侧边栏 | 点击展开/收起 |
| IconPlayArrow | 开始 | |
| IconFolder | 闪卡 | |
| IconMindMapping | 结构笔记 | |
| IconCommon | 扩展 | |
| --- | --- | flex 撑开 |
| Avatar | 用户 | 蓝底白字 "P" |
| IconLock/Unlock | 锁定编辑 | 点击切换 |
| IconSettings | 设置 | |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/review/next | 获取下一张待复习卡片 |
| POST | /api/review/{card_id}/rate | 评分 (grade: 1/2/3) |
| GET | /api/cards | 列出所有卡片 |
| POST | /api/cards | 创建卡片 (q, a) |
| DELETE | /api/cards/{card_id} | 删除卡片 |
| POST | /api/import/txt | 批量导入 TXT |

## Vite 配置

- 开发端口：5173
- API 代理：`/api` → `http://127.0.0.1:8000`

## 当前组件调用汇总

### main.tsx — 协议引入

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from '@arco-design/web-react';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';

import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
```

### App.tsx

```tsx
import { useState } from 'react';
// 自定义组件
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
```

### TitleBar.tsx — Arco 组件

```tsx
import { Input, Button, Space, Menu, Dropdown } from '@arco-design/web-react';
import { IconMinus, IconExpand, IconClose, IconSearch } from '@arco-design/web-react/icon';
```

使用：
- `Dropdown` + `Menu` / `Menu.Item`：Logo 点击弹出菜单
- `Button type="text"`：文件、编辑菜单项
- `Space`：菜单项容器
- `Input` + `IconSearch`：搜索栏（prefix 图标）
- `IconMinus` / `IconExpand` / `IconClose`：窗口控制按钮

### Sidebar.tsx — Arco 组件

```tsx
import { Tooltip, Avatar } from '@arco-design/web-react';
import {
  IconNav, IconPlayArrow, IconCommon, IconFolder,
  IconMindMapping, IconSettings, IconLock, IconUnlock
} from '@arco-design/web-react/icon';
```

使用：
- `Tooltip position="right" mini`：收起时图标悬浮提示
- `Avatar size={24}`：用户头像
- 各 Icon 组件：侧边栏功能图标

### StatusBar.tsx

当前为空壳，无 Arco 组件调用。