import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_AUTH_TOKEN } from './test-auth.js';

const workerId = process.env.JEST_WORKER_ID ?? '0';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `papyrus-jest-w${workerId}-`));
process.env.PAPYRUS_DATA_DIR = tmpDir;
process.env.PAPYRUS_AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN ?? TEST_AUTH_TOKEN;
// 测试中的 global.fetch mock 必须优先于开发机真实系统代理。
// 原因：Windows/macOS 的系统代理会让更新检查绕过 mock 并访问网络，导致环境相关失败。
// 未删除 HTTP(S)_PROXY：代理工具单测仍需要显式覆盖环境变量并验证优先级。
process.env.PAPYRUS_DISABLE_SYSTEM_PROXY = '1';
