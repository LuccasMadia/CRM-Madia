import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const CAMINHO_JSON = 'src/data/projects.json';
export const PASTA_IMAGENS = 'public/projects';

export function hashArquivo(caminho) {
  try {
    return createHash('sha256').update(readFileSync(caminho)).digest('hex');
  } catch (erro) {
    if (erro.code === 'ENOENT') return undefined;
    throw erro;
  }
}

export function lerJsonAtual(repo) {
  const arquivo = path.join(repo, CAMINHO_JSON);
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : null;
}

export function hashesDoRepo(repo, json) {
  const hashes = {};
  for (const projeto of json?.projects ?? []) {
    for (const web of projeto.images ?? []) hashes[web] = hashArquivo(path.join(repo, 'public', web));
  }
  return hashes;
}

export function hashesDasCopias(copias) {
  return Object.fromEntries(copias.map(({ origem, destino }) => [`/projects/${destino}`, hashArquivo(origem)]));
}

export function gravarPortfolio(repo, { json, copias }) {
  const temporaria = path.join(repo, 'public', '.projects-tmp');
  const final = path.join(repo, PASTA_IMAGENS);
  rmSync(temporaria, { recursive: true, force: true });
  try {
    mkdirSync(temporaria, { recursive: true });
    for (const { origem, destino } of copias) {
      const alvo = path.join(temporaria, destino);
      mkdirSync(path.dirname(alvo), { recursive: true });
      copyFileSync(origem, alvo);
    }
  } catch (erro) {
    rmSync(temporaria, { recursive: true, force: true });
    throw erro;
  }
  // Troca em duas renomeações: se o Windows recusar (pasta em uso), a pasta anterior volta ao lugar.
  const anterior = path.join(repo, 'public', '.projects-old');
  rmSync(anterior, { recursive: true, force: true });
  const existia = existsSync(final);
  if (existia) renameSync(final, anterior);
  try {
    renameSync(temporaria, final);
  } catch (erro) {
    if (existia) renameSync(anterior, final);
    rmSync(temporaria, { recursive: true, force: true });
    throw erro;
  }
  rmSync(anterior, { recursive: true, force: true });

  const arquivoJson = path.join(repo, CAMINHO_JSON);
  mkdirSync(path.dirname(arquivoJson), { recursive: true });
  writeFileSync(arquivoJson, `${JSON.stringify(json, null, 2)}\n`);
}
