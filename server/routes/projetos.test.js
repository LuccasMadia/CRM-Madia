import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let cliente;
beforeEach(async () => {
  ctx = criarContexto({ hoje: '2026-09-23' });
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
});

describe('/api/projetos', () => {
  it('cria com cliente existente, etapa padrão contato e valor 0', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201);
    expect(res.body).toMatchObject({ titulo: 'Site', etapa: 'contato', valor_total_centavos: 0, cliente_nome: 'Ana' });
  });

  it('cria junto com um cliente novo', async () => {
    const res = await ctx.http
      .post('/api/projetos')
      .send({ titulo: 'Loja', novo_cliente: { nome: 'Bruno' }, valor_total_centavos: 250000 })
      .expect(201);
    expect(res.body).toMatchObject({ titulo: 'Loja', cliente_nome: 'Bruno', valor_total_centavos: 250000 });
  });

  it('prefixa erros do cliente novo com novo_cliente.', async () => {
    const res = await ctx.http.post('/api/projetos').send({ titulo: 'Loja', novo_cliente: { nome: '' } }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'novo_cliente.nome', mensagem: 'Obrigatório' }]);
    expect((await ctx.http.get('/api/clientes')).body).toHaveLength(1);
  });

  it('valida cliente inexistente, etapa e valor', async () => {
    const res = await ctx.http
      .post('/api/projetos')
      .send({ cliente_id: 999, titulo: 'X', etapa: 'nada', valor_total_centavos: -5 })
      .expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['etapa', 'valor_total_centavos']);
    const res2 = await ctx.http.post('/api/projetos').send({ cliente_id: 999, titulo: 'X' }).expect(400);
    expect(res2.body.erros).toEqual([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
  });

  it('ao mover para entregue preenche data_entrega com hoje', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ etapa: 'entregue' }).expect(200);
    expect(res.body).toMatchObject({ etapa: 'entregue', data_entrega: '2026-09-23' });
  });

  it('lista filtrando por etapa', async () => {
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', etapa: 'proposta' });
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'B' });
    const res = await ctx.http.get('/api/projetos?etapa=proposta').expect(200);
    expect(res.body.map((p) => p.titulo)).toEqual(['A']);
  });

  it('exclui', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    await ctx.http.delete(`/api/projetos/${projeto.id}`).expect(204);
    await ctx.http.get(`/api/projetos/${projeto.id}`).expect(404);
  });

  it('exige valor e dia quando ativa a mensalidade', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ mensalidade_ativa: true }).expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['mensalidade_dia_vencimento', 'mensalidade_valor_centavos']);
  });

  it('ativa mensalidade com valor e dia válidos', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    const res = await ctx.http
      .put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 })
      .expect(200);
    expect(res.body).toMatchObject({ mensalidade_ativa: 1, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 });
  });

  it('desativar mensalidade não exige valor/dia', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    await ctx.http
      .put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 })
      .expect(200);
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ mensalidade_ativa: false }).expect(200);
    expect(res.body.mensalidade_ativa).toBe(0);
  });

  it('aceita e retorna postou_instagram', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    expect(projeto.postou_instagram).toBe(0);
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ postou_instagram: true }).expect(200);
    expect(res.body.postou_instagram).toBe(1);
  });

  it('lista filtrando por postou_instagram', async () => {
    const a = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'B' });
    await ctx.http.put(`/api/projetos/${a.id}`).send({ postou_instagram: true }).expect(200);
    const res = await ctx.http.get('/api/projetos?postou_instagram=1').expect(200);
    expect(res.body.map((p) => p.titulo)).toEqual(['A']);
    const res2 = await ctx.http.get('/api/projetos?postou_instagram=0').expect(200);
    expect(res2.body.map((p) => p.titulo)).toEqual(['B']);
  });
});
