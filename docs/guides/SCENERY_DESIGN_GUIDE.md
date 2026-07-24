# 窗景功能设计标准

## 概述

窗景功能为应用各界面提供可配置的背景图片和诗句展示。每个界面可以独立配置窗景开关、透明度和图片。

## 设计原则

1. **界面独立配置**: 每个界面（笔记、卷轴、文件库、扩展管理、数据图表）都有独立的窗景配置
2. **简洁模式**: 非开始界面的窗景采用简洁模式，无悬停效果，固定透明度
3. **开始界面例外**: 开始界面保持经典交互模式（悬停显示诗句）
4. **统一管理**: 自定义图片库全局共享，所有界面共用同一套图片

## 实现状态

| 界面 | 状态 | 说明 |
|------|------|------|
| 开始界面 | ✅ 已实现 | 经典模式，悬停显示诗句 |
| 卷轴界面 | ✅ 已实现 | 简洁模式，统计栏窗景 |
| 笔记界面 | ⏳ 空壳 | 配置已预留，待实现 |
| 文件库界面 | ⏳ 空壳 | 配置已预留，待实现 |
| 扩展管理界面 | ⏳ 空壳 | 配置已预留，待实现 |
| 数据图表界面 | ⏳ 空壳 | 配置已预留，待实现 |

## 配置结构

### 单页面窗景配置

```typescript
interface PageSceneryConfig {
  enabled: boolean;   // 是否启用窗景
  image: string;      // 图片路径
  name: string;       // 窗景名称
  opacity: number;    // 遮罩透明度 (0.05 ~ 0.5)
}
```

### 开始页面窗景配置

```typescript
interface StartPageSceneryConfig {
  enabled: boolean;
  image: string;
  name: string;
  // 注意：开始界面不使用透明度，采用渐变遮罩
}
```

## 两种模式对比

| 特性 | 开始界面（经典模式） | 其他界面（简洁模式） |
|------|---------------------|---------------------|
| 配置文件 | `StartPageSceneryConfig` | `PageSceneryConfig` |
| 透明度调节 | ❌ 无（使用渐变遮罩） | ✅ 有（5% ~ 50%） |
| 悬停效果 | ✅ 显示诗句+图片放大 | ❌ 无 |
| 透明度来源 | 固定渐变 | `config.opacity` |
| 设计目标 | 视觉焦点，沉浸体验 | 功能优先，背景装饰 |

## 设置界面布局

```
设置 > 窗景
├── 开始界面
│   ├── 开关
│   └── 图片选择 + [添加图片]按钮（圆角）
│
└── 各界面窗景配置（简洁模式）
    ├── 笔记界面
    │   ├── 开关
    │   ├── 透明度滑块 (5% ~ 50%)
    │   └── 图片选择 + [添加图片]按钮（圆角）
    │
    ├── 卷轴界面
    │   ├── 开关
    │   ├── 透明度滑块 (5% ~ 50%)
    │   └── 图片选择 + [添加图片]按钮（圆角）
    │
    └── ...其他界面
```

## 使用示例

### 在页面中使用窗景（简洁模式）

```tsx
import { usePageScenery } from '../hooks/useScenery';

const MyPage = () => {
  const { config } = usePageScenery('scroll'); // 'notes' | 'scroll' | 'files' | 'extensions' | 'charts'
  
  // 窗景未启用时显示默认背景
  if (!config.enabled) {
    return <div style={{ background: 'var(--color-bg-1)' }}>内容</div>;
  }
  
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* 背景图 */}
      <img
        src={config.image}
        style={{ 
          position: 'absolute', 
          inset: 0, 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover' 
        }}
      />
      {/* 透明度遮罩 */}
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        background: `rgba(255,255,255,${config.opacity})` 
      }} />
      {/* 内容 */}
      <div style={{ position: 'relative', zIndex: 1 }}>内容</div>
    </div>
  );
};
```

## 存储结构

```
localStorage:
├── papyrus_start_page_scenery    # 开始页面配置
├── papyrus_scenery_settings      # 各页面配置 { pageSceneries: Record<PageType, PageSceneryConfig> }
└── papyrus_custom_sceneries      # 自定义图片库 SceneryItem[]
```

## 自定义图片

- 支持网络图片链接
- 支持本地图片路径
- 全局共享，所有界面可用
- 添加按钮样式：圆角 (`borderRadius: '999px'`)

## 默认诗句

```
且将新火试新茶，诗酒趁年华。
—— [宋] 苏轼《望江南·超然台作》
```

## 开发规范

### 添加新的窗景界面

1. 在 `PageType` 中添加新页面 key
2. 在 `defaultPageSceneries` 中添加默认配置
3. 在 `SceneryView` 中添加界面设置卡片
4. 在页面组件中使用 `usePageScenery(pageKey)`

### 修改窗景配置

始终通过 `updateConfig` 方法修改配置，确保自动持久化到 localStorage：

```tsx
const { config, updateConfig } = usePageScenery('notes');

// 修改透明度
updateConfig({ opacity: 0.2 });

// 修改图片
updateConfig({ image: '/new-image.png', name: '新图片' });

// 开关
updateConfig({ enabled: true });
```

## 注意事项

1. 开始界面不受透明度设置影响，保持经典交互
2. 自定义图片添加后立即全局可用
3. 透明度范围限制在 5% ~ 50%，防止文字无法阅读
4. 图片加载失败时显示默认背景色
