import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

describe('/api/categorias', () => {
  it('lista as iniciais em ordem e cria uma nova no fim', async () => {
    const inicial = (await ctx.http.get('/api/categorias').expect(200)).body;
    expect(inicial.map((c) => c.nome)).toEqual(['Site', 'Landing page', 'Sistema', 'SaaS']);
    const nova = (await ctx.http.post('/api/categorias').send({ nome: '  Cardápio digital ' }).expect(201)).body;
    expect(nova).toMatchObject({ nome: 'Cardápio digital', ordem: 5 });
    expect((await ctx.http.get('/api/categorias')).body.at(-1).nome).toBe('Cardápio digital');
  });

  it('recusa nome vazio e repetido (sem diferenciar maiúsculas)', async () => {
    expect((await ctx.http.post('/api/categorias').send({ nome: ' ' }).expect(400)).body.erros).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
    expect((await ctx.http.post('/api/categorias').send({ nome: 'site' }).expect(400)).body.erros).toEqual([{ campo: 'nome', mensagem: 'Já existe' }]);
  });

  it('renomeia e muda a ordem; renomear para o próprio nome é permitido', async () => {
    const res = await ctx.http.put('/api/categorias/2').send({ nome: 'Landing Page', ordem: 9 }).expect(200);
    expect(res.body).toMatchObject({ id: 2, nome: 'Landing Page', ordem: 9 });
    await ctx.http.put('/api/categorias/3').send({ nome: 'saas' }).expect(400);
  });

  it('exclui a que não está em uso; em uso responde 409', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', categorias: [3] }).expect(201);
    expect((await ctx.http.delete('/api/categorias/3').expect(409)).body.erro).toBe('Em uso por 1 projeto(s)');
    await ctx.http.delete('/api/categorias/2').expect(204);
    await ctx.http.delete('/api/categorias/2').expect(404);
  });
});

describe('/api/nichos', () => {
  it('cria, lista em ordem alfabética, recusa repetido e exclui', async () => {
    await ctx.http.post('/api/nichos').send({ nome: 'Sorveteria' }).expect(201);
    const barbearia = (await ctx.http.post('/api/nichos').send({ nome: 'Barbearia' }).expect(201)).body;
    expect((await ctx.http.get('/api/nichos')).body.map((n) => n.nome)).toEqual(['Barbearia', 'Sorveteria']);
    expect((await ctx.http.post('/api/nichos').send({ nome: 'BARBEARIA' }).expect(400)).body.erros[0].mensagem).toBe('Já existe');
    await ctx.http.delete(`/api/nichos/${barbearia.id}`).expect(204);
  });

  it('nicho em uso não pode ser excluído', async () => {
    const nicho = (await ctx.http.post('/api/nichos').send({ nome: 'Padaria' })).body;
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', nicho_id: nicho.id }).expect(201);
    expect((await ctx.http.delete(`/api/nichos/${nicho.id}`).expect(409)).body.erro).toBe('Em uso por 1 projeto(s)');
  });
});
