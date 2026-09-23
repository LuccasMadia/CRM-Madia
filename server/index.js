import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/connection.js';
import { criarApp } from './app.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.CRM_DATA_DIR ?? path.join(raiz, 'data');
const PORTA = 5174;

const db = openDb(path.join(dataDir, 'crm.db'));
criarApp({ db, dataDir }).listen(PORTA, '127.0.0.1', () => {
  console.log(`API do CRM em http://127.0.0.1:${PORTA}`);
});
