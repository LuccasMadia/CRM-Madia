import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

async function criarCliente(dados = { nome: 'Ana Souza', empresa: 'Doces da Ana' }) {
  return (await ctx.http.post('/api/clientes').send(dados).expect(201)).body;
}

describe('/api/clientes', () => {
  it('cria e busca clientes por nome, empresa ou email', async () => {
    await criarCliente();
    await criarCliente({ nome: 'Bruno', email: 'bruno@x.com' });
    expect((await ctx.http.get('/api/clientes').expect(200)).body).toHaveLength(2);
    const busca = await ctx.http.get('/api/clientes?busca=doces').expect(200);
    expect(busca.body.map((c) => c.nome)).toEqual(['Ana Souza']);
  });

  it('exige nome', async () => {
    const res = await ctx.http.post('/api/clientes').send({ empresa: 'X' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
  });

  it('detalhe traz projetos e total faturado (só parcelas pagas)', async () => {
    const cliente = await criarCliente();
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201)).body;
    const agora = new Date().toISOString();
    const inserir = ctx.db.prepare(
      'INSERT INTO parcelas (projeto_id, valor_centavos, vencimento, pago_em, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)',
    );
    inserir.run(projeto.id, 1500, '2026-09-01', '2026-09-02', agora, agora);
    inserir.run(projeto.id, 9999, '2026-10-01', null, agora, agora);

    const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
    expect(res.body.total_faturado_centavos).toBe(1500);
    expect(res.body.projetos.map((p) => p.titulo)).toEqual(['Site']);
  });

  it('detalhe não traz mais os qrcodes', async () => {
    const cliente = await criarCliente();
    const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
    expect(res.body).not.toHaveProperty('qrcodes');
  });

  it('atualiza parcialmente', async () => {
    const cliente = await criarCliente();
    const res = await ctx.http.put(`/api/clientes/${cliente.id}`).send({ telefone: '11 99999-0000' }).expect(200);
    expect(res.body).toMatchObject({ nome: 'Ana Souza', telefone: '11 99999-0000' });
  });

  it('não exclui cliente com projetos (409) e exclui cliente sem projetos', async () => {
    const comProjeto = await criarCliente();
    await ctx.http.post('/api/projetos').send({ cliente_id: comProjeto.id, titulo: 'Site' }).expect(201);
    const res = await ctx.http.delete(`/api/clientes/${comProjeto.id}`).expect(409);
    expect(res.body.erro).toMatch(/projetos/);
    await ctx.http.get(`/api/clientes/${comProjeto.id}`).expect(200);

    const semProjeto = await criarCliente({ nome: 'Carla' });
    await ctx.http.delete(`/api/clientes/${semProjeto.id}`).expect(204);
    await ctx.http.get(`/api/clientes/${semProjeto.id}`).expect(404);
  });

  it('exclui cliente com QR codes antigos, apagando os QR dele junto', async () => {
    const comQr = await criarCliente({ nome: 'Com QR' });
    ctx.db.prepare(`INSERT INTO qrcodes (cliente_id, nome, categoria, criado_em, atualizado_em)
      VALUES (?, 'QR', 'cardapio', 'x', 'x')`).run(comQr.id);
    await ctx.http.delete(`/api/clientes/${comQr.id}`).expect(204);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM qrcodes').get().n).toBe(0);
  });

  it('responde 404 para id inexistente ou inválido', async () => {
    await ctx.http.get('/api/clientes/999').expect(404);
    await ctx.http.get('/api/clientes/abc').expect(404);
  });
});

describe('GET /api/clientes/:id/placas', () => {
  it('lista vendas avulsas do cliente e soma o que ele já comprou', async () => {
    const ctx = criarContexto();
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa 10x10', preco_venda_centavos: 8000 })).body;
    const inserirVenda = (quantidade, data) => Number(ctx.db.prepare(`INSERT INTO placas_vendas (modelo_id, quantidade, preco_vendido_centavos, custo_unitario_centavos, cliente_id, data_venda, criado_em, atualizado_em)
      VALUES (?, ?, 8000, 100, ?, ?, 'x', 'x')`).run(modelo.id, quantidade, ana.id, data).lastInsertRowid);
    inserirVenda(2, '2026-08-01');
    const vendaDoPerfil = inserirVenda(3, '2026-09-01');
    const { lastInsertRowid: projetoId } = ctx.db.prepare(`INSERT INTO projetos (cliente_id, titulo, etapa, servico, criado_em, atualizado_em)
      VALUES (?, 'Placas NFC', 'entregue', 'placas_nfc', 'x', 'x')`).run(ana.id);
    ctx.db.prepare(`INSERT INTO projetos_servicos (projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, valor_total_centavos, venda_id, criado_em, atualizado_em)
      VALUES (?, 'placas_nfc', ?, 3, 8000, 24000, ?, 'x', 'x')`).run(projetoId, modelo.id, vendaDoPerfil);

    const res = await ctx.http.get(`/api/clientes/${ana.id}/placas`).expect(200);
    expect(res.body.ja_comprou).toBe(5);
    expect(res.body.vendas_avulsas).toEqual([
      expect.objectContaining({ quantidade: 2, data_venda: '2026-08-01', modelo_nome: 'Placa 10x10' }),
    ]);
    await ctx.http.get('/api/clientes/999/placas').expect(404);
  });
});
