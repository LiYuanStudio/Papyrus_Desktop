#!/usr/bin/env node
/**
 * Electron Build Script for Papyrus
 * 
 * Usage:
 *   node scripts/build-electron.js dev          - Development mode
 *   node scripts/build-electron.js build        - Build for current platform
 *   node scripts/build-electron.js build:win    - Build for Windows
 *   node scripts/build-electron.js build:mac    - Build for macOS
 *   node scripts/build-electron.js build:linux  - Build for Linux
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { killPort } = require('./kill-ports.js');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log('='.repeat(60), 'cyan');
  log(`  ${title}`, 'bright');
  log('='.repeat(60), 'cyan');
  console.log('');
}

function error(message) {
  log(`❌ ERROR: ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

// Resolve npm executable for child_process.spawn on Windows.
// Reason: spawn('npm') can fail with ENOENT on Windows because npm is exposed as npm.cmd.
// Not using shell: true here keeps argument passing explicit and avoids broad shell parsing.
function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}
// Check if a command exists
function commandExists(command) {
  try {
    const cmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Execute a command with proper error handling
function exec(command, options = {}) {
  const defaultOptions = {
    stdio: 'inherit',
    shell: true,  // 修复：改为 true 以支持 && 等 shell 语法
    cwd: process.cwd(),
  };
  
  try {
    execSync(command, { ...defaultOptions, ...options });
    return true;
  } catch (e) {
    if (!options.ignoreError) {
      error(`Command failed: ${command}\n${e.message}`);
    }
    return false;
  }
}

// Get platform-specific build command
function getBuildCommand(target) {
  const baseCommand = 'npx electron-builder --config .electron-builder.config.js';
  
  switch (target) {
    case 'win':
    case 'windows':
      return `${baseCommand} --win`;
    case 'mac':
    case 'macos':
    case 'darwin':
      return `${baseCommand} --mac`;
    case 'linux':
      return `${baseCommand} --linux`;
    case 'all':
      return `${baseCommand} --win --mac --linux`;
    default:
      return baseCommand;
  }
}

// Check prerequisites
function checkPrerequisites() {
  logSection('Checking Prerequisites');
  
  // Check Node.js
  const nodeVersion = process.version;
  log(`Node.js version: ${nodeVersion}`, 'dim');
  
  // Check if frontend dependencies are installed
  const frontendNodeModules = path.join('frontend', 'node_modules');
  if (!fs.existsSync(frontendNodeModules)) {
    log('Frontend dependencies not found. Installing...', 'yellow');
    exec('cd frontend && npm install');
  }
  
  // Check if root dependencies are installed
  const rootNodeModules = path.join('node_modules');
  if (!fs.existsSync(rootNodeModules)) {
    log('Root dependencies not found. Installing...', 'yellow');
    exec('npm install');
  }
  
  success('Prerequisites check passed');
}

// Build frontend
function buildFrontend() {
  logSection('Building Frontend');
  
  // Clean previous build
  const distPath = path.join('frontend', 'dist');
  if (fs.existsSync(distPath)) {
    log('Cleaning previous frontend build...', 'dim');
    fs.rmSync(distPath, { recursive: true, force: true });
  }
  
  // Build frontend
  exec('cd frontend && npm run build');
  
  if (!fs.existsSync(distPath)) {
    error('Frontend build failed: dist folder not found');
  }
  
  success('Frontend built successfully');
}

// Build Node.js backend
function buildBackend() {
  logSection('Building Node.js Backend');

  const backendPath = path.join('backend');
  if (!fs.existsSync(backendPath)) {
    error('Backend directory not found. Please ensure backend/ exists.');
  }

  // Check if backend dependencies are installed
  const backendNodeModules = path.join('backend', 'node_modules');
  if (!fs.existsSync(backendNodeModules)) {
    log('Backend dependencies not found. Installing...', 'yellow');
    exec('cd backend && npm install');
  }

  // Clean previous build
  const distBackendPath = path.join('backend', 'dist');
  if (fs.existsSync(distBackendPath)) {
    log('Cleaning previous backend build...', 'dim');
    fs.rmSync(distBackendPath, { recursive: true, force: true });
  }

  // Build TypeScript
  log('Compiling TypeScript backend...');
  exec('cd backend && npm run build');

  // Verify build output
  const serverJsPath = path.join(distBackendPath, 'api', 'server.js');
  if (!fs.existsSync(serverJsPath)) {
    error(`Backend build failed: server.js not found in ${distBackendPath}`);
  }

  success('Node.js backend built successfully');
  return true;
}

// Development mode
function devMode() {
  logSection('Starting Development Mode');
  
  // 修复：检查 wait-on 模块是否存在
  let waitOn;
  try {
    waitOn = require('wait-on');
  } catch (e) {
    log('wait-on module not found. Installing...', 'yellow');
    exec('npm install wait-on --save-dev');
    waitOn = require('wait-on');
  }

  // Release ports before starting
  log('Checking port usage...');
  const onReleased = (port, pid) => log(`Released port ${port} (PID: ${pid})`, 'green');
  killPort(8000, { onReleased });
  killPort(5173, { onReleased });
  
  // Wait a moment for ports to be fully released
  log('Waiting for ports to be released...', 'dim');
  // 修复：使用 Node.js 的同步等待
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  
  // Start frontend
  log('Starting frontend...');
  const npmCommand = getNpmCommand();
  const frontend = spawn(npmCommand, ['run', 'dev:frontend'], {
    cwd: path.join(process.cwd(), 'frontend'),
    stdio: 'inherit',
    env: process.env
  });
  
  // Start Node.js backend
  log('Starting backend...');
  const backend = spawn(npmCommand, ['run', 'dev'], {
    cwd: path.join(process.cwd(), 'backend'),
    stdio: 'inherit',
    env: process.env
  });
  
  // Handle frontend errors
  frontend.on('error', (err) => {
    log(`Frontend failed to start: ${err.message}`, 'red');
    backend.kill();
    process.exit(1);
  });

  // Handle backend errors
  backend.on('error', (err) => {
    log(`Backend failed to start: ${err.message}`, 'red');
    frontend.kill();
    process.exit(1);
  });
  
  // Wait for both services to be ready
  log('Waiting for services to be ready...');
  waitOn({
    resources: ['http://localhost:5173', 'http://localhost:8000/api/health'],
    timeout: 60000,
    interval: 1000
  }, (err) => {
    if (err) {
      log('Services failed to start in time', 'red');
      frontend.kill();
      backend.kill();
      process.exit(1);
    }
    
    log('Services ready, starting Electron...');
    
    // 修复：更可靠的 Electron 路径查找
    let electronPath;
    try {
      const electronModulePath = require.resolve('electron');
      // 尝试多种可能的路径
      const possiblePaths = [
        path.join(path.dirname(electronModulePath), '..', 'dist', 'electron.exe'),
        path.join(path.dirname(electronModulePath), '..', 'dist', 'electron'),
        path.join(path.dirname(electronModulePath), '..', '..', '.bin', 'electron.cmd'),
        path.join(path.dirname(electronModulePath), 'cli.js'),
      ];
      
      electronPath = possiblePaths.find(p => fs.existsSync(p));
      
      if (!electronPath) {
        // 回退到使用 npx electron
        electronPath = 'electron';
      }
    } catch (e) {
      electronPath = 'electron';
    }

    const electronEnv = { ...process.env };
    delete electronEnv.ELECTRON_RUN_AS_NODE;

    const electron = spawn(electronPath, ['.'], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: electronEnv
    });
    
    // Handle cleanup
    process.on('SIGINT', () => {
      electron.kill();
      frontend.kill();
      backend.kill();
      process.exit(0);
    });
    
    electron.on('close', () => {
      frontend.kill();
      backend.kill();
      process.exit(0);
    });
  });
}

// Build Electron app
function buildElectron(target) {
  logSection(`Building Electron App (${target || 'current platform'})`);

  const command = getBuildCommand(target);

  log(`Running: ${command}`, 'dim');
  exec(command);

  // frontend/dist 已由 electron-builder 的 files 规则放入 app.asar。
  // 原因：统一打包路径可让 Windows、macOS 与 Linux 使用相同资源布局和完整性校验。
  // 未再写入 win-unpacked：macOS 构建时创建 Windows 目录既无效，也会掩盖 app.asar 配置错误。
  success(`Electron app built successfully!`);
  log(`Output location: ${path.join('dist-electron')}`, 'dim');
}

// Sync version before building
function syncVersion() {
  log('Syncing version...', 'dim');
  const syncScript = path.join(__dirname, 'sync-version.js');
  if (fs.existsSync(syncScript)) {
    try {
      execSync('node "' + syncScript + '"', { stdio: 'inherit', shell: true });
    } catch (e) {
      log('Version sync failed, continuing build...', 'yellow');
    }
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'build';
  
  log('', 'reset');
  log('╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║        Papyrus Desktop Electron Build Script           ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝', 'cyan');
  
  switch (command) {
    case 'dev':
      checkPrerequisites();
      syncVersion();
      devMode();
      break;

    case 'build':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron();
      break;

    case 'build:win':
    case 'build:windows':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('win');
      break;

    case 'build:mac':
    case 'build:macos':
    case 'build:darwin':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('mac');
      break;

    case 'build:linux':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('linux');
      break;

    case 'build:all':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('all');
      break;
      
    case 'help':
    case '-h':
    case '--help':
      console.log(`
Usage: node scripts/build-electron.js [command]

Commands:
  dev                    Start development mode
  build                  Build for current platform
  build:win              Build for Windows (x64)
  build:mac              Build for the current macOS architecture
  build:linux            Build for Linux (x64)
  build:all              Build for all platforms
  help                   Show this help message

Examples:
  node scripts/build-electron.js dev
  node scripts/build-electron.js build:win
      `);
      break;
      
    default:
      error(`Unknown command: ${command}\nRun 'node scripts/build-electron.js help' for usage information.`);
  }
}

// Run main function
main();
