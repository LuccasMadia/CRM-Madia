import { describe, it, expect } from 'vitest';
import { lerProjetosDoPortfolio } from './import.js';
import { criarPortfolioFalso } from '../test/portfolioFalso.js';

describe('lerProjetosDoPortfolio', () => {
  it('carrega o content.js com as imagens resolvidas para URLs do Vite', async () => {
    const repo = criarPortfolioFalso();
    const projetos = await lerProjetosDoPortfolio(repo);
    expect(projetos.map((p) => p.title)).toEqual(['Canecas da Dri', 'Rango do Bicho']);
    expect(projetos[0].images).toEqual(['/src/assets/projects/a/a-00.png', '/src/assets/projects/a/a-01.png']);
  }, 20000);
});
