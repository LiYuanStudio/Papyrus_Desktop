# UI 设计变量

## 主色板

| 名称 | 色值 | 用途 |
|------|------|------|
| 纯白 | `#FFFFFF` | 背景、卡片底色 |
| 浅主蓝 | `#7BC0FC` | 主操作、强调、徽标、悬停态 |
| 深主蓝 | `#206CCF` | 主操作、强调、徽标、悬停态（强调高对比度高识别的场景） |
| 浅绿 | `#E8FFEA` | 成功/完成状态背景、辅助点缀 |

---

## 字体

### 字体栈

```css
/* 字节跳动设计规范字体栈 */
font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", 
  "WenQuanYi Micro Hei", -apple-system, BlinkMacSystemFont, 
  "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

- **中文**：PingFang SC (苹方)、Hiragino Sans GB、Microsoft YaHei
- **英文/系统**：-apple-system、BlinkMacSystemFont、Segoe UI、Roboto

### Typography 组件规范

使用 Arco Design `Typography` 组件渲染文字，符合字节跳动设计规范。

```tsx
import { Typography } from '@arco-design/web-react';
const { Title, Text, Paragraph } = Typography;
```

#### 标题 (Title)

用于页面标题、表单标签：

```tsx
// 页面主标题
<Title heading={3}>页面标题</Title>

// 表单标签
<Title heading={6}>API 密钥</Title>
```

| heading | 字号 | 字重 | 用途 |
|---------|------|------|------|
| heading={1} | 40px | 600 | 页面主标题（最重，最突出） |
| heading={2} | 28px | 400 | 区块标题（中等层次） |
| heading={3} | 16px | 200 | 子区块标题（轻盈） |
| heading={6} | 16px | 600 | 表单标签、小标题 |

#### 正文 (Text)

用于简短的文本标签：

```tsx
// 主要文字
<Text>Provider 名称</Text>

// 加粗文字
<Text bold>模型名称</Text>
```

| 属性 | 值 | 用途 |
|------|-----|------|
| 默认 | 400 | 主要正文 |
| bold | 600 | 强调文字 |
| type='secondary' | 400 | 次级/辅助文字 |
| type='primary' | 400 | 强调/主色 |

#### 段落 (Paragraph)

用于描述文字、多行文本：

```tsx
// 描述文字
<Paragraph type='secondary' style={{ fontSize: 12 }}>
  API Key 仅存储在本地
</Paragraph>

// 警告文字
<Paragraph type='warning'>
  当前模型不支持工具调用
</Paragraph>
```

### 字重规范

| 值 | 名称 | 用途 |
|----|------|------|
| 200 | Extra Light | H3 子标题，轻盈感 |
| 400 | Regular | 正文、辅助文字、H2 区块标题 |
| 500 | Medium | 按钮文字 |
| 600 | Semibold | H1 页面主标题、表单标签、强调 |

### 使用示例

```tsx
// 设置页面规范用法
<Title heading={3}>OpenAI</Title>

<Title heading={6}>API 密钥</Title>
<Input placeholder="输入 API Key" />
<Paragraph type='secondary' style={{ fontSize: 12, marginTop: 4 }}>
  API Key 仅存储在本地，不会上传到服务器
</Paragraph>

// 模型卡片
<Text bold style={{ fontSize: 15 }}>GPT-4o</Text>
<Paragraph type='secondary' style={{ fontSize: 12 }}>
  gpt-4o
</Paragraph>
```

### 标题与段落

```tsx
import { Typography } from '@arco-design/web-react';
const { Title, Paragraph } = Typography;

// 标题 heading 1-6
<Title heading={5}>标题</Title>

// 段落，spacing 默认宽松，'close' 为紧凑
<Paragraph>正文段落</Paragraph>
<Paragraph type='secondary'>次级段落</Paragraph>
<Paragraph spacing='close'>紧凑段落</Paragraph>
```

| 属性 | 可选值 | 说明 |
|------|--------|------|
| heading | 1-6 | 标题层级 |
| type | 默认 / secondary | 文字色调 |
| spacing | 默认 / close | 行间距，close 更紧凑 |

### 标题层级对照

```tsx
<Typography.Title>H1</Typography.Title>
<Typography.Title heading={2}>H2</Typography.Title>
<Typography.Title heading={3}>H3</Typography.Title>
<Typography.Title heading={4}>H4</Typography.Title>
<Typography.Title heading={5}>H5</Typography.Title>
<Typography.Title heading={6}>H6</Typography.Title>
```

默认 heading 为 1，数字越大字号越小，对应 HTML h1-h6 语义。

## 按钮

```tsx
import { Button, Space } from '@arco-design/web-react';

<Button type='primary'>主要</Button>
<Button type='secondary'>次要</Button>
<Button type='dashed'>虚线</Button>
<Button type='outline'>描边</Button>
<Button type='text'>文字</Button>
```

| type 值 | 用途 |
|---------|------|
| primary | 主操作，填充色 |
| secondary | 次要操作 |
| dashed | 虚线边框 |
| outline | 描边无填充 |
| text | 纯文字，最轻量 |

## 返回顶部

```tsx
import { BackTop, Typography } from '@arco-design/web-react';

<div style={{ position: 'relative', padding: '8px 12px' }}>
  <BackTop
    visibleHeight={30}
    style={{ position: 'absolute' }}
    target={() => document.getElementById('scroll-container')}
  />
  <div id='scroll-container' style={{ height: 300, overflow: 'auto' }}>
    <Typography.Paragraph>滚动内容</Typography.Paragraph>
  </div>
</div>
```

| 属性 | 类型 | 说明 |
|------|------|------|
| visibleHeight | number | 滚动距离超过该值时显示按钮 |
| style | CSSProperties | 按钮样式，固定在视口用 `position: 'fixed'`，定位在容器内用 `position: 'absolute'` |
| target | () => HTMLElement | 返回监听滚动的目标容器元素 |

使用要点：
- 固定在视口右下角：设 `position: 'fixed', right: '40px', bottom: '40px'`（推荐用法）
- 定位在容器内：外层设 `position: 'relative'`，BackTop 设 `position: 'absolute'`
- `target` 返回实际滚动的 DOM 元素（需有固定高度 + `overflow: auto`）
- `visibleHeight` 控制按钮出现的滚动阈值

## 字重

| 变量 | 值 | 名称 | 用途 |
|------|-----|------|------|
| font-weight-400 | 400 | Regular | 正文、辅助文字 |
| font-weight-500 | 500 | Medium | 按钮文字 |
| font-weight-600 | 600 | Semibold | 标题、加粗文字 |

## 字号

| 元素 | 字号 | 行高 |
|------|------|------|
| 页面主标题 (h3) | 24px | 1.3 |
| 页面副标题 (h4) | 20px | 1.3 |
| 表单标签 (h6) | 16px | 1.5 |
| 正文/标签 | 14-15px | 1.5 |
| 辅助文字 | 12-13px | 1.5 |

## 胶囊按钮

设置页面中所有可点击按钮使用 `shape="round"` 胶囊样式：

```tsx
<Button type="primary" shape="round">保存</Button>
<Button shape="round">取消</Button>
<Button status="danger" shape="round">删除</Button>
<Button type="outline" shape="round">添加</Button>
```