# Papyrus CLI Manager 设计草案

> **落地状态（v2.0.0-beta.12）**：Desktop 已提供 `/api/cli`（`status` / `install` / `update` / `run`）。下文仍是完整设计草案；实现细节以 `backend/src/api/routes/cli.ts` 与 `backend/src/cli/` 为准。

本文记录后续把 `Papyrus_Cli` 融入 Desktop 的推荐方案，目标是：**用户只安装 Papyrus Desktop，Desktop 按需自动获取 CLI，AI / Skill / 插件可以稳定调用 CLI，而不要求用户手动安装 Node 或 CLI。**

## 目标

- Desktop 安装包不必内置完整 CLI。
- Desktop 内置轻量 CLI Manager。
- 首次需要 CLI 时，Desktop 从 npm 获取 CLI。
- CLI 安装到本机应用工具目录，不写入用户学习数据。
- AI、Skill、插件统一通过 Desktop API 或 MCP 调用 CLI。
- CLI 与 Desktop 后端共享协议，不重复实现卡片、笔记、复习等业务逻辑。

## 非目标

- 不要求用户手动运行 `npm install -g @papyrus/cli`。
- 不把 CLI 逻辑复制进 Desktop 后端。
- 不直接让 AI 修改 `PapyrusData` 用户数据目录。
- 第一阶段不强制加入系统 PATH。

## 推荐安装位置

Windows:

```text
%LOCALAPPDATA%\Papyrus\cli\
```

示例:

```text
C:\Users\<User>\AppData\Local\Papyrus\cli\
├── manifest.json
└── versions\
    └── 0.1.0\
        └── papyrus-cli.exe
```

说明：

- CLI 是程序工具，不是用户学习数据，因此不要放在 `PapyrusData`。
- `manifest.json` 记录当前已安装 CLI 版本、路径和安装时间。

## CLI Manager API

建议后端新增：

```http
GET  /api/cli/status
POST /api/cli/install
POST /api/cli/update
POST /api/cli/run
```

### `GET /api/cli/status`

返回：

```json
{
  "success": true,
  "installed": true,
  "version": "0.1.0",
  "path": "C:\\Users\\...\\AppData\\Local\\Papyrus\\cli\\versions\\0.1.0\\papyrus-cli.exe",
  "latestVersion": "0.1.1",
  "updateAvailable": true
}
```

### `POST /api/cli/install`

行为：

1. 查询 npm registry。
2. 选择当前平台对应的 CLI 包。
3. 下载包。
4. 解压到本地 CLI 目录。
5. 写入 CLI Manager manifest。

### `POST /api/cli/run`

请求：

```json
{
  "args": ["review", "stats", "--json"]
}
```

返回：

```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "{\"success\":true}",
  "stderr": ""
}
```

约定：

- 写操作仍然通过 Desktop 后端现有认证与审批机制控制。
- `run` 默认追加 Desktop API 地址和 token 环境变量。
- 所有给 AI 使用的命令必须支持 `--json`。

## npm 包发布建议

正式版推荐发布平台二进制包：

```text
@papyrus/cli
@papyrus/cli-win32-x64
@papyrus/cli-darwin-arm64
@papyrus/cli-darwin-x64
@papyrus/cli-linux-x64
```

Desktop 根据平台下载对应包。

第一阶段可简化为：

```text
@papyrus/cli
```

如果 CLI 仍是 JS 包，Desktop 需要明确 CLI 运行时策略：

1. 调用系统 Node/npm：实现快，但普通用户不稳定。
2. CLI 打包为 exe：用户体验最好，推荐正式版。

## 下载流程

推荐流程：

1. 请求 npm registry：

```text
https://registry.npmjs.org/@papyrus/cli/latest
```

或平台包：

```text
https://registry.npmjs.org/@papyrus/cli-win32-x64/latest
```

2. 从响应中读取：

```json
{
  "version": "0.1.0",
  "dist": {
    "tarball": "https://registry.npmjs.org/..."
  }
}
```

3. 下载 `.tgz`。
4. 解压到：

```text
%LOCALAPPDATA%\Papyrus\cli\versions\<version>\
```

5. 校验入口文件存在。
6. 更新：

```text
%LOCALAPPDATA%\Papyrus\cli\manifest.json
```

## Desktop 前端入口

建议放在设置页或扩展页：

```text
CLI 状态：未安装 / 已安装
版本：0.1.0
路径：...
[安装 CLI] [检查更新] [重新安装]
```

安装过程需要显示进度和错误，不建议完全静默。

## MCP / Skill 集成

建议 MCP 增加工具：

```text
cli_status
cli_install
cli_run
```

Skill 中约定：

- 需要操作 Papyrus 时，优先调用 Desktop 暴露的 CLI Manager。
- 不要求用户手动安装 CLI。
- 不直接读写 `PapyrusData`。
- 写操作使用 Desktop API / MCP / CLI 正式入口。

## CLI 命令设计约定

所有命令都应支持：

```bash
--json
```

第一批命令建议：

```bash
papyrus status --json
papyrus cards list --json
papyrus cards add --q "..." --a "..." --json
papyrus review next --json
papyrus review rate <card-id> --grade 3 --json
papyrus review stats --json
papyrus files list --json
papyrus ext list --json
papyrus ext install ./plugin.zip --json
papyrus mcp tools --json
papyrus mcp call get_review_stats --json
```

## 与 Desktop 的关系

CLI 原则：

> CLI 是 Desktop 后端和 MCP 的调用层，不是第二套业务后端。

CLI 应优先调用：

- `http://127.0.0.1:8000/api`
- `http://127.0.0.1:9200`

配置来源优先级：

1. 命令行参数。
2. 环境变量。
3. CLI 配置文件。
4. 默认值。

建议环境变量：

```text
PAPYRUS_API_URL=http://127.0.0.1:8000
PAPYRUS_MCP_URL=http://127.0.0.1:9200
PAPYRUS_AUTH_TOKEN=...
```

## 后续实现清单

- [ ] 新增 `backend/src/core/cli-manager.ts`
- [ ] 新增 `/api/cli/status`
- [ ] 新增 `/api/cli/install`
- [ ] 新增 `/api/cli/run`
- [ ] 设置页增加 CLI 状态卡片
- [ ] MCP 增加 `cli_status` / `cli_install` / `cli_run`
- [ ] `Papyrus_Cli` 发布 npm 包
- [ ] CLI 全命令支持 `--json`
- [ ] 为 CLI Manager 添加真实下载/安装测试

