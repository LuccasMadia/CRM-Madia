import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Simula o Windows recusando a troca de pasta (EPERM), p.ex. com o Vite do portfólio rodando.
vi.mock('node:fs', async (original) => {
  const fs = await original();
  return {
    ...fs,
    renameSync: vi.fn((de, para) => {
      if (String(de).endsWith('.projects-tmp')) {
        throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
      }
      return fs.renameSync(de, para);
    }),
  };
});

const { gravarPortfolio } = await import('./write.js');

describe('gravarPortfolio — troca de pasta recusada', () => {
  it('mantém as imagens anteriores e não deixa pastas temporárias', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'crm-troca-'));
    const uploads = mkdtempSync(path.join(os.tmpdir(), 'crm-troca-up-'));
    writeFileSync(path.join(uploads, 'a.png'), 'NOVO');
    mkdirSync(path.join(repo, 'public/projects/x'), { recursive: true });
    writeFileSync(path.join(repo, 'public/projects/x/01.png'), 'anterior');

    expect(() =>
      gravarPortfolio(repo, {
        json: { stats: { projectsDelivered: 0 }, projects: [] },
        copias: [{ origem: path.join(uploads, 'a.png'), destino: 'x/01.png' }],
      }),
    ).toThrow(/EPERM/);

    expect(readFileSync(path.join(repo, 'public/projects/x/01.png'), 'utf8')).toBe('anterior');
    expect(existsSync(path.join(repo, 'public/.projects-tmp'))).toBe(false);
    expect(existsSync(path.join(repo, 'public/.projects-old'))).toBe(false);
    expect(existsSync(path.join(repo, 'src/data/projects.json'))).toBe(false);
  });
});
