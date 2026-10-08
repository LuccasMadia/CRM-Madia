import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { criarContexto } from '../test/contexto.js';
import { criarPortfolioFalso } from '../test/portfolioFalso.js';
import { lerProjetosDoPortfolio } from '../portfolio/import.js';

const hash = (arquivo) => createHash('sha256').update(readFileSync(arquivo)).digest('hex');

let ctx;
let repo;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-09-23' });
  repo = criarPortfolioFalso();
});

describe('configuração', () => {
  it('recusa caminho inválido e salva caminho válido', async () => {
    const res = await ctx.http.put('/api/config').send({ portfolio_repo_path: path.join(repo, 'nada') }).expect(400);
    expect(res.body.erros[0].campo).toBe('portfolio_repo_path');
    await ctx.http.put('/api/config').send({ portfolio_repo_path: repo }).expect(200);
    expect((await ctx.http.get('/api/config')).body).toEqual({ portfolio_repo_path: repo });
  });

  it('publicação sem configuração responde 400 com mensagem', async () => {
    const res = await ctx.http.post('/api/portfolio/previa').expect(400);
    expect(res.body.erro).toMatch(/Configure o caminho/);
  });
});

describe('importar → publicar', () => {
  it('importa o content.js e publica um resultado equivalente ao original', async () => {
    await ctx.http.put('/api/config').send({ portfolio_repo_path: repo });
    const importacao = await ctx.http.post('/api/portfolio/importar').expect(200);
    expect(importacao.body).toEqual({ importados: ['Canecas da Dri', 'Rango do Bicho'], ignorados: [] });

    const previa = await ctx.http.post('/api/portfolio/previa').expect(200);
    expect(previa.body.erros).toEqual([]);
    expect(previa.body.diff.adicionados).toEqual(['Canecas da Dri', 'Rango do Bicho']);

    const publicacao = await ctx.http.post('/api/portfolio/publicar').expect(200);
    expect(publicacao.body.gravado).toBe(true);

    const original = await lerProjetosDoPortfolio(repo);
    const gerado = JSON.parse(readFileSync(path.join(repo, 'src/data/projects.json'), 'utf8'));
    expect(gerado.stats.projectsDelivered).toBe(1); // só "Em funcionamento" vira entregue
    gerado.projects.forEach((novo, i) => {
      const antigo = original[i];
      for (const campo of ['title', 'description', 'stack', 'status', 'liveUrl', 'codeUrl']) {
        expect(novo[campo]).toEqual(antigo[campo]);
      }
      expect(novo.images.map((w) => hash(path.join(repo, 'public', w)))).toEqual(
        antigo.images.map((u) => hash(path.join(repo, u))),
      );
      expect((novo.caseStudy ?? []).map((s) => [s.titulo, s.descricao, hash(path.join(repo, 'public', s.imagem))])).toEqual(
        (antigo.caseStudy ?? []).map((s) => [s.titulo, s.descricao, hash(path.join(repo, s.imagem))]),
      );
    });
  }, 30000);

  it('importar de novo não duplica', async () => {
    await ctx.http.put('/api/config').send({ portfolio_repo_path: repo });
    await ctx.http.post('/api/portfolio/importar');
    const segunda = await ctx.http.post('/api/portfolio/importar').expect(200);
    expect(segunda.body).toEqual({ importados: [], ignorados: ['Canecas da Dri', 'Rango do Bicho'] });
  }, 30000);

  it('publicar sem mudanças não reescreve o JSON', async () => {
    await ctx.http.put('/api/config').send({ portfolio_repo_path: repo });
    await ctx.http.post('/api/portfolio/importar');
    await ctx.http.post('/api/portfolio/publicar').expect(200);
    const arquivo = path.join(repo, 'src/data/projects.json');
    const antes = statSync(arquivo).mtimeMs;
    const conteudoAntes = readFileSync(arquivo, 'utf8');

    const res = await ctx.http.post('/api/portfolio/publicar').expect(200);
    expect(res.body).toMatchObject({ gravado: false, diff: { semMudancas: true } });
    expect(readFileSync(arquivo, 'utf8')).toBe(conteudoAntes);
    expect(statSync(arquivo).mtimeMs).toBe(antes);
  }, 30000);

  it('bloqueia publicação com itens inválidos', async () => {
    await ctx.http.put('/api/config').send({ portfolio_repo_path: repo });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    await ctx.http.put(`/api/projetos/${projeto.id}/portfolio`).send({ publicar: true });

    const previa = await ctx.http.post('/api/portfolio/previa').expect(200);
    expect(previa.body.diff).toBeNull();
    expect(previa.body.erros.map((e) => e.campo)).toContain('slug');
    const res = await ctx.http.post('/api/portfolio/publicar').expect(400);
    expect(res.body.erros.length).toBeGreaterThan(0);
  });
});
