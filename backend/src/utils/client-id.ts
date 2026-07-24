import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { paths } from './paths.js';

const CLIENT_ID_FILE = path.join(paths.dataDir, 'client_id.txt');

export function getClientId(): string {
  if (fs.existsSync(CLIENT_ID_FILE)) {
    return fs.readFileSync(CLIENT_ID_FILE, 'utf-8').trim();
  }
  const id = uuidv4();
  fs.writeFileSync(CLIENT_ID_FILE, id, 'utf-8');
  return id;
}
