/**
 * Electron Builder Configuration (JavaScript version)
 * Alternative to electron-builder.json for more dynamic configuration
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Check if running in CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Certificate configuration (only for local builds, stored outside project dir)
const certificateFile = path.join(os.homedir(), '.papyrus-certs', 'code-signing.pfx');
const hasCertificate = fs.existsSync(certificateFile);

module.exports = {
  appId: 'com.papyrus.desktop',
  productName: 'Papyrus Desktop',
  copyright: 'Copyright © 2026 Papyrus Team',
  
  directories: {
    output: 'dist-electron',
    buildResources: 'build',
  },
  
  files: [
    'electron/**/*',
    {
      from: 'frontend/dist',
      to: 'frontend/dist',
    },
    '!node_modules/**/*',
    '!frontend/node_modules/**/*',
    '!backend/**/*',
    '!**/*.map',
    '!**/*.ts',
    '!**/*.tsx',
  ],

  extraResources: [
    {
      from: 'assets',
      to: 'assets',
    },
    {
      from: 'backend/dist',
      to: 'backend/dist',
    },
    {
      from: 'backend/node_modules',
      to: 'backend/node_modules',
    },
    {
      from: 'backend/package.json',
      to: 'backend/package.json',
    },
  ],

  asar: true,
  asarUnpack: [],
  compression: 'maximum',
  removePackageScripts: true,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  npmRebuild: false,

  // Windows configuration - 仅 NSIS 安装器
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
    icon: 'assets/icon.ico',
    verifyUpdateCodeSignature: !isCI,
    executableName: 'Papyrus Desktop',
    // Only sign locally (CI builds are unsigned)
    ...(hasCertificate && !isCI ? {
      certificateFile: certificateFile,
      certificatePassword: process.env.CERTIFICATE_PASSWORD,
    } : {}),
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Papyrus Desktop',
    uninstallDisplayName: 'Papyrus Desktop',
    include: 'build/installer.nsh',
    deleteAppDataOnUninstall: true,
    artifactName: '${productName}-Setup.${ext}',
  },
  
  // macOS configuration
  mac: {
    // 不在配置中固定 CPU 架构；CI 在原生 arm64/x64 runner 上分别传入 --arm64/--x64，
    // 确保 sharp 等原生后端依赖与最终 Electron 架构一致。
    target: ['dmg'],
    icon: 'assets/icon.icns',
    category: 'public.app-category.productivity',
    darkModeSupport: true,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // Electron 41 基于 Chromium 的运行时最低支持 macOS 12，声明更低版本只会产生无法启动的安装包。
    minimumSystemVersion: '12.0',
  },
  
  dmg: {
    sign: false,
    artifactName: '${productName}-macOS-${arch}.${ext}',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
    window: {
      width: 540,
      height: 380,
    },
  },
  
  // Linux configuration
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    artifactName: '${productName}-Linux-${arch}.${ext}',
    icon: 'assets/icon.png',
    category: 'Office',
    maintainer: 'Papyrus Team',
    vendor: 'Papyrus Team',
    synopsis: 'Modern note-taking and learning application',
    description: 'Papyrus Desktop is a modern note-taking and learning application with AI integration and spaced repetition.',
    desktop: {
      entry: {
        Name: 'Papyrus Desktop',
        Comment: 'Note-taking and learning application',
        Categories: 'Office;Education;',
        StartupWMClass: 'Papyrus Desktop',
      },
    },
  },
  
  // Publish configuration
  publish: {
    provider: 'github',
    owner: 'papyrus-team',
    repo: 'papyrus',
    releaseType: 'release',
  },
};
