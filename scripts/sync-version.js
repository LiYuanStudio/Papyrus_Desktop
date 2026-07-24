#!/usr/bin/env node
/**
 * Version Sync Script
 *
 * 单一真相源：根目录 package.json
 * 同步目标：frontend/package.json、backend/package.json、AboutView.tsx 硬编码回退值
 *
 * Usage:
 *   node scripts/sync-version.js
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const rootDir = path.resolve(__dirname, '..');
const rootPkgPath = path.join(rootDir, 'package.json');
const frontendPkgPath = path.join(rootDir, 'frontend', 'package.json');
const backendPkgPath = path.join(rootDir, 'backend', 'package.json');
const aboutViewPath = path.join(
  rootDir,
  'frontend',
  'src',
  'SettingsPage',
  'views',
  'AboutView.tsx'
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function syncVersion() {
  log('📦 同步版本号...', 'dim');

  // 读取单一真相源
  const rootPkg = readJson(rootPkgPath);
  const version = rootPkg.version;

  if (!version) {
    log('❌ 根目录 package.json 缺少 version 字段', 'red');
    process.exit(1);
  }

  log(`   根目录版本: ${version}`, 'dim');

  // 同步 frontend/package.json
  if (fs.existsSync(frontendPkgPath)) {
    const frontendPkg = readJson(frontendPkgPath);
    if (frontendPkg.version !== version) {
      frontendPkg.version = version;
      writeJson(frontendPkgPath, frontendPkg);
      log(`   ✓ frontend/package.json → ${version}`, 'green');
    } else {
      log(`   ✓ frontend/package.json 已是最新`, 'dim');
    }
  }

  // 同步 backend/package.json
  if (fs.existsSync(backendPkgPath)) {
    const backendPkg = readJson(backendPkgPath);
    if (backendPkg.version !== version) {
      backendPkg.version = version;
      writeJson(backendPkgPath, backendPkg);
      log(`   ✓ backend/package.json → ${version}`, 'green');
    } else {
      log(`   ✓ backend/package.json 已是最新`, 'dim');
    }
  }

  // 同步 AboutView.tsx 中的硬编码回退值
  if (fs.existsSync(aboutViewPath)) {
    const aboutViewContent = fs.readFileSync(aboutViewPath, 'utf8');

    // 如果已使用构建时注入的 __APP_VERSION__，无需同步
    if (aboutViewContent.includes('__APP_VERSION__')) {
      log(`   ✓ AboutView.tsx 使用 __APP_VERSION__，无需同步`, 'dim');
    } else {
      const regex = /版本 \{versionInfo\?\.current_version \|\| '[^']+'\}/;
      const replacement = `版本 {versionInfo?.current_version || '${version}'}`;

      if (regex.test(aboutViewContent)) {
        const newContent = aboutViewContent.replace(regex, replacement);
        if (newContent !== aboutViewContent) {
          fs.writeFileSync(aboutViewPath, newContent, 'utf8');
          log(`   ✓ AboutView.tsx 回退值 → ${version}`, 'green');
        } else {
          log(`   ✓ AboutView.tsx 回退值已是最新`, 'dim');
        }
      } else {
        log(`   ⚠ AboutView.tsx 中未找到版本回退值模式`, 'yellow');
      }
    }
  }

  log('✅ 版本同步完成', 'green');
}

module.exports = { syncVersion };

if (require.main === module) {
  syncVersion();
}
