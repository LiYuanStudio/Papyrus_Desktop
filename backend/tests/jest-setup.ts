import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_AUTH_TOKEN } from './test-auth.js';

const workerId = process.env.JEST_WORKER_ID ?? '0';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `papyrus-jest-w${workerId}-`));
process.env.PAPYRUS_DATA_DIR = tmpDir;
process.env.PAPYRUS_AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN ?? TEST_AUTH_TOKEN;
