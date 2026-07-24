#!/usr/bin/env node
/**
 * Version Set Script
 *
 * 说明：一次性写入根目录与前后端 package.json 的 version 字段，并同步根 lock 文件。
 * 原因：Electron 应用版本与 About 接口分别读取不同 package.json，必须用一个命令统一更新。
 * 未使用新依赖：直接复用现有 Node 标准库与 semver，避免引入额外体积和维护成本。
 *
 * Usage:
 *   node scripts/set-version.js 2.0.0
 *   node scripts/set-version.js 2.0.0-beta.11
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

const VERSION_PATTERN = /^(?:\d+\.\d+\.\d+|\d+\.\d+\.\d+-beta\.\d+)$/;
const rootDir = path.resolve(__dirname, '..');
const packageJsonPaths = [
  path.join(rootDir, 'package.json'),
  path.join(rootDir, 'frontend', 'package.json'),
  path.join(rootDir, 'backend', 'package.json'),
];

class SetVersionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SetVersionError';
  }
}

// 校验用户输入的版本号是否符合项目允许的两种格式，并额外做 semver 安全校验。
// 原因：版本号会被 Electron、前端构建与后端接口共同消费，必须在入口统一拦截非法值。
// 未只用正则：仅靠正则不够稳妥，semver.valid 可以补充边界校验，减少隐藏格式问题。
function validateVersion(inputVersion) {
  if (typeof inputVersion !== 'string') {
    throw new SetVersionError('版本号必须是字符串');
  }

  const normalizedVersion = inputVersion.trim();

  if (!VERSION_PATTERN.test(normalizedVersion)) {
    throw new SetVersionError(
      '版本号格式无效，仅支持 x.x.x 或 x.x.x-beta.x'
    );
  }

  if (!semver.valid(normalizedVersion)) {
    throw new SetVersionError('版本号未通过 semver 校验');
  }

  const prerelease = semver.prerelease(normalizedVersion);
  if (prerelease !== null) {
    const [channel, serial] = prerelease;
    if (channel !== 'beta' || typeof serial !== 'number') {
      throw new SetVersionError('预发布版本仅支持 beta 序列');
    }
  }

  return normalizedVersion;
}

// 读取 JSON 文件并转为对象。
// 原因：三个 package.json 都要复用相同读法，提取后可减少重复。
// 未内联到调用处：内联会让多处文件更新逻辑更分散，不利于后续维护。
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// 以项目当前风格写回 JSON 文件，并保留末尾换行。
// 原因：保持仓库现有 package.json 格式一致，减少无关 diff。
// 未使用更复杂格式化工具：本项目希望最小改动且不引入新依赖。
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// 更新单个 package.json 的 version 字段。
// 原因：根、前端、后端三个包都需要同步到同一版本。
// 未直接字符串替换：JSON 解析后写回更安全，不会误伤别的文本内容。
function updatePackageVersion(filePath, version) {
  const pkg = readJson(filePath);
  pkg.version = version;
  writeJson(filePath, pkg);
}

// 同步根目录 lock 文件中的版本元数据。
// 原因：根 package-lock.json 顶层也记录版本号，不更新会造成展示与发布元数据不一致。
// 未同步前后端 lock：本次目标只解决两个界面展示问题，且子包 lock 不承载顶层应用版本展示来源。
function syncRootLockFile() {
  execSync('npm install --package-lock-only --ignore-scripts', {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

// 一次性同步三个 package.json 并刷新根 lock 文件。
// 原因：把“写版本”和“同步附属元数据”收敛成一个原子动作，开发者只需记住一个命令。
// 未拆成更多步骤暴露给用户：用户需求是单命令更新，过多步骤会再次造成遗漏。
function setVersion(rawVersion) {
  const version = validateVersion(rawVersion);

  for (const filePath of packageJsonPaths) {
    updatePackageVersion(filePath, version);
  }

  syncRootLockFile();
  console.log(`✅ 版本已同步为 ${version}`);
  return version;
}

// 解析命令行入口参数并执行版本同步。
// 原因：开发态直接通过 npm script 调用，入口需要给出清晰报错。
// 未支持多参数模式：当前需求只需要显式设置一个完整版本号，保持界面与命令最小化。
function main(argv) {
  const requestedVersion = argv[2];

  if (!requestedVersion) {
    throw new SetVersionError(
      '缺少版本号参数，用法: node scripts/set-version.js <x.x.x|x.x.x-beta.x>'
    );
  }

  if (argv.length > 3) {
    throw new SetVersionError('仅支持一个版本号参数');
  }

  setVersion(requestedVersion);
}

module.exports = {
  SetVersionError,
  setVersion,
  validateVersion,
};

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    if (error instanceof SetVersionError) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
