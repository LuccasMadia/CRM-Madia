import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-10-18' });
});

// Modelo com receita de 1 placa + 1 tag; 10 de cada no estoque.
async function prepararModelo() {
  const placa = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa' }).expect(201)).body;
  const tag = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Tag' }).expect(201)).body;
  for (const m of [placa, tag]) {
    await ctx.http.post('/api/placas/lotes').send({
      material_id: m.id, quantidade: 10, valor_kit_centavos: 1000, data_compra: '2026-09-01',
    }).expect(201);
  }
  const modelo = (await ctx.http.post('/api/placas/modelos').send({
    nome: 'Placa 10x10', preco_venda_centavos: 8000,
    itens: [{ material_id: placa.id, quantidade: 1 }, { material_id: tag.id, quantidade: 1 }],
  }).expect(201)).body;
  return { placa, tag, modelo };
}

const montar = (modeloId, quantidade, esperado = 201) => ctx.http.post('/api/placas/montagens')
  .send({ modelo_id: modeloId, quantidade, data_montagem: '2026-10-10' }).expect(esperado);

const vender = (modeloId, quantidade, extra = {}) => ctx.http.post('/api/placas/vendas').send({
  modelo_id: modeloId, quantidade, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-10-15', ...extra,
}).expect(201);

async function estoque(materialId) {
  return (await ctx.http.get('/api/placas/materiais')).body.find((m) => m.id === materialId).estoque_atual;
}

async function montadas(modeloId) {
  return (await ctx.http.get('/api/placas/resumo')).body.montadas.find((m) => m.modelo_id === modeloId);
}

describe('/api/placas/montagens', () => {
  it('montar tira os materiais da receita e soma nas montadas', async () => {
    const { placa, tag, modelo } = await prepararModelo();
    const res = await montar(modelo.id, 3);
    expect(res.body.montagem).toMatchObject({ modelo_id: modelo.id, quantidade: 3 });
    expect(res.body.avisos_estoque).toEqual([]);
    expect(await estoque(placa.id)).toBe(7);
    expect(await estoque(tag.id)).toBe(7);
    expect(await montadas(modelo.id)).toMatchObject({ montadas: 3, da_pra_montar: 7 });
  });

  it('lista as montagens com o nome do modelo', async () => {
    const { modelo } = await prepararModelo();
    await montar(modelo.id, 2);
    const res = await ctx.http.get('/api/placas/montagens').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ modelo_nome: 'Placa 10x10', quantidade: 2, data_montagem: '2026-10-10' });
    expect(res.body[0].itens).toHaveLength(2);
  });

  it('avisa quando falta material, mas deixa montar', async () => {
    const { placa, modelo } = await prepararModelo();
    const res = await montar(modelo.id, 12);
    expect(res.body.avisos_estoque.map((a) => a.estoque_atual)).toEqual([-2, -2]);
    expect(await estoque(placa.id)).toBe(-2);
  });

  it('recusa modelo sem receita', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Vazio', preco_venda_centavos: 100 }).expect(201)).body;
    const res = await montar(modelo.id, 1, 400);
    expect(res.body.erros).toEqual([{ campo: 'modelo_id', mensagem: 'Modelo sem receita cadastrada' }]);
  });

  it('a montagem guarda a receita: mudar a receita depois não muda o estoque dela', async () => {
    const { placa, tag, modelo } = await prepararModelo();
    const { body } = await montar(modelo.id, 2);
    await ctx.http.put(`/api/placas/modelos/${modelo.id}`).send({ itens: [{ material_id: placa.id, quantidade: 2 }] }).expect(200);
    expect(await estoque(tag.id)).toBe(8);
    await ctx.http.delete(`/api/placas/montagens/${body.montagem.id}`).expect(204);
    expect(await estoque(tag.id)).toBe(10);
    expect(await estoque(placa.id)).toBe(10);
  });

  it('excluir montagem cujas placas já foram vendidas responde 409 e não muda nada', async () => {
    const { placa, modelo } = await prepararModelo();
    const { body } = await montar(modelo.id, 2);
    await vender(modelo.id, 1);
    const res = await ctx.http.delete(`/api/placas/montagens/${body.montagem.id}`).expect(409);
    expect(res.body.erro).toBe('Placas desta montagem já foram vendidas');
    expect(await estoque(placa.id)).toBe(8);
    expect(await montadas(modelo.id)).toMatchObject({ montadas: 1 });
  });
});

describe('vendas de placa com montadas', () => {
  it('a venda sai primeiro das montadas e o resto dos materiais', async () => {
    const { placa, modelo } = await prepararModelo();
    await montar(modelo.id, 2);
    const res = await vender(modelo.id, 3);
    expect(res.body.venda.quantidade_montada).toBe(2);
    expect(await estoque(placa.id)).toBe(10 - 2 - 1);
    expect(await montadas(modelo.id)).toMatchObject({ montadas: 0 });
  });

  it('excluir a venda devolve as montadas e os materiais', async () => {
    const { placa, modelo } = await prepararModelo();
    await montar(modelo.id, 2);
    const { body } = await vender(modelo.id, 3);
    await ctx.http.delete(`/api/placas/vendas/${body.venda.id}`).expect(204);
    expect(await estoque(placa.id)).toBe(8);
    expect(await montadas(modelo.id)).toMatchObject({ montadas: 2 });
  });

  it('editar a quantidade recalcula o que sai de montadas', async () => {
    const { placa, modelo } = await prepararModelo();
    await montar(modelo.id, 2);
    const { body } = await vender(modelo.id, 1);
    expect(body.venda.quantidade_montada).toBe(1);
    const res = await ctx.http.put(`/api/placas/vendas/${body.venda.id}`).send({ quantidade: 4 }).expect(200);
    expect(res.body.quantidade_montada).toBe(2);
    expect(await estoque(placa.id)).toBe(10 - 2 - 2);
    const menor = await ctx.http.put(`/api/placas/vendas/${body.venda.id}`).send({ quantidade: 1 }).expect(200);
    expect(menor.body.quantidade_montada).toBe(1);
    expect(await montadas(modelo.id)).toMatchObject({ montadas: 1 });
  });

  it('sem montagens o estoque continua igual ao de antes', async () => {
    const { placa, modelo } = await prepararModelo();
    const { body } = await vender(modelo.id, 3);
    expect(body.venda.quantidade_montada).toBe(0);
    expect(await estoque(placa.id)).toBe(7);
  });
});

describe('recebimento de vendas de placa', () => {
  it('nasce a receber; "recebido: true" grava a data da venda', async () => {
    const { modelo } = await prepararModelo();
    expect((await vender(modelo.id, 1)).body.venda.recebido_em).toBeNull();
    expect((await vender(modelo.id, 1, { recebido: true })).body.venda.recebido_em).toBe('2026-10-15');
  });

  it('marca e desfaz o recebimento', async () => {
    const { modelo } = await prepararModelo();
    const { body } = await vender(modelo.id, 2);
    const recebida = await ctx.http.post(`/api/placas/vendas/${body.venda.id}/recebimento`).expect(200);
    expect(recebida.body).toMatchObject({ recebido_em: '2026-10-18', estado: 'paga', valor_total_centavos: 16000 });
    const desfeita = await ctx.http.delete(`/api/placas/vendas/${body.venda.id}/recebimento`).expect(200);
    expect(desfeita.body).toMatchObject({ recebido_em: null, estado: 'pendente' });
  });

  it('responde 404 ao receber venda inexistente', async () => {
    await ctx.http.post('/api/placas/vendas/999/recebimento').expect(404);
  });

  it('a lista de vendas traz estado, valor total e se veio de projeto', async () => {
    const { modelo } = await prepararModelo();
    await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Antigo', data_venda: '2026-10-01',
    }).expect(201);
    const [venda] = (await ctx.http.get('/api/placas/vendas').expect(200)).body;
    expect(venda).toMatchObject({ estado: 'atrasada', valor_total_centavos: 8000, via_projeto: false });
  });
});

describe('/api/placas/resumo — painel', () => {
  it('traz a receber (mais antiga primeiro), montadas e números do mês', async () => {
    const { modelo } = await prepararModelo();
    await montar(modelo.id, 3);
    await vender(modelo.id, 1, { data_venda: '2026-10-15' });
    await vender(modelo.id, 2, { data_venda: '2026-10-02' });
    await vender(modelo.id, 1, { data_venda: '2026-10-16', recebido: true });
    await vender(modelo.id, 5, { data_venda: '2026-09-20', recebido: true });
    const { body } = await ctx.http.get('/api/placas/resumo').expect(200);
    expect(body.a_receber.total_centavos).toBe(24000);
    expect(body.a_receber.vendas.map((v) => v.data_venda)).toEqual(['2026-10-02', '2026-10-15']);
    expect(body.a_receber.vendas[0]).toMatchObject({ estado: 'atrasada', comprador_nome: 'Fulano', modelo_nome: 'Placa 10x10' });
    expect(body.montadas).toEqual([{ modelo_id: modelo.id, modelo_nome: 'Placa 10x10', montadas: 0, da_pra_montar: 1 }]);
    expect(body.mes.vendidas).toBe(4);
    expect(body.mes.lucro_centavos).toBe(4 * (8000 - 200));
  });
});

describe('vendas de placas geradas por projeto', () => {
  it('nascem recebidas e saem das montadas primeiro', async () => {
    const { modelo } = await prepararModelo();
    await montar(modelo.id, 1);
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' }).expect(201)).body;
    const projeto = (await ctx.http.post('/api/projetos').send({
      servico: 'placas_nfc', titulo: 'Placas NFC', cliente_id: cliente.id, vencimento: '2026-10-20',
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 8000 }],
    }).expect(201)).body;
    await ctx.http.put(`/api/projetos/${projeto.id}`).send({ etapa: 'entregue' }).expect(200);
    const [venda] = (await ctx.http.get('/api/placas/vendas')).body;
    expect(venda).toMatchObject({ recebido_em: '2026-10-18', quantidade_montada: 1, via_projeto: true, estado: 'paga' });
    expect((await ctx.http.get('/api/placas/resumo')).body.a_receber.vendas).toEqual([]);
  });
});

describe('/api/clientes/:id/placas', () => {
  it('lista todas as vendas do cliente com estado', async () => {
    const { modelo } = await prepararModelo();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' }).expect(201)).body;
    await vender(modelo.id, 2, { cliente_id: cliente.id, comprador_nome: undefined });
    const { body } = await ctx.http.get(`/api/clientes/${cliente.id}/placas`).expect(200);
    expect(body.vendas).toHaveLength(1);
    expect(body.vendas[0]).toMatchObject({ modelo_nome: 'Placa 10x10', estado: 'pendente', valor_total_centavos: 16000 });
  });
});
