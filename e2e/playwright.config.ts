import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DATA_DIR = join(tmpdir(), `papyrus-e2e-test-data-${process.pid}`);
const AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN || 'e2e-test-token-e2e-test-token-32chars';
const configuredPortBase = Number(process.env.PAPYRUS_E2E_PORT_BASE);
const PORT_BASE = Number.isInteger(configuredPortBase) &&
  configuredPortBase >= 20000 &&
  configuredPortBase <= 65532
  ? configuredPortBase
  : 20000 + ((process.pid % 10000) * 2);
const BACKEND_URL = `http://127.0.0.1:${PORT_BASE}`;
const FRONTEND_URL = `http://127.0.0.1:${PORT_BASE + 1}`;

const MOCK_PROVIDER_URL = 'http://127.0.0.1:' + (PORT_BASE + 3);

// Forward env vars so the backend uses a temp database instead of production data
process.env.PAPYRUS_AUTH_TOKEN = AUTH_TOKEN;
process.env.PAPYRUS_DATA_DIR = TEST_DATA_DIR;
process.env.PAPYRUS_E2E_PORT_BASE = String(PORT_BASE);
process.env.PAPYRUS_PORT = String(PORT_BASE);
process.env.PAPYRUS_MCP_PORT = String(PORT_BASE + 2);
process.env.PAPYRUS_E2E_MOCK_PROVIDER_PORT = String(PORT_BASE + 3);
process.env.PAPYRUS_E2E_MOCK_PROVIDER_URL = MOCK_PROVIDER_URL;
process.env.PAPYRUS_BACKEND_URL = BACKEND_URL;
process.env.PAPYRUS_E2E_FRONTEND_URL = FRONTEND_URL;

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: BACKEND_URL,
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'x-papyrus-token': AUTH_TOKEN,
    },
  },

  webServer: [
    {
      command: 'node fixtures/mock-ai-provider.mjs',
      url: MOCK_PROVIDER_URL + '/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npx --prefix ../backend tsx --tsconfig ../backend/tsconfig.json ../backend/src/api/server.ts',
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `npm --prefix ../frontend run dev -- --host 127.0.0.1 --port ${PORT_BASE + 1}`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
