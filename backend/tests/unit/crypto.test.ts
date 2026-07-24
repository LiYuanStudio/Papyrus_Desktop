import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';

describe('Crypto', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-crypto-test-${Date.now()}`);
  const masterKeyPath = path.join(testDir, '.master_key');
  const saltPath = path.join(testDir, '.salt');

  let encryptApiKey: (apiKey: string) => string;
  let decryptApiKey: (encryptedKey: string) => string;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;

    const crypto = await import('../../src/core/crypto.js');
    encryptApiKey = crypto.encryptApiKey;
    decryptApiKey = crypto.decryptApiKey;
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    fs.rmSync(masterKeyPath, { force: true });
    fs.rmSync(saltPath, { force: true });
  });

  it('should encrypt and decrypt an API key', () => {
    const key = 'sk-test123456789';
    const encrypted = encryptApiKey(key);

    expect(encrypted).toMatch(/^enc:/);

    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(key);
  });

  it('should return empty string for invalid encrypted data', () => {
    const decrypted = decryptApiKey('enc:invalid_data');
    expect(decrypted).toBe('');
  });

  it('should handle plain: prefix', () => {
    const decrypted = decryptApiKey('plain:mykey');
    expect(decrypted).toBe('mykey');
  });

  it('should return original string for non-encrypted data', () => {
    const key = 'some-random-key';
    const decrypted = decryptApiKey(key);
    expect(decrypted).toBe(key);
  });

  it('should handle empty string', () => {
    expect(encryptApiKey('')).toBe('');
    expect(decryptApiKey('')).toBe('');
  });

  it('should produce different ciphertexts for same plaintext', () => {
    const key = 'sk-test123456789';
    const encrypted1 = encryptApiKey(key);
    const encrypted2 = encryptApiKey(key);

    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptApiKey(encrypted1)).toBe(key);
    expect(decryptApiKey(encrypted2)).toBe(key);
  });

  it('should handle special characters in API key', () => {
    const key = 'sk-测试!@#$%^&*()_+-=[]{}|\'\:",./<>?';
    const encrypted = encryptApiKey(key);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(key);
  });

  it('should derive key from non-32-byte master key for backward compatibility', () => {
    fs.writeFileSync(masterKeyPath, Buffer.from('short-key'));

    const key = 'sk-test123456789';
    const encrypted = encryptApiKey(key);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(key);
  });

  it('should return empty string when decryption fails with corrupted auth tag', () => {
    const key = 'sk-test123456789';
    const encrypted = encryptApiKey(key);
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    const decrypted = decryptApiKey(tampered);
    expect(decrypted).toBe('');
  });

  it('should handle enc: prefix with invalid base64url', () => {
    const decrypted = decryptApiKey('enc:!!!invalid!!!');
    expect(decrypted).toBe('');
  });

  it('should handle very long API key', () => {
    const key = 'sk-' + 'a'.repeat(4096);
    const encrypted = encryptApiKey(key);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(key);
  });

  it('should return empty string when getCipherKey returns null during decrypt', () => {
    const key = 'sk-test123456789';
    const encrypted = encryptApiKey(key);

    fs.rmSync(masterKeyPath, { force: true });
    fs.rmSync(saltPath, { force: true });

    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe('');
  });

  it('should throw when encryption cipher key is null', () => {
    fs.rmSync(masterKeyPath, { force: true });
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => encryptApiKey('sk-test')).toThrow('Failed to initialize encryption cipher');
    mkdirSpy.mockRestore();
  });

  it('should return empty string when cipher key is null during decrypt', () => {
    const key = 'sk-test-null';
    const encrypted = encryptApiKey(key);
    fs.rmSync(masterKeyPath, { force: true });
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(decryptApiKey(encrypted)).toBe('');
    mkdirSpy.mockRestore();
  });

  it('should fallback write when restricted mode fails for master key', () => {
    fs.rmSync(masterKeyPath, { force: true });
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath, data, options?) => {
      if (options && typeof options === 'object' && 'mode' in options) {
        throw new Error('permission denied');
      }
      writeSpy.mockRestore();
      fs.writeFileSync(filePath as string, data as string | NodeJS.ArrayBufferView, options);
    });
    const key = 'sk-fallback-master';
    const encrypted = encryptApiKey(key);
    writeSpy.mockRestore();
    expect(encrypted).toMatch(/^enc:/);
    expect(decryptApiKey(encrypted)).toBe(key);
  });

  it('should fallback write when restricted mode fails for salt', () => {
    fs.writeFileSync(masterKeyPath, Buffer.from('short-key'));
    fs.rmSync(saltPath, { force: true });
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath, data, options?) => {
      if (options && typeof options === 'object' && 'mode' in options) {
        throw new Error('permission denied');
      }
      writeSpy.mockRestore();
      fs.writeFileSync(filePath as string, data as string | NodeJS.ArrayBufferView, options);
    });
    const key = 'sk-fallback-salt';
    const encrypted = encryptApiKey(key);
    writeSpy.mockRestore();
    expect(decryptApiKey(encrypted)).toBe(key);
  });

  it('should throw when salt creation fails completely', () => {
    // Use a short master key to force key derivation (which needs salt)
    fs.writeFileSync(masterKeyPath, Buffer.from('short-key'));
    fs.rmSync(saltPath, { force: true });

    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => encryptApiKey('test')).toThrow();
    spy.mockRestore();
  });
  describe('edge cases', () => {
    it('should return empty string for corrupted encrypted data', () => {
      const corrupted = 'enc:' + Buffer.from('garbage').toString('base64url');
      expect(decryptApiKey(corrupted)).toBe('');
    });

    it('should encrypt and decrypt empty string', () => {
      const encrypted = encryptApiKey('');
      expect(decryptApiKey(encrypted)).toBe('');
    });

    it('should decrypt plain: prefix correctly', () => {
      expect(decryptApiKey('plain:hello')).toBe('hello');
    });

    it('should decrypt legacy plaintext without prefix', () => {
      expect(decryptApiKey('just-a-key')).toBe('just-a-key');
    });
  });
});
