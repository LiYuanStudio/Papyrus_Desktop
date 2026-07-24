# 获取构建产物

本文档说明如何下载 GitHub Actions 构建的安装包。

## 方法一：GitHub CLI（推荐）

### 安装 GitHub CLI

- **Windows**: `winget install GitHub.cli`
- **macOS**: `brew install gh`
- **Linux**: 见 https://cli.github.com/

### 登录

```bash
gh auth login
```

### 使用脚本下载

```bash
# 下载最新构建产物
node scripts/download-artifacts.js

# 或指定 run ID
node scripts/download-artifacts.js 1234567890
```

产物会保存到 `downloaded-artifacts/` 目录：

```
downloaded-artifacts/
├── PapyrusDesktop-Win-x64/
│   └── Papyrus Desktop-Setup-2.0.0.exe
├── PapyrusDesktop-Apple-Silicon-arm64/
│   └── Papyrus Desktop-Apple-Silicon-arm64.dmg
└── PapyrusDesktop-Linux-x64/
    ├── Papyrus Desktop-Linux-x64.AppImage
    └── Papyrus Desktop-Linux-x64.deb
```

---

## 方法二：手动下载

### 1. 查看最近构建

```bash
gh run list --workflow=release.yml
```

### 2. 下载特定构建

```bash
# 下载最新构建
gh run download --workflow=release.yml

# 或指定 run ID
gh run download 1234567890

# 指定输出目录
gh run download 1234567890 -D ./my-builds
```

### 3. 查看构建状态

```bash
# 实时查看日志
gh run watch

# 查看特定 run
gh run view 1234567890
```

---

## 方法三：网页下载

1. 打开 GitHub 仓库
2. 点击 **Actions** 标签
3. 选择 **Release with Changelog** 工作流
4. 点击最近的运行记录
5. 在 **Artifacts** 部分下载

---

## 常见问题

### 没有 artifact？

检查工作流是否成功完成：

```bash
gh run list --workflow=release.yml
```

### 下载失败？

1. **未登录**：运行 `gh auth login`
2. **无权限**：确保有仓库访问权限
3. **Artifact 已过期**：默认保留 7 天

### 如何延长保留时间？

修改 `.github/workflows/release.yml`：

```yaml
- name: Upload Artifact
  uses: actions/upload-artifact@v4
  with:
    name: ${{ matrix.artifact }}
    path: dist-electron/*
    retention-days: 30  # 改为 30 天
```

---

## 快速参考

| 命令 | 说明 |
|------|------|
| `gh run list` | 列出所有运行 |
| `gh run download` | 下载最新产物 |
| `gh run download <id>` | 下载指定产物 |
| `gh run view` | 查看运行详情 |
| `gh run watch` | 实时查看日志 |
