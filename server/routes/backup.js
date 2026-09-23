import { Router } from 'express';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZipArchive } from 'archiver';

export function rotasBackup({ db, dataDir, hoje }) {
  const r = Router();

  r.get('/backup', (req, res, next) => {
    // VACUUM INTO gera uma cópia consistente do banco mesmo com o servidor rodando.
    const copia = path.join(os.tmpdir(), `crm-backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${copia.replaceAll("'", "''")}'`);
    const uploads = path.join(dataDir, 'uploads');
    mkdirSync(uploads, { recursive: true });

    const zip = new ZipArchive();
    zip.on('error', next);
    res.on('close', () => rmSync(copia, { force: true }));
    res.attachment(`crm-madia-backup-${hoje()}.zip`);
    zip.pipe(res);
    zip.file(copia, { name: 'crm.db' });
    zip.directory(uploads, 'uploads');
    zip.finalize();
  });

  return r;
}
