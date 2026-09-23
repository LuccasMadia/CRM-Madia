import { describe, it, expect } from 'vitest';
import { diffPortfolio } from './diff.js';

const projeto = (id, extra = {}) => ({ id, title: id.toUpperCase(), description: 'd', stack: ['x'], images: [`/projects/${id}/01.png`], ...extra });
const json = (projects, delivered = 3) => ({ stats: { projectsDelivered: delivered }, projects });

describe('diffPortfolio', () => {
  it('primeira publicação: tudo adicionado', () => {
    const d = diffPortfolio(null, json([projeto('a')]));
    expect(d).toMatchObject({ adicionados: ['A'], removidos: [], alterados: [], semMudancas: false });
    expect(d.projectsDelivered).toEqual({ antes: null, depois: 3 });
  });

  it('sem mudanças quando conteúdo e hashes batem', () => {
    const hashes = { '/projects/a/01.png': 'h1' };
    const d = diffPortfolio(json([projeto('a')]), json([projeto('a')]), { hashesAtuais: hashes, hashesNovos: hashes });
    expect(d.semMudancas).toBe(true);
  });

  it('detecta campos alterados, imagem trocada, removidos, ordem e contador', () => {
    const antes = json([projeto('a'), projeto('b'), projeto('c')], 3);
    const depois = json([projeto('b'), projeto('a', { title: 'Novo A', status: 'Em funcionamento' })], 4);
    const d = diffPortfolio(antes, depois, {
      hashesAtuais: { '/projects/a/01.png': 'h1', '/projects/b/01.png': 'h2' },
      hashesNovos: { '/projects/a/01.png': 'OUTRO', '/projects/b/01.png': 'h2' },
    });
    expect(d.removidos).toEqual(['C']);
    expect(d.alterados).toEqual([{ id: 'a', title: 'Novo A', campos: ['title', 'status'], imagensAlteradas: 1 }]);
    expect(d.ordemAlterada).toBe(true);
    expect(d.projectsDelivered).toEqual({ antes: 3, depois: 4 });
    expect(d.semMudancas).toBe(false);
  });
});
