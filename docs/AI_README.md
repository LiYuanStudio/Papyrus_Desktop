# Papyrus AI 功能说明

## 功能特性

### 1. SM-2 算法
- 已替换原有的简单间隔算法
- 自动适配旧数据，无需迁移
- 根据答题表现动态调整复习间隔

### 2. AI 聊天面板

#### 支持的 AI 提供商
支持 30+ 兼容 OpenAI SDK 的提供商：

- **OpenAI**: GPT-4, GPT-4o, GPT-3.5-turbo
- **Anthropic**: Claude-3.5/4 系列
- **Ollama**: 本地模型（llama3, mistral, qwen 等）
- **Deepseek**: DeepSeek-V3, DeepSeek-R1
- **Qwen**: 通义千问系列
- **Gemini**: Google Gemini 系列
- **Grok**: xAI Grok 系列
- **Moonshot**: Kimi 系列
- **Mistral**: Mistral 系列
- **Minimax**: MiniMax 系列
- **OpenRouter**: 聚合路由
- **SiliconCloud**: 硅基流动
- **自定义**: 任何兼容 OpenAI API 的服务

---

## 快速开始

### 1. 获取程序

前往 [Releases](https://github.com/PapyrusOR/Papyrus_Desktop/releases) 页面，下载最新版本。

### 2. 运行说明

Electron 模式：直接运行安装包或 `npm run electron:dev`
Web 模式：`npm run dev` 并发启动前后端

### 3. AI 功能使用

#### 配置 API

点击侧边栏的 "⚙️ 设置" 按钮，进入 AI 配置：

- **OpenAI**: 在 https://platform.openai.com/api-keys 获取
- **Anthropic**: 在 https://console.anthropic.com/ 获取
- **Ollama**: 本地运行，无需 API Key
  ```bash
  # 安装 Ollama
  # 下载: https://ollama.ai
  
  # 拉取模型
  ollama pull llama3
  ```

API 密钥使用 **AES-GCM 加密** 持久化存储。

#### 模式配置

**Agent 模式**
AI 将使用工具调用进行卡片的添加、编辑、删除，笔记搜索、文件操作等。

**Chat 模式**
仅保留纯对话聊天功能，不调用工具。

#### 工具调用审批

- **Manual**: 每个写操作需要用户手动审批
- **Auto**: 基于白名单的自动审批

#### 参数调整

在设置中可以调整：
- **Temperature**: 控制创造性（0-2，越高越随机）
- **Max Tokens**: 最大回复长度
- **Tool Approval**: 工具审批模式

---

## 配置文件

AI 配置保存在数据目录的 `ai_config.json`，包含：
- API 密钥（AES-GCM 加密）
- 提供商和模型选择
- 参数设置

数据目录默认位于 `$HOME/PapyrusData`（可通过 `PAPYRUS_DATA_DIR` 覆盖）。

---

## 注意事项

1. **API 费用**: OpenAI 和 Anthropic 按使用量收费，建议设置预算
2. **本地模型**: Ollama 完全免费，但需要较好的硬件
3. **网络**: 云端 API 需要稳定的网络连接
4. **隐私**: 本地模型数据不会上传，云端 API 会发送问题内容

---

## 故障排除

### AI 功能不可用
- 检查后端是否正常运行：`curl http://127.0.0.1:8000/api/health`
- 查看后端日志：`$HOME/PapyrusData/logs/`
- 检查 AI 配置是否完整（提供商、模型、API Key）

### API 调用失败
- 检查 API Key 是否正确
- 检查网络连接
- 确认 API 额度是否充足
- 检查代理设置（如使用系统代理）

### Ollama 连接失败
- 确认 Ollama 服务是否运行
- 检查端口是否为 11434
- 尝试: `ollama serve`

---

## 架构说明

```
backend/src/
├── ai/
│   ├── config.ts           # AI 配置管理
│   ├── provider.ts         # AI 提供商接口（OpenAI SDK）
│   ├── tool-manager.ts     # 工具调用管理器
│   ├── llm-cache.ts        # LLM 响应缓存
│   ├── tools.ts            # 工具调用入口
│   └── tools/              # 工具定义
│       ├── registry.ts     # 工具注册表
│       ├── parser.ts       # AI 响应解析
│       ├── cards.ts        # 卡片工具
│       ├── notes.ts        # 笔记工具
│       ├── files.ts        # 文件工具
│       ├── data.ts         # 数据查询工具
│       ├── relations.ts    # 关系工具
│       ├── settings.ts     # 设置工具
│       └── extensions.ts   # 扩展工具
```

---

## 后续开发建议

1. **RAG 集成**: 接入知识库增强回答质量
2. **语音功能**: TTS 朗读和 STT 输入
3. **多模态**: 支持图片理解和生成
4. **学习分析**: AI 分析学习数据并给出建议

---

## 版本

- AI 模块: v2.0.0-beta.12
- 配置以 SQLite 中的 providers / api_keys 为准；遗留 `ai_config.json` 仅在启动时迁移后删除
- SM-2 算法: 已集成
- 支持提供商: 30+
