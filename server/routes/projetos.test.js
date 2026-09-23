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
});
