import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

async function criarMaterial(overrides = {}) {
  return (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa 10x10 PVC', ...overrides }).expect(201)).body;
}

describe('/api/placas/materiais', () => {
  it('cria e lista com estoque zerado e sem custo', async () => {
    await criarMaterial();
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: null });
  });

  it('exige nome', async () => {
    const res = await ctx.http.post('/api/placas/materiais').send({}).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
  });

  it('atualiza o nome', async () => {
    const material = await criarMaterial();
    const res = await ctx.http.put(`/api/placas/materiais/${material.id}`).send({ nome: 'Placa PVC 10x10' }).expect(200);
    expect(res.body.nome).toBe('Placa PVC 10x10');
  });

  it('responde 404 ao atualizar id inexistente', async () => {
    await ctx.http.put('/api/placas/materiais/999').send({ nome: 'X' }).expect(404);
  });

  it('exclui material sem vínculo', async () => {
    const material = await criarMaterial();
    await ctx.http.delete(`/api/placas/materiais/${material.id}`).expect(204);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body).toEqual([]);
  });

  it('responde 404 ao excluir id inexistente', async () => {
    await ctx.http.delete('/api/placas/materiais/999').expect(404);
  });
});

async function criarLote(materialId, overrides = {}) {
  return (await ctx.http.post('/api/placas/lotes').send({
    material_id: materialId, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0,
    data_compra: '2026-09-01', ...overrides,
  }).expect(201)).body;
}

describe('/api/placas/lotes', () => {
  it('cria e lista, calculando custo e estoque do material', async () => {
    const material = await criarMaterial();
    await criarLote(material.id);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body[0]).toMatchObject({ estoque_atual: 10, custo_unitario_atual: 249 });
  });

  it('aceita frete zero quando o campo não é informado', async () => {
    const material = await criarMaterial();
    const res = await ctx.http.post('/api/placas/lotes').send({
      material_id: material.id, quantidade: 10, valor_kit_centavos: 2490, data_compra: '2026-09-01',
    }).expect(201);
    expect(res.body.valor_frete_centavos).toBe(0);
  });

  it('recusa material_id inexistente', async () => {
    const res = await ctx.http.post('/api/placas/lotes').send({
      material_id: 999, quantidade: 10, valor_kit_centavos: 2490, data_compra: '2026-09-01',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'material_id', mensagem: 'Material não encontrado' }]);
  });

  it('filtra por material_id', async () => {
    const material = await criarMaterial();
    const outro = await criarMaterial({ nome: 'Adesivo 10x10' });
    const lote = await criarLote(material.id);
    await criarLote(outro.id);
    const res = await ctx.http.get(`/api/placas/lotes?material_id=${material.id}`).expect(200);
    expect(res.body.map((l) => l.id)).toEqual([lote.id]);
  });

  it('atualiza valores', async () => {
    const material = await criarMaterial();
    const lote = await criarLote(material.id);
    const res = await ctx.http.put(`/api/placas/lotes/${lote.id}`).send({ valor_frete_centavos: 500 }).expect(200);
    expect(res.body.valor_frete_centavos).toBe(500);
  });

  it('exclui o lote', async () => {
    const material = await criarMaterial();
    const lote = await criarLote(material.id);
    await ctx.http.delete(`/api/placas/lotes/${lote.id}`).expect(204);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body[0].estoque_atual).toBe(0);
  });

  it('responde 404 ao excluir id inexistente', async () => {
    await ctx.http.delete('/api/placas/lotes/999').expect(404);
  });
});

describe('/api/placas/materiais exclusão bloqueada por lote', () => {
  it('não exclui material com lote vinculado', async () => {
    const material = await criarMaterial();
    await criarLote(material.id);
    const res = await ctx.http.delete(`/api/placas/materiais/${material.id}`).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
  });
});

async function criarModelo(itens, overrides = {}) {
  return (await ctx.http.post('/api/placas/modelos').send({
    nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, itens, ...overrides,
  }).expect(201)).body;
}

describe('/api/placas/modelos', () => {
  it('cria com receita e calcula custo/lucro previstos como na planilha', async () => {
    const placa = await criarMaterial({ nome: 'Placa 10x10 PVC' });
    const adesivo = await criarMaterial({ nome: 'Adesivo 10x10' });
    const tag = await criarMaterial({ nome: 'Tag NFC' });
    await criarLote(placa.id, { quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0 });
    await criarLote(adesivo.id, { quantidade: 81, valor_kit_centavos: 3000, valor_frete_centavos: 0 });
    await criarLote(tag.id, { quantidade: 50, valor_kit_centavos: 4497, valor_frete_centavos: 0 });

    const modelo = await criarModelo([
      { material_id: placa.id, quantidade: 1 },
      { material_id: adesivo.id, quantidade: 1 },
      { material_id: tag.id, quantidade: 1 },
    ]);
    expect(modelo.custo_previsto_centavos).toBe(376);
    expect(modelo.lucro_previsto_centavos).toBe(7624);
    expect(modelo.itens).toHaveLength(3);
  });

  it('custo previsto é null quando falta lote de algum material da receita', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    expect(modelo.custo_previsto_centavos).toBeNull();
    expect(modelo.lucro_previsto_centavos).toBeNull();
  });

  it('recusa item com material inexistente', async () => {
    const res = await ctx.http.post('/api/placas/modelos').send({
      nome: 'X', preco_venda_centavos: 100, itens: [{ material_id: 999, quantidade: 1 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'itens[0].material_id', mensagem: 'Material inválido' }]);
  });

  it('recusa item com quantidade menor que 1', async () => {
    const placa = await criarMaterial();
    const res = await ctx.http.post('/api/placas/modelos').send({
      nome: 'X', preco_venda_centavos: 100, itens: [{ material_id: placa.id, quantidade: 0 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'itens[0].quantidade', mensagem: 'Deve ser no mínimo 1' }]);
  });

  it('atualiza substituindo a receita inteira', async () => {
    const placa = await criarMaterial({ nome: 'Placa' });
    const outro = await criarMaterial({ nome: 'Outro material' });
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const res = await ctx.http.put(`/api/placas/modelos/${modelo.id}`).send({
      itens: [{ material_id: outro.id, quantidade: 2 }],
    }).expect(200);
    expect(res.body.itens).toEqual([expect.objectContaining({ material_id: outro.id, quantidade: 2 })]);
  });

  it('não exclui material usado na receita de um modelo', async () => {
    const placa = await criarMaterial();
    await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const res = await ctx.http.delete(`/api/placas/materiais/${placa.id}`).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'id', mensagem: 'Material está usado na receita de um modelo' }]);
  });

  it('exclui modelo sem vendas', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    await ctx.http.delete(`/api/placas/modelos/${modelo.id}`).expect(204);
  });

  it('responde 404 ao excluir modelo inexistente', async () => {
    await ctx.http.delete('/api/placas/modelos/999').expect(404);
  });
});

async function montarModeloCompleto() {
  const placa = await criarMaterial({ nome: 'Placa 10x10 PVC' });
  await criarLote(placa.id, { quantidade: 2, valor_kit_centavos: 2490, valor_frete_centavos: 0 });
  return criarModelo([{ material_id: placa.id, quantidade: 1 }], { preco_venda_centavos: 8000 });
}

describe('/api/placas/vendas', () => {
  it('cria venda calculando o custo snapshot e o lucro real', async () => {
    const modelo = await montarModeloCompleto();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, cliente_id: cliente.id, data_venda: '2026-09-23',
    }).expect(201);
    expect(res.body.venda).toMatchObject({ custo_unitario_centavos: 1245, quantidade: 1, lucro_real_centavos: 8000 - 1245 });
    expect(res.body.avisos_estoque).toEqual([]);
  });

  it('aceita comprador avulso sem cliente cadastrado', async () => {
    const modelo = await montarModeloCompleto();
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano do Instagram', data_venda: '2026-09-23',
    }).expect(201);
    expect(res.body.venda.comprador_nome).toBe('Fulano do Instagram');
    expect(res.body.venda.cliente_id).toBeNull();
  });

  it('recusa quando não informa cliente nem nome avulso', async () => {
    const modelo = await montarModeloCompleto();
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, data_venda: '2026-09-23',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'comprador_nome', mensagem: 'Informe um cliente cadastrado ou um nome avulso (não os dois)' }]);
  });

  it('recusa quando informa cliente e nome avulso ao mesmo tempo', async () => {
    const modelo = await montarModeloCompleto();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, cliente_id: cliente.id, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'comprador_nome', mensagem: 'Informe um cliente cadastrado ou um nome avulso (não os dois)' }]);
  });

  it('avisa sem bloquear quando o estoque fica negativo', async () => {
    const modelo = await montarModeloCompleto();
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, quantidade: 3, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201);
    expect(res.body.avisos_estoque).toHaveLength(1);
    expect(res.body.avisos_estoque[0]).toMatchObject({ nome: 'Placa 10x10 PVC', estoque_atual: -1 });
  });

  it('recusa quando o modelo não tem lote comprado para a receita', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'modelo_id', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
  });

  it('lista vendas com nomes do modelo e do cliente', async () => {
    const modelo = await montarModeloCompleto();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, cliente_id: cliente.id, data_venda: '2026-09-23',
    }).expect(201);
    const res = await ctx.http.get('/api/placas/vendas').expect(200);
    expect(res.body[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', cliente_nome: 'Ana' });
  });

  it('edita preço vendido', async () => {
    const modelo = await montarModeloCompleto();
    const criada = (await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201)).body.venda;
    const res = await ctx.http.put(`/api/placas/vendas/${criada.id}`).send({ preco_vendido_centavos: 7500 }).expect(200);
    expect(res.body.preco_vendido_centavos).toBe(7500);
  });

  it('exclui venda', async () => {
    const modelo = await montarModeloCompleto();
    const criada = (await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201)).body.venda;
    await ctx.http.delete(`/api/placas/vendas/${criada.id}`).expect(204);
  });

  it('responde 404 ao editar ou excluir venda inexistente', async () => {
    await ctx.http.put('/api/placas/vendas/999').send({ preco_vendido_centavos: 100 }).expect(404);
    await ctx.http.delete('/api/placas/vendas/999').expect(404);
  });
});

describe('/api/placas/resumo', () => {
  it('agrega lucro previsto, lucro real e estoque', async () => {
    const modelo = await montarModeloCompleto();
    await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201);
    const res = await ctx.http.get('/api/placas/resumo').expect(200);
    expect(res.body.lucro_previsto_por_modelo[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', lucro_previsto_centavos: 8000 - 1245 });
    expect(res.body.lucro_real_por_modelo[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', quantidade: 1, lucro_total_centavos: 8000 - 1245 });
    expect(res.body.materiais[0]).toMatchObject({ nome: 'Placa 10x10 PVC', estoque_atual: 1 });
  });
});
