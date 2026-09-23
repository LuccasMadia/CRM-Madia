import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gravarPortfolio, lerJsonAtual, hashesDoRepo, hashesDasCopias } from './write.js';

let repo;
let uploads;
beforeEach(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), 'crm-repo-'));
  uploads = mkdtempSync(path.join(os.tmpdir(), 'crm-up-'));
  writeFileSync(path.join(uploads, 'a.png'), 'AAA');
  writeFileSync(path.join(uploads, 'b.png'), 'BBB');
});

const json = { generatedAt: 'T', stats: { projectsDelivered: 1 }, projects: [{ id: 'x', images: ['/projects/x/01.png'] }] };

describe('gravarPortfolio', () => {
  it('grava JSON formatado e copia as imagens', () => {
    gravarPortfolio(repo, { json, copias: [{ origem: path.join(uploads, 'a.png'), destino: 'x/01.png' }] });
    expect(readFileSync(path.join(repo, 'src/data/projects.json'), 'utf8')).toBe(`${JSON.stringify(json, null, 2)}\n`);
    expect(readFileSync(path.join(repo, 'public/projects/x/01.png'), 'utf8')).toBe('AAA');
    expect(lerJsonAtual(repo)).toEqual(json);
  });

  it('remove imagens e pastas que não fazem mais parte', () => {
    mkdirSync(path.join(repo, 'public/projects/velho'), { recursive: true });
    writeFileSync(path.join(repo, 'public/projects/velho/01.png'), 'old');
    gravarPortfolio(repo, { json, copias: [{ origem: path.join(uploads, 'a.png'), destino: 'x/01.png' }] });
    expect(readdirSync(path.join(repo, 'public/projects'))).toEqual(['x']);
    expect(existsSync(path.join(repo, 'public/.projects-tmp'))).toBe(false);
  });

  it('se uma cópia falha, mantém public/projects anterior e limpa a pasta temporária', () => {
    mkdirSync(path.join(repo, 'public/projects/x'), { recursive: true });
    writeFileSync(path.join(repo, 'public/projects/x/01.png'), 'anterior');
    expect(() =>
      gravarPortfolio(repo, {
        json,
        copias: [
          { origem: path.join(uploads, 'a.png'), destino: 'x/01.png' },
          { origem: path.join(uploads, 'sumiu.png'), destino: 'x/02.png' },
        ],
      }),
    ).toThrow();
    expect(readFileSync(path.join(repo, 'public/projects/x/01.png'), 'utf8')).toBe('anterior');
    expect(existsSync(path.join(repo, 'public/.projects-tmp'))).toBe(false);
    expect(existsSync(path.join(repo, 'src/data/projects.json'))).toBe(false);
  });
});

describe('hashes', () => {
  it('hashes do repo e das cópias coincidem para o mesmo conteúdo', () => {
    const copias = [{ origem: path.join(uploads, 'a.png'), destino: 'x/01.png' }];
    gravarPortfolio(repo, { json, copias });
    expect(hashesDoRepo(repo, json)).toEqual(hashesDasCopias(copias));
    expect(hashesDoRepo(repo, null)).toEqual({});
  });
});
