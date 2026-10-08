import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CAMINHO_PIX_JSON = 'src/data/pix.json';

export function lerPixAtual(repo) {
  const arquivo = path.join(repo, CAMINHO_PIX_JSON);
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {};
}

export function gravarPix(repo, { id, nome, codigo }) {
  const atual = lerPixAtual(repo);
  atual[String(id)] = { nome, codigo };
  const arquivo = path.join(repo, CAMINHO_PIX_JSON);
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, `${JSON.stringify(atual, null, 2)}\n`);
  return atual;
}
