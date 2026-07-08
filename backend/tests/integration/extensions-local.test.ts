import { deflateRawSync } from 'node:zlib';
import { app, initApp } from '../../src/api/server.js';
import { closeDb, getDb, insertFile } from '../../src/db/database.js';
import { patchAppInjectWithAuth } from '../test-auth.js';

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
    const checksum = crc32(content);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(checksum, 14);
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
    central.writeUInt32LE(checksum, 16);
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

describe('local extension install and MCP integration', () => {
  beforeAll(async () => {
    await initApp();
    patchAppInjectWithAuth(app);
  });

  beforeEach(() => {
    getDb().exec('DELETE FROM extensions; DELETE FROM files; DELETE FROM cards; DELETE FROM daily_progress;');
  });

  afterAll(() => {
    closeDb();
  });

  it('should install a local zip extension, persist config, and expose it in list API', async () => {
    const zip = createZip([{
      name: 'papyrus-extension/manifest.json',
      content: JSON.stringify({
        id: 'local.configurable',
        name: 'Configurable Local',
        version: '0.1.0',
        type: 'panel',
        description: 'installed from zip',
        tags: ['local'],
        config: { endpoint: 'http://localhost/plugin' },
      }),
    }]);

    const installResponse = await app.inject({
      method: 'POST',
      url: '/api/extensions/install-local',
      payload: { filename: 'configurable.zip', content: zip.toString('base64') },
    });
    expect(installResponse.statusCode).toBe(200);
    const installBody = JSON.parse(installResponse.body);
    expect(installBody.success).toBe(true);
    expect(installBody.extension.id).toBe('local.configurable');
    expect(installBody.extension.type).toBe('panel');
    expect(installBody.extension.config).toEqual({ endpoint: 'http://localhost/plugin' });

    const configResponse = await app.inject({
      method: 'PUT',
      url: '/api/extensions/local.configurable/config',
      payload: { theme: 'dark', retries: 2 },
    });
    expect(configResponse.statusCode).toBe(200);

    const listResponse = await app.inject({ method: 'GET', url: '/api/extensions' });
    const listBody = JSON.parse(listResponse.body);
    expect(listBody.extensions[0].config).toEqual({ theme: 'dark', retries: 2 });
  });

  it('should expose card CRUD, files, and review stats through /api/mcp/call', async () => {
    const createCardResponse = await app.inject({
      method: 'POST',
      url: '/api/mcp/call',
      payload: { tool: 'create_card', params: { question: 'MCP Q', answer: 'MCP A', tags: ['mcp'] } },
    });
    expect(createCardResponse.statusCode).toBe(200);
    const createdCard = JSON.parse(createCardResponse.body).card as { id: string };
    expect(createdCard.id).toBeTruthy();

    const updateCardResponse = await app.inject({
      method: 'POST',
      url: '/api/mcp/call',
      payload: { tool: 'update_card', params: { card_id: createdCard.id, question: 'MCP Q2' } },
    });
    expect(JSON.parse(updateCardResponse.body).success).toBe(true);

    insertFile({
      id: 'file-mcp-1',
      name: 'mcp.txt',
      type: 'document',
      size: 3,
      mime_type: 'text/plain',
      parent_id: null,
      file_storage_path: null,
      is_folder: 0,
      created_at: 1,
      updated_at: 1,
    });

    const filesResponse = await app.inject({
      method: 'POST',
      url: '/api/mcp/call',
      payload: { tool: 'list_files', params: {} },
    });
    expect(JSON.parse(filesResponse.body).files[0].name).toBe('mcp.txt');

    const reviewStatsResponse = await app.inject({
      method: 'POST',
      url: '/api/mcp/call',
      payload: { tool: 'get_review_stats', params: {} },
    });
    expect(JSON.parse(reviewStatsResponse.body).stats.total_cards).toBe(1);

    const deleteCardResponse = await app.inject({
      method: 'POST',
      url: '/api/mcp/call',
      payload: { tool: 'delete_card', params: { card_id: createdCard.id } },
    });
    expect(JSON.parse(deleteCardResponse.body).success).toBe(true);
  });
});
