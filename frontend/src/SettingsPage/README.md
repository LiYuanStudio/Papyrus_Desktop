# 设置页面

## 概述

设置页面采用模块化架构，按照二级菜单进行拆分，每个设置分类都有自己的视图组件。

## 目录结构

```
SettingsPage/
├── SettingsPage.tsx       # 主入口组件
├── SettingsPage.css       # 全局样式
├── components/
│   ├── SettingsSidebar.tsx   # 可复用的侧边栏组件
│   └── index.ts
└── views/                 # 各设置分类视图
    ├── AppearanceView.tsx    # 外观与窗景
    ├── GeneralView.tsx       # 通用设置
    ├── ChatView.tsx          # 聊天设置
    ├── ToolView.tsx          # 工具设置
    ├── ShortcutsView.tsx     # 快捷键
    ├── AccessibilityView.tsx # 无障碍
    ├── DataView.tsx          # 数据设置
    ├── AboutView.tsx         # 关于
    └── index.ts
```

## 已实现二级菜单的分类

### 1. 外观与窗景 (AppearanceView)
- **外观** - 主题、强调色、字体大小
- **窗景** - 开始界面窗景、各界面窗景配置

### 2. 聊天设置 (ChatView)
- **通用设置** - Agent 模式、时间戳、自动滚动、Enter 发送
- **用户设置** - 用户标识、头像
- **供应商管理** - 添加、编辑、删除 AI 供应商
- **模型管理** - 管理各供应商下的模型
- **自动补全** - 补全开关、二次确认、触发延迟、最大长度
- **模型参数** - Temperature、Top P、Max Tokens

### 3. 通用设置 (GeneralView)
- **基础设置** - 语言选择
- **启动与通知** - 开机自启、托盘设置、复习提醒
- **语言与地区** - 界面语言、日期格式

### 4. 工具设置 (ToolView)
- **工具调用管理** - 审批模式（自动/手动）、白名单工具开关
- **工具分类** - 卡片、笔记、关联、文件库、数据、扩展、设置

### 5. 快捷键 (ShortcutsView)
- **通用快捷键** - 打开聊天、新建笔记、搜索等
- **高级快捷键** - 开发者工具等

### 6. 无障碍 (AccessibilityView)
- **视觉辅助** - 减少动画、高对比度、屏幕阅读器优化、焦点指示器、大光标
- **动画与效果** - 窗口动画控制

### 7. 数据设置 (DataView)
- **备份与恢复** - 创建备份、导出数据、重置数据
- **存储管理** - 本地存储、云同步（即将推出）

### 8. 关于 (AboutView)
- 版本信息、致谢、许可证

## 技术特性

### 深色模式支持
- 使用 CSS 变量 (`var(--color-*)`)
- 通过 `body[arco-theme='dark']` 属性切换
- 自动适配系统主题偏好

### 无障碍支持
- 完整的键盘导航
- ARIA 标签
- 焦点可见性
- 减少动画偏好
- 高对比度模式

### 设计规范
- 边距使用 8 的倍数
- 遵循 Arco Design 设计系统
- 响应式布局
