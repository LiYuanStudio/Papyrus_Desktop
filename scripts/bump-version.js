#!/usr/bin/env node
/**
 * Version Bump Script
 *
 * 一键完成: bump 根 package.json → sync 子包 → 重生 lock → git commit → tag → push
 *
 * Usage:
 *   node scripts/bump-version.js <type> [--dry-run] [--no-push]
 *
 * Types:
 *   patch       2.0.0       -> 2.0.1
 *   minor       2.0.0       -> 2.1.0
 *   major       2.0.0       -> 3.0.0
 *   beta        2.0.0-beta.7 -> 2.0.0-beta.8   (prerelease 增量,别名 prerelease)
 *   prerelease  同 beta
 *   release     2.0.0-beta.8 -> 2.0.0          (剥离 prerelease 后缀)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');
const { syncVersion } = require('./sync-version');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const rootDir = path.resolve(__dirname, '..');
const rootPkgPath = path.join(rootDir, 'package.json');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');

const SUPPORTED_TYPES = ['patch', 'minor', 'major', 'beta', 'prerelease', 'release'];

class BumpVersionError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'BumpVersionError';
    this.context = context;
  }
}

function stripVPrefix(version) {
  if (typeof version !== 'string') {
    throw new BumpVersionError(`版本号必须是字符串,收到: ${typeof version}`);
  }
  return version.startsWith('v') ? version.slice(1) : version;
}

function computeNext(currentVersion, requestedType) {
  const cleanCurrent = stripVPrefix(currentVersion);

  if (!semver.valid(cleanCurrent)) {
    throw new BumpVersionError(
      `当前版本号不是有效 semver: "${currentVersion}" (清理后: "${cleanCurrent}")`
    );
  }

  if (!SUPPORTED_TYPES.includes(requestedType)) {
    throw new BumpVersionError(
      `不支持的 bump 类型: "${requestedType}",支持: ${SUPPORTED_TYPES.join(', ')}`
    );
  }

  if (requestedType === 'release') {
    const parsed = semver.parse(cleanCurrent);
    if (!parsed) {
      throw new BumpVersionError(`semver.parse 返回 null: ${cleanCurrent}`);
    }
    if (parsed.prerelease.length === 0) {
      throw new BumpVersionError(
        `当前版本 ${cleanCurrent} 已是正式版,无 prerelease 后缀可剥离`
      );
    }
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }

  const semverType = requestedType === 'beta' ? 'prerelease' : requestedType;
  const preid = semverType === 'prerelease' ? 'beta' : undefined;
  const next = semver.inc(cleanCurrent, semverType, preid);

  if (!next) {
    throw new BumpVersionError(
      `semver.inc 失败: current=${cleanCurrent}, type=${semverType}, preid=${preid}`
    );
  }
  return next;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = { dryRun: false, noPush: false };
  let type = null;

  for (const arg of args) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--no-push') flags.noPush = true;
    else if (arg.startsWith('--')) {
      throw new BumpVersionError(`未知参数: ${arg}`);
    } else if (type === null) {
      type = arg;
    } else {
      throw new BumpVersionError(`多余的位置参数: ${arg}`);
    }
  }

  if (!type) {
    throw new BumpVersionError(
      `缺少 bump 类型参数,用法: node scripts/bump-version.js <${SUPPORTED_TYPES.join('|')}> [--dry-run] [--no-push]`
    );
  }

  return { type, ...flags };
}

function runGit(args, options = {}) {
  try {
    const result = execSync(`git ${args}`, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: options.captureOutput ? 'pipe' : 'inherit',
      ...options,
    });
    return typeof result === 'string' ? result.trim() : '';
  } catch (error) {
    throw new BumpVersionError(`git ${args} 失败`, {
      stderr: error.stderr?.toString(),
      stdout: error.stdout?.toString(),
      status: error.status,
    });
  }
}

function assertCleanWorkingDirectory() {
  const status = runGit('status --porcelain', { captureOutput: true });
  if (status.length > 0) {
    throw new BumpVersionError(
      `工作区不干净,请先 commit 或 stash 本地改动:\n${status}`
    );
  }
}

function assertTagDoesNotExist(tagName) {
  const existing = runGit(`tag -l ${tagName}`, { captureOutput: true });
  if (existing.trim() === tagName) {
    throw new BumpVersionError(
      `Tag ${tagName} 已存在。如需重建,请先删除:\n` +
      `  git tag -d ${tagName}\n` +
      `  git push origin :refs/tags/${tagName}`
    );
  }
}

function readRootVersion() {
  const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  if (!pkg.version) {
    throw new BumpVersionError('根 package.json 缺少 version 字段');
  }
  return pkg.version;
}

function writeRootVersion(nextVersion) {
  const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  pkg.version = nextVersion;
  fs.writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

function regenerateLockFile(workdir, label) {
  log(`   ⏳ 重生 ${label} lock...`, 'dim');
  try {
    execSync('npm install --package-lock-only --ignore-scripts', {
      cwd: workdir,
      stdio: 'pipe',
    });
    log(`   ✓ ${label} lock 已更新`, 'green');
  } catch (error) {
    throw new BumpVersionError(`重生 ${label} lock 失败`, {
      cwd: workdir,
      stderr: error.stderr?.toString(),
      stdout: error.stdout?.toString(),
    });
  }
}

function rollbackPackageJsonChanges() {
  log('   ↩  回滚 package.json 改动...', 'yellow');
  try {
    execSync('git checkout -- package.json frontend/package.json backend/package.json', {
      cwd: rootDir,
      stdio: 'pipe',
    });
    log('   ✓ 已回滚 package.json 文件', 'green');
  } catch (error) {
    log(`   ⚠ 回滚失败,请手动 git checkout: ${error.message}`, 'red');
  }
}

function commitAndTag(nextVersion) {
  const tagName = `v${nextVersion}`;
  const commitMessage = `chore(release): ${tagName}`;

  log(`   📝 创建 commit: ${commitMessage}`, 'cyan');
  runGit(
    'add package.json frontend/package.json backend/package.json ' +
    'package-lock.json frontend/package-lock.json backend/package-lock.json'
  );
  runGit(`commit -m "${commitMessage}"`);

  log(`   🏷  创建 tag: ${tagName}`, 'cyan');
  runGit(`tag ${tagName}`);

  return tagName;
}

function pushTag(tagName) {
  log(`   🚀 推送 tag 到 origin: ${tagName}`, 'cyan');
  runGit(`push origin refs/tags/${tagName}`);
  log(`   ✓ tag 已推送,release.yml 将被 'v*' tag 触发器自动唤醒`, 'green');
}

function printSummary({ current, next, type, tagName, dryRun, noPush }) {
  log('', 'reset');
  log('═══════════════════════════════════════', 'bold');
  log('  Version Bump Summary', 'bold');
  log('═══════════════════════════════════════', 'bold');
  log(`  Current : ${current}`, 'dim');
  log(`  Next    : ${next}`, 'green');
  log(`  Type    : ${type}`, 'dim');
  log(`  Tag     : ${tagName}`, 'dim');
  if (dryRun) log('  Mode    : DRY RUN (无任何改动)', 'yellow');
  if (noPush) log('  Push    : 跳过 (--no-push)', 'yellow');
  log('═══════════════════════════════════════', 'bold');
  log('', 'reset');
}

function main(argv) {
  const { type, dryRun, noPush } = parseArgs(argv);

  log(`🚀 开始 version bump (type: ${type})`, 'cyan');

  if (!dryRun) {
    log('🔍 检查工作区干净...', 'dim');
    assertCleanWorkingDirectory();
  }

  const current = readRootVersion();
  const next = computeNext(current, type);
  const tagName = `v${next}`;

  if (!dryRun) {
    log('🔍 检查 tag 重复...', 'dim');
    assertTagDoesNotExist(tagName);
  }

  printSummary({ current, next, type, tagName, dryRun, noPush });

  if (dryRun) {
    log('✅ Dry run 完成,未做任何改动', 'green');
    return;
  }

  log('📝 写入根 package.json...', 'dim');
  writeRootVersion(next);

  try {
    log('🔄 同步子包 package.json...', 'dim');
    syncVersion();

    log('📦 重生 lock 文件...', 'dim');
    regenerateLockFile(rootDir, 'root');
    regenerateLockFile(frontendDir, 'frontend');
    regenerateLockFile(backendDir, 'backend');
  } catch (error) {
    rollbackPackageJsonChanges();
    throw error;
  }

  log('💾 提交并打 tag...', 'dim');
  commitAndTag(next);

  if (!noPush) {
    pushTag(tagName);
  } else {
    log(`   ℹ  跳过 push,稍后可手动: git push origin ${tagName}`, 'yellow');
  }

  log('', 'reset');
  log(`✅ Version bump 完成: ${current} → ${next}`, 'green');
  if (!noPush) {
    log('   📡 release.yml 应已被触发,前往 GitHub Actions 查看构建', 'cyan');
  }
}

module.exports = {
  stripVPrefix,
  computeNext,
  parseArgs,
  BumpVersionError,
};

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    if (error instanceof BumpVersionError) {
      log(`❌ ${error.message}`, 'red');
      if (error.context) {
        log(`   上下文: ${JSON.stringify(error.context, null, 2)}`, 'dim');
      }
      process.exit(1);
    }
    throw error;
  }
}
