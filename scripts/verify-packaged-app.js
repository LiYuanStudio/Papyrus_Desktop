/**
 * Verify the packaged Electron application metadata, resources, and backend runtime.
 *
 * The dependency gate proves selected files exist; this smoke gate additionally proves
 * the packaged versions agree and the production backend can serve its health endpoint.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const asar = require('@electron/asar');
const {
  DIST_ELECTRON,
  findAppAsar,
  findExtraResourcesDir,
} = require('./verify-packaged-deps');

const BACKEND_START_TIMEOUT_MS = 45_000;
const HEALTH_POLL_INTERVAL_MS = 250;
const HEALTH_AUTH_TOKEN = 'packaged-health-check-token-000000';

// Parse a JSON buffer or file with a source-aware error.
// This makes malformed packaged metadata actionable in CI instead of surfacing as an opaque parser stack.
// A silent fallback is not used because corrupt package metadata must block a release.
function parseJson(content, source) {
  try {
    return JSON.parse(content.toString('utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${source}: ${message}`);
  }
}

// Assert metadata shared by the root Electron package and packaged backend.
// Matching both versions prevents About, updater, installer, and backend User-Agent values from diverging.
// Loose semver comparison is not used because release artifacts must preserve the exact prerelease string.
function validatePackageMetadata(appPackage, backendPackage, expectedVersion) {
  if (appPackage.version !== expectedVersion) {
    throw new Error(
      `Packaged app version mismatch: expected ${expectedVersion}, received ${String(appPackage.version)}`,
    );
  }
  if (backendPackage.version !== expectedVersion) {
    throw new Error(
      `Packaged backend version mismatch: expected ${expectedVersion}, received ${String(backendPackage.version)}`,
    );
  }
  if (appPackage.main !== 'electron/main.js') {
    throw new Error(
      `Packaged Electron entry mismatch: expected electron/main.js, received ${String(appPackage.main)}`,
    );
  }
}

// Confirm that the packaged renderer contains the exact release version shown on the About page.
// This catches a stale frontend build even when app.asar/package.json and backend metadata are current.
// Filename or HTML checks alone are not used because they cannot prove Vite injected __APP_VERSION__.
function validateFrontendVersion(frontendJavaScript, expectedVersion) {
  const containsExpectedVersion = frontendJavaScript.some((content) => (
    content.includes(expectedVersion)
  ));
  if (!containsExpectedVersion) {
    throw new Error(`Packaged frontend version missing: expected ${expectedVersion}`);
  }
}

// Reject database and legacy user-data filenames anywhere in packaged application resources.
// This turns the privacy boundary into a release gate instead of relying only on builder include rules.
// Content inspection is not used because user records must never reach an artifact under any filename in this set.
function validateNoPackagedUserData(packagedPaths) {
  const forbiddenPaths = packagedPaths.filter((filePath) => {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    const fileName = normalizedPath.split('/').at(-1) ?? '';
    const isDependencyFile = normalizedPath.includes('/node_modules/');
    return (
      /(?:\.db|\.sqlite|\.sqlite3)(?:-(?:wal|shm))?$/.test(fileName)
      || (!isDependencyFile && (fileName === 'data.json' || fileName === 'ai_config.json'))
    );
  });
  if (forbiddenPaths.length > 0) {
    throw new Error(`Packaged user data detected: ${forbiddenPaths.join(', ')}`);
  }
}

// List resource files recursively as paths relative to the packaged resources directory.
// Relative paths make privacy-gate failures readable and independent of runner workspace locations.
// A glob dependency is not used because this small synchronous walk runs once after packaging.
function listResourceFiles(rootDir) {
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        files.push(path.relative(rootDir, fullPath));
      }
    }
  };
  visit(rootDir);
  return files;
}

// Reserve an available loopback port before starting the packaged backend.
// An ephemeral port avoids collisions with developer services and concurrent matrix jobs.
// A fixed port is not used because hosted and self-hosted runners may already occupy port 8000.
async function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a loopback port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

// Request the public backend health endpoint and validate both status and payload.
// Checking the response body catches unrelated processes that happen to occupy the reserved port.
// A TCP-only probe is not used because it cannot prove Fastify route registration completed.
async function requestHealth(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        path: '/api/health',
        port,
        timeout: 2_000,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            const payload = JSON.parse(body);
            resolve(response.statusCode === 200 && payload.status === 'ok');
          } catch {
            resolve(false);
          }
        });
      },
    );
    request.once('error', () => resolve(false));
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

// Wait until the packaged backend is healthy, exits, or reaches the release-gate timeout.
// Polling mirrors Electron startup behavior while retaining child output for a useful CI failure.
// A fixed sleep is not used because native dependency startup time differs substantially by runner.
async function waitForBackendHealth(child, port, readOutput) {
  const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged backend exited early with code ${child.exitCode}\n${readOutput()}`);
    }
    if (await requestHealth(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(`Packaged backend health check timed out\n${readOutput()}`);
}

// Stop the smoke-test backend and wait briefly for its shutdown handler.
// Waiting prevents the verification process from leaving an active child on self-hosted runners.
// Forceful process-tree tooling is not used because the backend owns no child process in this check.
async function stopBackend(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

// Validate the unpacked resources and start the exact compiled backend entry shipped to users.
// This exercises production ESM imports plus runtime dependencies such as Fastify, SQLite, and Sharp.
// Source-tree startup is not used because it would miss copy, prune, and packaging failures.
async function smokeTestPackagedBackend(resourcesDir, expectedVersion) {
  const backendDir = path.join(resourcesDir, 'backend');
  const serverPath = path.join(backendDir, 'dist', 'api', 'server.js');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-packaged-health-'));
  const port = await reserveLoopbackPort();
  const mcpPort = await reserveLoopbackPort();
  const output = [];
  const child = spawn(process.execPath, [serverPath], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PAPYRUS_AUTH_TOKEN: HEALTH_AUTH_TOKEN,
      PAPYRUS_DATA_DIR: dataDir,
      PAPYRUS_MCP_PORT: String(mcpPort),
      PAPYRUS_PORT: String(port),
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const appendOutput = (chunk) => {
    output.push(chunk.toString());
    if (output.length > 100) {
      output.shift();
    }
  };
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);

  try {
    await waitForBackendHealth(child, port, () => output.join('').slice(-8_000));
    const versionResponse = await new Promise((resolve, reject) => {
      const request = http.get({
        headers: {
          'x-papyrus-token': HEALTH_AUTH_TOKEN,
        },
        host: '127.0.0.1',
        path: '/api/update/version',
        port,
        timeout: 2_000,
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, statusCode: response.statusCode }));
      });
      request.once('error', reject);
      request.once('timeout', () => {
        request.destroy(new Error('Packaged backend version request timed out'));
      });
    });
    const payload = parseJson(versionResponse.body, 'packaged backend version response');
    if (versionResponse.statusCode !== 200 || payload.version !== expectedVersion) {
      throw new Error(
        `Packaged backend version endpoint mismatch: expected ${expectedVersion}, received ${String(payload.version)}`,
      );
    }
  } finally {
    await stopBackend(child);
  }
}

// Verify packaged files that must agree before the installer can be considered releasable.
// Reading app.asar and extraResources reflects the actual electron-builder output, not source files.
// Installer filename and size alone are not used because a large artifact can still be structurally broken.
async function main() {
  const expectedPackage = parseJson(
    fs.readFileSync(path.join(__dirname, '..', 'package.json')),
    'root package.json',
  );
  const expectedVersion = expectedPackage.version;
  const asarPath = findAppAsar();
  const resourcesDir = findExtraResourcesDir();
  if (!asarPath) {
    throw new Error(`app.asar not found below ${DIST_ELECTRON}`);
  }
  if (!resourcesDir) {
    throw new Error(`Packaged resources/backend not found below ${DIST_ELECTRON}`);
  }

  const asarEntries = asar.listPackage(asarPath)
    .map((entry) => entry.replace(/^[\\/]/, ''));
  validateNoPackagedUserData([
    ...asarEntries,
    ...listResourceFiles(resourcesDir),
  ]);

  const appPackage = parseJson(asar.extractFile(asarPath, 'package.json'), 'app.asar/package.json');
  const backendPackagePath = path.join(resourcesDir, 'backend', 'package.json');
  const backendPackage = parseJson(
    fs.readFileSync(backendPackagePath),
    backendPackagePath,
  );
  validatePackageMetadata(appPackage, backendPackage, expectedVersion);

  // @electron/asar resolves nested entries with the host separator used while packaging.
  // path.join therefore supports Windows backslashes and POSIX slashes with one code path.
  // A hard-coded forward slash is not used because v3 rejects it for nested Windows entries.
  const frontendIndexEntry = path.join('frontend', 'dist', 'index.html');
  const frontendHtml = asar.extractFile(asarPath, frontendIndexEntry).toString('utf8');
  if (!frontendHtml.includes('id="root"')) {
    throw new Error('Packaged frontend index is missing the React root element');
  }
  const frontendJavaScript = asarEntries
    .filter((entry) => (
      /^frontend[\\/]dist[\\/]assets[\\/].+\.js$/.test(entry)
    ))
    .map((entry) => asar.extractFile(asarPath, entry).toString('utf8'));
  validateFrontendVersion(frontendJavaScript, expectedVersion);

  const backendDistPackagePath = path.join(resourcesDir, 'backend', 'dist', 'package.json');
  const backendDistPackage = parseJson(
    fs.readFileSync(backendDistPackagePath),
    backendDistPackagePath,
  );
  if (
    backendDistPackage.type !== 'module'
    || backendDistPackage.imports?.['#/*'] !== './*'
  ) {
    throw new Error('Packaged backend dist/package.json is missing production ESM imports');
  }

  for (const iconName of ['icon.ico', 'icon.icns', 'icon.png']) {
    const iconPath = path.join(resourcesDir, 'assets', iconName);
    if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size === 0) {
      throw new Error(`Packaged application icon is missing or empty: ${iconName}`);
    }
  }

  await smokeTestPackagedBackend(resourcesDir, expectedVersion);
  console.log(`Packaged application health check passed for ${expectedVersion}`);
}

module.exports = {
  listResourceFiles,
  parseJson,
  validateFrontendVersion,
  validateNoPackagedUserData,
  validatePackageMetadata,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
