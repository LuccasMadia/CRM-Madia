import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { ErroHttp } from './erros.js';

const EXTENSOES_IMAGEM = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
export const EXTENSOES_MIDIA_POST = {
  ...EXTENSOES_IMAGEM,
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
};
const TAMANHO_PADRAO = 10 * 1024 * 1024;

export function criarUpload(dataDir, extensoes = EXTENSOES_IMAGEM, { tamanhoMaximo = TAMANHO_PADRAO } = {}) {
  const destino = path.join(dataDir, 'uploads');
  mkdirSync(destino, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: destino,
      filename: (req, arquivo, cb) => cb(null, randomUUID() + extensoes[arquivo.mimetype]),
    }),
    limits: { fileSize: tamanhoMaximo, files: 20 },
    fileFilter: (req, arquivo, cb) =>
      extensoes[arquivo.mimetype]
        ? cb(null, true)
        : cb(new ErroHttp(400, `Formato não suportado: ${arquivo.originalname}`)),
  });
}

export function removerArquivos(arquivos = []) {
  for (const arquivo of arquivos) rmSync(arquivo.path, { force: true });
}
