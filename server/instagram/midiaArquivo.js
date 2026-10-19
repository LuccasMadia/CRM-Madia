import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ErroHttp } from '../http/erros.js';

const LARGURA_MAXIMA = 1440;

export async function prepararMidia(arquivo, uploadsDir) {
  if (arquivo.mimetype.startsWith('video/')) {
    return { arquivo: path.basename(arquivo.path), tipo: 'video', largura: null, altura: null };
  }

  const nome = `${randomUUID()}.jpg`;
  const destino = path.join(uploadsDir, nome);
  try {
    const { width, height } = await sharp(arquivo.path)
      .rotate()
      .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toFile(destino);
    rmSync(arquivo.path, { force: true });
    return { arquivo: nome, tipo: 'imagem', largura: width, altura: height };
  } catch {
    rmSync(arquivo.path, { force: true });
    rmSync(destino, { force: true });
    throw new ErroHttp(400, `Não foi possível ler a imagem ${arquivo.originalname ?? arquivo.filename}.`);
  }
}
