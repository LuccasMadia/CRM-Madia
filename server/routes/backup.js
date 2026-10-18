import { Router } from 'express';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ZipArchive } from 'archiver';

// VACUUM INTO gera uma cópia consistente do banco mesmo com o servidor rodando.
// O token do Instagram fica fora: o backup é um arquivo que circula, e quem
// restaurar só precisa colar um token novo em Configurações.
export function copiarBanco(db) {
  const copia = path.join(os.tmpdir(), `crm-backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${copia.replaceAll("'", "''")}'`);
  const banco = new DatabaseSync(copia);
  banco.exec("DELETE FROM config WHERE chave IN ('instagram_token', 'instagram_token_expira_em'); VACUUM;");
  banco.close();
  return copia;
}

export function rotasBackup({ db, dataDir, hoje }) {
  const r = Router();

  r.get('/backup', (req, res, next) => {
    const copia = copiarBanco(db);
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
