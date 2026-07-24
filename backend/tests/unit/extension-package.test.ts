import { deflateRawSync } from 'node:zlib';
import { parseExtensionManifestFromZip } from '../../src/core/extension-package.js';

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content, 'utf8');
    const compressed = deflateRawSync(content);
    const crc = crc32(content);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    localParts.push(local, compressed);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createStoredZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = entry.content;
    const crc = crc32(content);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    localParts.push(local, content);
    centralParts.push(central);
    offset += local.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe('extension package manifest parser', () => {
  it('should parse minimal manifest from a real zip buffer', () => {
    const zip = createZip([{
      name: 'manifest.json',
      content: JSON.stringify({
        id: 'local.quiz',
        name: 'Local Quiz',
        version: '1.2.3',
        type: 'agent',
        config: { level: 'basic' },
      }),
    }]);

    const manifest = parseExtensionManifestFromZip(zip);
    expect(manifest.id).toBe('local.quiz');
    expect(manifest.name).toBe('Local Quiz');
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.type).toBe('agent');
    expect(manifest.config).toEqual({ level: 'basic' });
  });

  it('should reject a zip without manifest', () => {
    const zip = createZip([{ name: 'readme.txt', content: 'hello' }]);
    expect(() => parseExtensionManifestFromZip(zip)).toThrow('manifest.json');
  });

  describe('edge cases', () => {
    it('should reject zip with invalid EOCD signature', () => {
      const badZip = Buffer.from('PK\x03\x04' + 'A'.repeat(100));
      expect(() => parseExtensionManifestFromZip(badZip)).toThrow(/无法打开扩展 zip/);
    });

    it('should reject manifest with missing required fields', () => {
      const zip = createZip([{
        name: 'manifest.json',
        content: JSON.stringify({ id: '', name: '', version: '1', type: '' }),
      }]);
      expect(() => parseExtensionManifestFromZip(zip)).toThrow();
    });

    it('should find manifest in nested path', () => {
      const zip = createZip([{
        name: 'sub/manifest.json',
        content: JSON.stringify({ id: 'nested', name: 'Nested', version: '1.0.0', type: 'agent' }),
      }]);
      const manifest = parseExtensionManifestFromZip(zip);
      expect(manifest.id).toBe('nested');
    });

    it('should reject a zip larger than the package limit', () => {
      const bigZip = Buffer.concat([Buffer.alloc(10 * 1024 * 1024 + 1), Buffer.from('not zip')]);
      expect(() => parseExtensionManifestFromZip(bigZip)).toThrow(/过大/);
    });

    it('should reject manifest content larger than the manifest limit', () => {
      const hugeManifest = Buffer.from(JSON.stringify({
        id: 'huge',
        name: 'Huge',
        version: '1.0.0',
        type: 'agent',
        description: 'x'.repeat(1024 * 1024),
      }));
      const zip = createStoredZip([{ name: 'manifest.json', content: hugeManifest }]);
      expect(() => parseExtensionManifestFromZip(zip)).toThrow(/manifest 文件过大/);
    });

    it('should reject central directory offsets outside the buffer', () => {
      const zip = Buffer.from(createZip([{
        name: 'manifest.json',
        content: JSON.stringify({ id: 'bad', name: 'Bad', version: '1.0.0', type: 'agent' }),
      }]));
      const eocdOffset = zip.length - 22;
      zip.writeUInt32LE(zip.length + 1024, eocdOffset + 16);
      expect(() => parseExtensionManifestFromZip(zip)).toThrow(/中央目录|结构越界/);
    });

    it('should reject local file headers outside the buffer', () => {
      const zip = Buffer.from(createZip([{
        name: 'manifest.json',
        content: JSON.stringify({ id: 'bad', name: 'Bad', version: '1.0.0', type: 'agent' }),
      }]));
      const centralOffset = zip.readUInt32LE(zip.length - 22 + 16);
      zip.writeUInt32LE(zip.length + 1024, centralOffset + 42);
      expect(() => parseExtensionManifestFromZip(zip)).toThrow(/结构越界|本地文件头|数据越界/);
    });
  });
});
