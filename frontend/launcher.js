/**
 * Papyrus 启动器
 * 同时启动 TypeScript 后端和 Vite 前端开发服务器
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { platform } from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import http from 'http';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

console.log(`${colors.cyan}Papyrus 启动器${colors.reset}\n`);

/**
 * 通过 HTTP 请求探测服务是否已就绪
 * 优先使用健康检查端点，避免 Git Bash / Node 25 下 netstat 不可靠的问题
 */
function httpCheck(url, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          // 后端健康检查返回 { status: 'ok' }
          resolve(json.status === 'ok');
        } catch {
          // 对于前端 dev server，只要 TCP 通且没有 5xx 就认为占用
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function netstatCheck(port) {
  try {
    if (platform() === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
      return stdout.trim().length > 0;
    }
  } catch (e) {
    return false;
  }
  return false;
}

async function checkPort(port) {
  // 主探测：HTTP 健康检查（更可靠）
  if (port === 8000) {
    if (await httpCheck('http://127.0.0.1:8000/api/health')) return true;
    if (await httpCheck('http://127.0.0.1:8000/health')) return true;
  } else if (port === 5173) {
    if (await httpCheck('http://127.0.0.1:5173/')) return true;
  }

  // 兜底：netstat 探测
  return netstatCheck(port);
}

async function killPort(port) {
  try {
    if (platform() === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const match = line.trim().match(/\s+(\d+)\s*$/);
        if (match) {
          const pid = match[1];
          try {
            await execAsync(`taskkill /PID ${pid} /F`);
            console.log(`${colors.green}端口 ${port} 已释放 (PID: ${pid})${colors.reset}`);
          } catch (e) {
            console.log(`${colors.yellow}无法终止进程 ${pid}${colors.reset}`);
          }
        }
      }
    }
  } catch (e) {
  }
}

function startFrontend(backendProcess) {
  console.log(`${colors.yellow}正在启动前端开发服务器...${colors.reset}`);

  const frontendArgs = ['vite', '--port', '5173'];
  const frontend = spawn('npx', frontendArgs, {
    cwd: __dirname,
    stdio: 'inherit',
    shell: platform() === 'win32'
  });

  frontend.on('error', (err) => {
    console.error(`${colors.red}启动前端失败: ${err.message}${colors.reset}`);
    console.log(`${colors.yellow}请确保 Node.js 依赖已安装: npm install${colors.reset}`);
    if (backendProcess) backendProcess.kill();
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}正在关闭服务...${colors.reset}`);
    frontend.kill();
    if (backendProcess) backendProcess.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    frontend.kill();
    if (backendProcess) backendProcess.kill();
    process.exit(0);
  });

  if (platform() === 'win32') {
    process.on('exit', () => {
      frontend.kill();
      if (backendProcess) backendProcess.kill();
    });
  }
}

async function start() {
  console.log(`${colors.yellow}检查端口占用...${colors.reset}`);

  const backendAlreadyRunning = await checkPort(8000);
  
  if (!backendAlreadyRunning) {
    await killPort(8000);
    await killPort(5173);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log();

  if (backendAlreadyRunning) {
    console.log(`${colors.green}后端已由外部启动器启动${colors.reset}\n`);
    startFrontend(null);
  } else {
    console.log(`${colors.yellow}正在启动后端服务器...${colors.reset}`);

    const backend = spawn('npm', ['run', 'dev'], {
      cwd: join(projectRoot, 'backend'),
      stdio: 'pipe',
      shell: platform() === 'win32',
      env: { ...process.env }
    });

    let backendReady = false;
    let backendOutput = [];

    backend.stdout.on('data', (data) => {
      const output = data.toString();
      backendOutput.push(output);

      if (output.includes('Server listening on') || output.includes('8000') || output.includes('Papyrus backend started')) {
        if (!backendReady) {
          backendReady = true;
          console.log(`${colors.green}后端已启动: http://127.0.0.1:8000${colors.reset}\n`);
          startFrontend(backend);
        }
      }

      if (output.toLowerCase().includes('error') && !output.includes('INFO')) {
        console.log(`${colors.red}[后端] ${output.trim()}${colors.reset}`);
      }
    });

    backend.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server listening on') || output.includes('8000') || output.includes('Papyrus backend started')) {
        if (!backendReady) {
          backendReady = true;
          console.log(`${colors.green}后端已启动: http://127.0.0.1:8000${colors.reset}\n`);
          startFrontend(backend);
        }
      } else if (output.toLowerCase().includes('error')) {
        console.log(`${colors.red}[后端] ${output.trim()}${colors.reset}`);
      }
    });

    backend.on('error', (err) => {
      console.error(`${colors.red}启动后端失败: ${err.message}${colors.reset}`);
      console.log(`${colors.yellow}请确保 Node.js 依赖已安装:${colors.reset}`);
      console.log(`   cd backend && npm install`);
      process.exit(1);
    });

    backend.on('exit', (code) => {
      if (code !== 0 && !backendReady) {
        console.error(`${colors.red}后端进程异常退出 (代码: ${code})${colors.reset}`);
        console.log(`${colors.yellow}尝试输出:${colors.reset}`);
        backendOutput.forEach(line => console.log(line));
        process.exit(1);
      }
    });

    setTimeout(() => {
      if (!backendReady) {
        console.log(`${colors.red}后端启动超时 (30秒)${colors.reset}`);
        console.log(`${colors.yellow}后端输出:${colors.reset}`);
        backendOutput.forEach(line => console.log(line));
        backend.kill();
        process.exit(1);
      }
    }, 30000);
  }
}

start();