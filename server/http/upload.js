import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { ErroHttp } from './erros.js';

const EXTENSOES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

export function criarUpload(dataDir) {
  const destino = path.join(dataDir, 'uploads');
  mkdirSync(destino, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: destino,
      filename: (req, arquivo, cb) => cb(null, randomUUID() + EXTENSOES[arquivo.mimetype]),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 20 },
    fileFilter: (req, arquivo, cb) =>
      EXTENSOES[arquivo.mimetype]
        ? cb(null, true)
        : cb(new ErroHttp(400, `Formato não suportado: ${arquivo.originalname} (use PNG, JPG ou WEBP)`)),
  });
}

export function removerArquivos(arquivos = []) {
  for (const arquivo of arquivos) rmSync(arquivo.path, { force: true });
}
