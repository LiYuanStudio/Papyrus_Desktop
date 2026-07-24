# Papyrus 扩展示例模板

这是一个 Papyrus 扩展的示例项目，展示了如何使用 MCP 接口与 Papyrus 交互。

## 项目结构

```
extension-template/
├── README.md           # 本文件
├── main.py            # Python 扩展示例
├── main.js            # JavaScript 扩展示例
└── manifest.json      # 浏览器扩展配置示例
```

## 快速开始

### Python 扩展

1. 确保 Papyrus 正在运行
2. 安装依赖：`pip install requests`
3. 运行：`python main.py`

### 浏览器扩展

1. 打开 Chrome/Edge 扩展管理页面
2. 开启"开发者模式"
3. 点击"加载已解压的扩展"
4. 选择 `extension-template` 目录

## 功能演示

- ✅ 连接 Papyrus
- ✅ 获取笔记列表
- ✅ 创建新笔记
- ✅ 搜索笔记
- ✅ 渲染 Markdown
