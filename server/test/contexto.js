import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDb } from '../db/connection.js';
import { criarApp } from '../app.js';

export function criarContexto({ hoje = '2026-09-23' } = {}) {
  const db = openDb(':memory:');
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'crm-teste-'));
  const app = criarApp({ db, dataDir, hoje: () => hoje });
  // Envia o cabeçalho X-CRM em toda requisição, como o frontend faz.
  return { db, dataDir, app, http: request.agent(app).set('X-CRM', '1') };
}
