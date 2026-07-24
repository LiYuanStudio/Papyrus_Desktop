import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Files', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-files-test-${Date.now()}`);

  let listFiles: typeof import('../../src/core/files.js').listFiles;
  let createFolder: typeof import('../../src/core/files.js').createFolder;
  let saveFile: typeof import('../../src/core/files.js').saveFile;
  let deleteFileItem: typeof import('../../src/core/files.js').deleteFileItem;
  let getFileById: typeof import('../../src/core/files.js').getFileById;
  let getFileStream: typeof import('../../src/core/files.js').getFileStream;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;

    const files = await import('../../src/core/files.js');
    listFiles = files.listFiles;
    createFolder = files.createFolder;
    saveFile = files.saveFile;
    deleteFileItem = files.deleteFileItem;
    getFileById = files.getFileById;
    getFileStream = files.getFileStream;
  });

  afterAll(async () => {
    const { closeDb } = await import('../../src/db/database.js');
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    // Clean all files between tests
    const all = listFiles();
    for (const f of all) {
      try {
        deleteFileItem(f.id);
      } catch {
        // ignore
      }
    }
  });

  describe('createFolder', () => {
    it('should create a folder with trimmed name', () => {
      const folder = createFolder('  My Folder  ');
      expect(folder.name).toBe('My Folder');
      expect(folder.is_folder).toBe(1);
      expect(folder.itemCount).toBe(0);
      expect(typeof folder.id).toBe('string');
    });

    it('should create folder with parent id', () => {
      const parent = createFolder('Parent');
      const child = createFolder('Child', parent.id);
      expect(child.parent_id).toBe(parent.id);
    });
  });

  describe('saveFile', () => {
    it('should save a file from base64 content', () => {
      const content = Buffer.from('Hello, World!').toString('base64');
      const file = saveFile('hello.txt', content, 'text/plain');
      expect(file.name).toBe('hello.txt');
      expect(file.size).toBe(13);
      expect(file.type).toBe('document');
      expect(file.mime_type).toBe('text/plain');
      expect(file.is_folder).toBe(0);

      // Verify file was written to disk
      expect(fs.existsSync(file.file_storage_path!)).toBe(true);
      const diskContent = fs.readFileSync(file.file_storage_path!, 'utf8');
      expect(diskContent).toBe('Hello, World!');
    });

    it('should infer mime type from extension', () => {
      const content = Buffer.from('test').toString('base64');
      const file = saveFile('photo.png', content);
      expect(file.mime_type).toBe('image/png');
      expect(file.type).toBe('image');
    });

    it('should infer file type from extension', () => {
      const content = Buffer.from('test').toString('base64');
      expect(saveFile('video.mp4', content).type).toBe('video');
      expect(saveFile('song.mp3', content).type).toBe('audio');
      expect(saveFile('archive.zip', content).type).toBe('archive');
      expect(saveFile('doc.pdf', content).type).toBe('document');
      expect(saveFile('unknown.xyz', content).type).toBe('unknown');
    });

    it('should save file with parent id', () => {
      const folder = createFolder('Docs');
      const content = Buffer.from('data').toString('base64');
      const file = saveFile('note.txt', content, 'text/plain', folder.id);
      expect(file.parent_id).toBe(folder.id);
    });
  });

  describe('listFiles', () => {
    it('should return empty array when no files exist', () => {
      const all = listFiles();
      expect(Array.isArray(all)).toBe(true);
    });

    it('should include itemCount for folders', () => {
      const folder = createFolder('Folder');
      const content = Buffer.from('data').toString('base64');
      saveFile('a.txt', content, 'text/plain', folder.id);
      saveFile('b.txt', content, 'text/plain', folder.id);

      const all = listFiles();
      const found = all.find(f => f.id === folder.id);
      expect(found).toBeDefined();
      expect(found!.itemCount).toBe(2);
    });
  });

  describe('deleteFileItem', () => {
    it('should delete a file and its disk content', () => {
      const content = Buffer.from('delete me').toString('base64');
      const file = saveFile('delete-me.txt', content);
      const storagePath = file.file_storage_path!;

      expect(fs.existsSync(storagePath)).toBe(true);
      const result = deleteFileItem(file.id);
      expect(result.deleted).toBe(1);
      expect(fs.existsSync(storagePath)).toBe(false);
      expect(getFileById(file.id)).toBeNull();
    });

    it('should recursively delete a folder', () => {
      const folder = createFolder('Folder');
      const content = Buffer.from('data').toString('base64');
      const file1 = saveFile('a.txt', content, 'text/plain', folder.id);
      const file2 = saveFile('b.txt', content, 'text/plain', folder.id);

      const result = deleteFileItem(folder.id);
      expect(result.deleted).toBe(3); // folder + 2 files
      expect(getFileById(folder.id)).toBeNull();
      expect(getFileById(file1.id)).toBeNull();
      expect(getFileById(file2.id)).toBeNull();
    });

    it('should return 0 for non-existent file', () => {
      const result = deleteFileItem('no-such-id');
      expect(result.deleted).toBe(0);
    });
  });

  describe('getFileStream', () => {
    it('should return null for non-existent file', () => {
      expect(getFileStream('no-such-id')).toBeNull();
    });

    it('should return stream for existing file', (done) => {
      const content = Buffer.from('stream content').toString('base64');
      const file = saveFile('stream.txt', content);
      const result = getFileStream(file.id);
      expect(result).not.toBeNull();
      expect(result!.file.id).toBe(file.id);

      const chunks: Buffer[] = [];
      result!.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      result!.stream.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        expect(data).toBe('stream content');
        done();
      });
      result!.stream.on('error', done);
    });
  });

  describe('edge cases', () => {
    it('saveFile should throw for content exceeding 50MB', () => {
      const oversized = Buffer.alloc(51 * 1024 * 1024).toString('base64');
      expect(() => saveFile('big.bin', oversized)).toThrow(/超过限制/);
    });

    it('saveFile sanitizes path traversal in disk storage path', () => {
      const content = Buffer.from('test').toString('base64');
      const file = saveFile('..\\evil.txt', content);
      expect(file.file_storage_path).not.toMatch(/\.\./);
      const storageName = path.basename(file.file_storage_path!);
      expect(storageName).not.toContain('\\');
      // record.name preserves original for display
      expect(file.name).toContain('..');
    });

    it('deleteFileItem returns 0 for non-existent file', () => {
      const result = deleteFileItem('nonexistent123');
      expect(result.deleted).toBe(0);
    });
  });
});
