# Papyrus 发布指南

本文档说明如何通过 Git 标签触发自动化构建和发布。

## 目录

- [快速发布](#快速发布)
- [完整流程](#完整流程)
- [标签规范](#标签规范)
- [故障排除](#故障排除)

---

## 快速发布

```bash
# 1. 确保代码已提交
git add .
git commit -m "feat: 新功能描述"

# 2. 创建标签（触发构建）
git tag v2.0.0

# 3. 推送标签到远程
git push origin main
git push origin v2.0.0

# 完成！GitHub Actions 会自动开始构建
```

---

## 完整流程

### 1. 准备工作

```bash
# 切换到主分支
git checkout main
git pull origin main

# 确保工作区干净
git status
```

### 2. 更新版本信息

#### 更新 CHANGELOG.md

```bash
# 编辑 CHANGELOG.md，将 [Unreleased] 的内容移到新版本下

## [Unreleased]

### Added
- xxx

## [v2.0.0] - 2026-03-29

### Added
- xxx（从上面复制过来）
```

#### 预览 CHANGELOG 内容

```bash
# 查看将要发布的 changelog
node scripts/extract-changelog.js v2.0.0
```

### 3. 提交更改

```bash
git add CHANGELOG.md
git commit -m "chore: release v2.0.0"

# 推送到远程
git push origin main
```

### 4. 创建并推送标签

```bash
# 创建标签
git tag v2.0.0

# 推送标签（这会触发 GitHub Actions 构建）
git push origin v2.0.0

# 或者推送所有标签
git push --tags
```

### 5. 等待构建完成

1. 打开 GitHub 仓库页面
2. 点击 **Actions** 标签
3. 查看工作流运行状态

或者使用命令行：

```bash
# 安装 GitHub CLI（如果还没有）
# https://cli.github.com/

# 查看工作流运行状态
gh run list --workflow=release-optimized.yml

# 查看实时日志
gh run watch
```

### 6. 查看发布结果

构建完成后，访问：

```
https://github.com/Alpaca233114514/Papyrus/releases
```

会看到：
- 自动创建的 Release
- 从 CHANGELOG.md 提取的发布说明
- 三个平台的安装包附件

---

## 标签规范

### 版本号格式

使用 [语义化版本](https://semver.org/lang/zh-CN/)：

```
主版本号.次版本号.修订号

例如：
v1.0.0      # 正式版
v2.1.0      # 次版本更新
v2.1.3      # 补丁更新
```

### 预发布版本

支持以下预发布标签：

```bash
# Alpha（内部测试）
git tag v2.0.0-alpha.1

# Beta（公开测试）
git tag v2.0.0-beta.1

# RC（候选发布）
git tag v2.0.0-rc.1
```

预发布版本会被标记为 `prerelease`。

### 标签命名规则

| 格式 | 结果 | 说明 |
|------|------|------|
| `v*` | ✅ 触发构建 | 标准格式，必须以此开头 |
| `v1.0.0` | ✅ 正式版 | |
| `v2.0.0-beta.1` | ✅ 预发布版 | 自动标记为 prerelease |
| `1.0.0` | ❌ 不触发 | 缺少 `v` 前缀 |
| `release-1.0` | ❌ 不触发 | 不匹配 `v*` 模式 |

---

## 工作流程详情

### 触发时序

```
推送标签 v2.0.0
      ↓
GitHub Actions 启动
      ↓
并行构建三个平台
  - Windows (exe)
  - macOS (dmg, zip)
  - Linux (AppImage, deb, tar.gz)
      ↓
提取 CHANGELOG
      ↓
创建 GitHub Release
      ↓
上传安装包
      ↓
完成 ✅
```

### 构建产物

| 平台 | 产物 | 文件名示例 |
|------|------|-----------|
| Windows | NSIS 安装包 | `Papyrus Desktop-Setup-2.0.0.exe` |
| macOS | DMG + ZIP | `Papyrus Desktop-Apple-Silicon-arm64.dmg` |
| Linux | AppImage, deb, tar.gz | `Papyrus Desktop-Linux-x64.AppImage` |

---

## 手动触发

除了推送标签，也可以手动触发：

### 通过 GitHub 网页

1. 打开仓库 → Actions → Release with Changelog
2. 点击 **Run workflow**
3. 输入标签名（如 `v2.0.0`）
4. 点击 **Run workflow**

### 通过 GitHub CLI

```bash
gh workflow run release-optimized.yml -f tag=v2.0.0
```

---

## 故障排除

### 标签推送后没有触发构建

**检查 1**：标签格式是否正确

```bash
# 查看本地标签
git tag

# 确保以 v 开头
# 错误：1.0.0
# 正确：v1.0.0
```

**检查 2**：是否正确推送

```bash
# 查看远程标签
git ls-remote --tags origin

# 如果没有，重新推送
git push origin v2.0.0
```

**检查 3**：工作流文件是否存在

```bash
ls .github/workflows/release-optimized.yml
```

### 构建失败

**查看日志**：

```bash
gh run list --workflow=release-optimized.yml
gh run view <run-id>
```

**常见问题**：

| 问题 | 解决 |
|------|------|
| Node / npm 依赖缺失 | 在根目录与 `backend/`、`frontend/` 执行 `npm install` |
| Node 构建失败 | 检查 `frontend/` / `backend/` 依赖与 Node 24+ |
| Electron 签名失败 | macOS 需要证书配置 |

### CHANGELOG 未正确显示

**检查**：版本号是否匹配

```bash
# CHANGELOG.md 中的版本格式
## [v2.0.0] - 2026-03-29

# 推送的标签
v2.0.0

# 必须完全匹配（包括 v 前缀）
```

**检查**：CHANGELOG 格式

```bash
# 测试提取
node scripts/extract-changelog.js v2.0.0
```

### 删除错误标签

如果创建了错误的标签：

```bash
# 删除本地标签
git tag -d v2.0.0

# 删除远程标签
git push origin --delete v2.0.0

# 重新创建正确的标签
git tag v2.0.1
git push origin v2.0.1
```

---

## 实用命令速查

```bash
# 查看所有标签
git tag

# 查看带注释的标签
git tag -n

# 创建带注释的标签（推荐）
git tag -a v2.0.0 -m "Release version 2.0.0"

# 推送单个标签
git push origin v2.0.0

# 推送所有标签
git push --tags

# 删除本地标签
git tag -d v2.0.0

# 删除远程标签
git push origin --delete v2.0.0

# 查看标签详情
git show v2.0.0
```

---

## 示例：完整发布流程

```bash
# 1. 开始
cd Papyrus
git checkout main
git pull origin main

# 2. 更新版本
code CHANGELOG.md  # 编辑 changelog
node scripts/extract-changelog.js v2.1.0  # 预览

# 3. 提交
git add CHANGELOG.md
git commit -m "chore: release v2.1.0"
git push origin main

# 4. 打标签
git tag -a v2.1.0 -m "Release v2.1.0"
git push origin v2.1.0

# 5. 等待构建
gh run watch

# 6. 完成！
echo "🎉 Release published!"
```
