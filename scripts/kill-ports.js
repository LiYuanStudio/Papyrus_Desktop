#!/usr/bin/env node
/**
 * Cross-platform port cleanup for Papyrus dev servers.
 * Used by npm predev, build-electron.js, and optional launcher scripts.
 */

const { spawnSync } = require('child_process');

const DEV_PORTS = [8000, 5173];

/**
 * Terminate processes listening on the given TCP port.
 * Only LISTENING sockets are targeted (Windows); lsof -ti on Unix.
 *
 * @param {number} port
 * @param {{ onReleased?: (port: number, pid: string) => void }} [options]
 */
function killPort(port, options = {}) {
  const { onReleased } = options;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      const netstatResult = spawnSync('netstat', ['-ano'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const findstrResult = spawnSync('findstr', [`:${port}`], {
        encoding: 'utf8',
        input: netstatResult.stdout,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = (findstrResult.stdout || '').trim().split('\n');

      for (const line of lines) {
        if (!line.includes('LISTENING')) continue;
        const match = line.match(/LISTENING\s+(\d+)/);
        if (!match) continue;

        const pid = match[1];
        spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
        if (onReleased) {
          onReleased(port, pid);
        }
      }
    } else {
      const lsofResult = spawnSync('lsof', ['-ti', `:${port}`], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const pids = (lsofResult.stdout || '').trim().split('\n').filter(Boolean);

      for (const pid of pids) {
        spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
        if (onReleased) {
          onReleased(port, pid);
        }
      }
    }
  } catch {
    // Port not in use or command failed — safe to ignore
  }
}

/**
 * Release default Papyrus dev ports (backend 8000, frontend 5173).
 *
 * @param {{ onReleased?: (port: number, pid: string) => void }} [options]
 */
function killDevPorts(options = {}) {
  for (const port of DEV_PORTS) {
    killPort(port, options);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

if (require.main === module) {
  console.log('Checking port usage...');
  killDevPorts({
    onReleased(port, pid) {
      console.log(`Released port ${port} (PID: ${pid})`);
    },
  });
  sleep(1000);
}

module.exports = { killPort, killDevPorts, DEV_PORTS };
