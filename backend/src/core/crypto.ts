import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { paths, protectPrivateFile } from '../utils/paths.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getMasterKeyPath(): string {
  return paths.masterKeyFile;
}

function getSaltPath(): string {
  return path.join(paths.dataDir, '.salt');
}

function generateMasterKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

function getOrCreateMasterKey(): Buffer | null {
  try {
    const keyPath = getMasterKeyPath();
    if (fs.existsSync(keyPath)) {
      protectPrivateFile(keyPath, 0o400);
      return fs.readFileSync(keyPath);
    }

    const key = generateMasterKey();
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });

    if (process.platform === 'win32') {
      fs.writeFileSync(keyPath, key);
      try { fs.chmodSync(keyPath, 0o400); } catch { /* Windows may not fully support chmod */ }
    } else {
      try {
        fs.writeFileSync(keyPath, key, { mode: 0o400 });
      } catch {
        fs.writeFileSync(keyPath, key);
      }
    }

    protectPrivateFile(keyPath, 0o400);
    return key;
  } catch {
    return null;
  }
}

function getOrCreateSalt(): Buffer {
  try {
    const saltPath = getSaltPath();
    if (fs.existsSync(saltPath)) {
      protectPrivateFile(saltPath);
      return fs.readFileSync(saltPath);
    }

    const salt = randomBytes(SALT_LENGTH);
    fs.mkdirSync(path.dirname(saltPath), { recursive: true });

    if (process.platform === 'win32') {
      fs.writeFileSync(saltPath, salt);
      try { fs.chmodSync(saltPath, 0o600); } catch { /* Windows may not fully support chmod */ }
    } else {
      try {
        fs.writeFileSync(saltPath, salt, { mode: 0o600 });
      } catch {
        fs.writeFileSync(saltPath, salt);
      }
    }

    protectPrivateFile(saltPath);
    return salt;
  } catch (e) {
    throw new Error(`无法创建或读取 salt 文件: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function deriveKey(password: string, salt?: Buffer): Buffer {
  const usedSalt = salt ?? getOrCreateSalt();
  return scryptSync(password, usedSalt, KEY_LENGTH);
}

function getCipherKey(): Buffer | null {
  const masterKey = getOrCreateMasterKey();
  if (masterKey === null) return null;
  if (masterKey.length === KEY_LENGTH) return masterKey;

  const salt = getOrCreateSalt();
  return deriveKey(masterKey.toString('base64'), salt);
}

export function encryptApiKey(apiKey: string): string {
  if (!apiKey) return apiKey;

  const key = getCipherKey();
  if (key === null) {
    throw new Error('Failed to initialize encryption cipher');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return `enc:${combined.toString('base64url')}`;
}

export function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return encryptedKey;

  if (encryptedKey.startsWith('plain:')) {
    console.warn('[SECURITY WARNING] API key is stored in plaintext. Please re-save the provider configuration to enable encryption.');
    return encryptedKey.slice(6);
  }

  if (!encryptedKey.startsWith('enc:')) {
    console.warn('[SECURITY WARNING] API key is stored in plaintext (legacy format). Please re-save the provider configuration to enable encryption.');
    return encryptedKey;
  }

  const key = getCipherKey();
  if (key === null) return '';

  try {
    const combined = Buffer.from(encryptedKey.slice(4), 'base64url');
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[CRYPTO] API key decryption failed:', err instanceof Error ? err.message : String(err));
    return '';
  }
}
