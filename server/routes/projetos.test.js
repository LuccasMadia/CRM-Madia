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

  it('aceita e retorna ficticio', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    expect(projeto.ficticio).toBe(0);
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ ficticio: true }).expect(200);
    expect(res.body.ficticio).toBe(1);
  });

  it('lista filtrando por ficticio', async () => {
    const a = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'B' });
    await ctx.http.put(`/api/projetos/${a.id}`).send({ ficticio: true }).expect(200);
    const res = await ctx.http.get('/api/projetos?ficticio=1').expect(200);
    expect(res.body.map((p) => p.titulo)).toEqual(['A']);
    const res2 = await ctx.http.get('/api/projetos?ficticio=0').expect(200);
    expect(res2.body.map((p) => p.titulo)).toEqual(['B']);
  });
});

describe('/api/projetos com serviços', () => {
  async function criarModeloDePlaca(precoVendaCentavos = 8000) {
    return (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa 10x10 PVC', preco_venda_centavos: precoVendaCentavos }).expect(201)).body;
  }

  it('cria com 1 serviço de placas e calcula o valor a partir do preço do modelo', async () => {
    const modelo = await criarModeloDePlaca(8000);
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Placa pra loja',
      servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(16000);
    expect(res.body.desconto_centavos).toBe(0);
    expect(res.body.servicos).toEqual([
      expect.objectContaining({ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_unitario_centavos: 8000, venda_id: null, modelo_nome: 'Placa 10x10 PVC' }),
    ]);
  });

  it('sem servicos no corpo, mantém o comportamento atual de valor manual', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Simples', valor_total_centavos: 12000 }).expect(201);
    expect(res.body.valor_total_centavos).toBe(12000);
    expect(res.body.servicos).toEqual([]);
  });

  it('valida tipo de serviço desconhecido', async () => {
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'X', servicos: [{ tipo: 'inexistente' }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].tipo', mensagem: 'Tipo de serviço inválido' }]);
  });

  it('placas_nfc exige modelo_id válido', async () => {
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'X', servicos: [{ tipo: 'placas_nfc', modelo_id: 999, quantidade: 1 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].modelo_id', mensagem: 'Modelo de placa não encontrado' }]);
  });

  it('funciona também no fluxo de criar com novo_cliente', async () => {
    const res = await ctx.http.post('/api/projetos').send({
      titulo: 'Loja nova', novo_cliente: { nome: 'Diego' }, valor_total_centavos: 20000,
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(20000);
    expect(res.body.cliente_nome).toBe('Diego');
  });

  async function prepararReceita(modeloId) {
    const material = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa' })).body;
    await ctx.http.post('/api/placas/lotes').send({ material_id: material.id, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' });
    await ctx.http.put(`/api/placas/modelos/${modeloId}`).send({ itens: [{ material_id: material.id, quantidade: 1 }] });
  }

  it('mudar etapa para entregue com serviço de placas cria a venda e marca venda_id', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    })).body;

    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    expect(res.body.servicos[0].venda_id).not.toBeNull();

    const vendas = (await ctx.http.get('/api/placas/vendas')).body;
    expect(vendas).toHaveLength(1);
    expect(vendas[0]).toMatchObject({ modelo_id: modelo.id, quantidade: 2, preco_vendido_centavos: 8000, cliente_id: cliente.id, custo_unitario_centavos: 249 });
  });

  it('mudar etapa para entregue de novo não duplica a venda (idempotência)', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'andamento' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);

    const vendas = (await ctx.http.get('/api/placas/vendas')).body;
    expect(vendas).toHaveLength(1);
  });

  it('modelo sem receita bloqueia a transição para entregue com erro claro', async () => {
    const modelo = await criarModeloDePlaca(8000);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    })).body;

    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Modelo de placa sem receita cadastrada, não é possível registrar a venda' }]);
    expect((await ctx.http.get(`/api/projetos/${criado.id}`)).body.etapa).toBe('andamento');
  });

  async function criarModeloComPacks() {
    return (await ctx.http.post('/api/placas/modelos').send({
      nome: 'Placa 10x15', preco_venda_centavos: 10000,
      packs: [{ quantidade: 2, preco_total_centavos: 18000 }, { quantidade: 3, preco_total_centavos: 25000 }],
    }).expect(201)).body;
  }

  function registrarVendaAnterior(modeloId, quantidade) {
    const t = '2026-09-01T00:00:00.000Z';
    ctx.db.prepare(`INSERT INTO placas_vendas (modelo_id, quantidade, preco_vendido_centavos, custo_unitario_centavos, cliente_id, data_venda, criado_em, atualizado_em)
      VALUES (?, ?, 10000, 700, ?, '2026-09-01', ?, ?)`).run(modeloId, quantidade, cliente.id, t, t);
  }

  it('placas sem valor informado usam o preço de pack para cliente sem histórico', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(25000);
    expect(res.body.servicos[0]).toMatchObject({ valor_total_centavos: 25000, valor_unitario_centavos: 8333 });
  });

  it('placas sem valor informado usam o preço de recompra para cliente com histórico', async () => {
    const modelo = await criarModeloComPacks();
    registrarVendaAnterior(modelo.id, 1);
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(15000);
  });

  it('cliente novo (novo_cliente) usa o preço de pack', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      titulo: 'P', novo_cliente: { nome: 'Caio' }, servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(18000);
  });

  it('valor_total_centavos explícito é respeitado', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3, valor_total_centavos: 20000 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(20000);
    expect(res.body.servicos[0]).toMatchObject({ valor_total_centavos: 20000, valor_unitario_centavos: 6667 });
  });

  it('valor_total_centavos inválido responde 400', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: -1 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].valor_total_centavos', mensagem: 'Valor inválido' }]);
  });

  it('reenviar a linha com valor_total_centavos não muda o total (sem arredondar para 20001)', async () => {
    const modelo = await criarModeloComPacks();
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3, valor_total_centavos: 20000 }],
    })).body;
    const linha = criado.servicos[0];
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({
      servicos: [{ tipo: 'placas_nfc', modelo_id: linha.modelo_id, quantidade: linha.quantidade, valor_unitario_centavos: linha.valor_unitario_centavos, valor_total_centavos: linha.valor_total_centavos }],
    }).expect(200);
    expect(res.body.valor_total_centavos).toBe(20000);
  });

  it('entregar 3 placas por R$ 200 cria a venda com preço unitário arredondado', async () => {
    const modelo = await criarModeloComPacks();
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3, valor_total_centavos: 20000 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    const vendas = (await ctx.http.get('/api/placas/vendas')).body;
    expect(vendas[0]).toMatchObject({ quantidade: 3, preco_vendido_centavos: 6667 });
  });
  it('venda de placas entregue não aceita troca de modelo, quantidade ou valor', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_total_centavos: 16000 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Venda já entregue: modelo, quantidade e valor não podem mudar' }]);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ notas: 'Instalada no balcão' }).expect(200);
  });

  it('reenviar a mesma linha depois de entregue não duplica nem gera nova venda', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', vencimento: '2026-10-05', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 8000 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 8000 }],
    }).expect(200);
    expect(res.body.servicos).toHaveLength(1);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'andamento' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    expect((await ctx.http.get('/api/placas/vendas')).body).toHaveLength(1);
  });

});

describe('/api/projetos — tipo de serviço', () => {
  it('projeto sem servico fica site_sistema', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201);
    expect(res.body).toMatchObject({ servico: 'site_sistema', link_perfil: null });
  });

  it('a migration cria a tabela de ligações projeto/QR', () => {
    const colunas = ctx.db.prepare('PRAGMA table_info(projetos_qrcodes)').all().map((c) => c.name);
    expect(colunas).toEqual(['projeto_id', 'qrcode_id']);
  });

  it('filtra por ?servico= e rejeita valor desconhecido', async () => {
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201);
    ctx.db.prepare(`INSERT INTO projetos (cliente_id, titulo, etapa, servico, criado_em, atualizado_em)
      VALUES (?, 'GMN', 'andamento', 'google_meu_negocio', 'x', 'x')`).run(cliente.id);
    const sites = (await ctx.http.get('/api/projetos?servico=site_sistema').expect(200)).body;
    expect(sites.map((p) => p.titulo)).toEqual(['Site']);
    const gmn = (await ctx.http.get('/api/projetos?servico=google_meu_negocio').expect(200)).body;
    expect(gmn.map((p) => p.titulo)).toEqual(['GMN']);
    expect((await ctx.http.get('/api/projetos').expect(200)).body).toHaveLength(2);
    await ctx.http.get('/api/projetos?servico=nada').expect(400);
  });

  it('GMN nasce em andamento; etapa diferente na criação dá 400', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', link_perfil: 'https://g.page/ana' }).expect(201);
    expect(res.body).toMatchObject({ servico: 'google_meu_negocio', etapa: 'andamento', link_perfil: 'https://g.page/ana' });
    const erro = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', etapa: 'proposta' }).expect(400);
    expect(erro.body.erros).toEqual([{ campo: 'etapa', mensagem: 'Etapa inválida para este serviço' }]);
  });

  it('GMN vai para entregue mas não para proposta', async () => {
    const gmn = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio' })).body;
    await ctx.http.put(`/api/projetos/${gmn.id}`).send({ etapa: 'proposta' }).expect(400);
    const res = await ctx.http.put(`/api/projetos/${gmn.id}`).send({ etapa: 'entregue' }).expect(200);
    expect(res.body).toMatchObject({ etapa: 'entregue', data_entrega: '2026-09-23' });
  });

  it('servico não muda depois de criado', async () => {
    const site = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    const res = await ctx.http.put(`/api/projetos/${site.id}`).send({ servico: 'google_meu_negocio' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servico', mensagem: 'Não é possível mudar o tipo de serviço' }]);
    await ctx.http.put(`/api/projetos/${site.id}`).send({ servico: 'site_sistema', titulo: 'Site 2' }).expect(200);
  });

  it('GMN não pode ser fictício', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', ficticio: true }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'ficticio', mensagem: 'Só sites e sistemas podem ser fictícios' }]);
  });

  it('site não aceita linha de placas e placas exige a linha', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa', preco_venda_centavos: 8000 })).body;
    const site = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    }).expect(400);
    expect(site.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Sites e sistemas não têm linhas de serviço' }]);
    const placas = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Placas', servico: 'placas_nfc' }).expect(400);
    expect(placas.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Venda de placas precisa de exatamente uma linha de placas' }]);
  });
});

describe('/api/projetos — QR codes saíram do app', () => {
  let modelo;
  const venda = (extra = {}) => ({
    cliente_id: cliente.id, titulo: 'Placas NFC', servico: 'placas_nfc', vencimento: '2026-10-05',
    servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 8000 }], ...extra,
  });

  beforeEach(async () => {
    modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa', preco_venda_centavos: 8000 })).body;
  });

  it('projeto não devolve qrcodes e ignora o campo no corpo', async () => {
    const res = await ctx.http.post('/api/projetos').send(venda({ qrcodes: [999] })).expect(201);
    expect(res.body).not.toHaveProperty('qrcodes');
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM projetos_qrcodes').get().n).toBe(0);
    const put = await ctx.http.put(`/api/projetos/${res.body.id}`).send({ qrcodes: [999] }).expect(200);
    expect(put.body).not.toHaveProperty('qrcodes');
  });

  it('a rota /api/qrcodes não existe mais', async () => {
    await ctx.http.get('/api/qrcodes').expect(404);
  });
});

describe('/api/projetos — cobrança de GMN e placas', () => {
  const parcelasDe = async (id) => (await ctx.http.get(`/api/projetos/${id}/parcelas`)).body.parcelas;
  const gmn = (extra = {}) => ({ cliente_id: cliente.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', ...extra });

  it('cobrança única cria a parcela "Pagamento"', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' })).expect(201)).body;
    expect(await parcelasDe(criado.id)).toEqual([
      expect.objectContaining({ descricao: 'Pagamento', valor_centavos: 20000, vencimento: '2026-10-05', pago_em: null, mensalidade: 0 }),
    ]);
  });

  it('cobrança única com valor exige vencimento', async () => {
    const res = await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000 })).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'vencimento', mensagem: 'Obrigatório para cobrança única' }]);
  });

  it('editar o valor atualiza a parcela aberta; parcela paga não muda', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ valor_total_centavos: 25000, vencimento: '2026-10-20' }).expect(200);
    const [parcela] = await parcelasDe(criado.id);
    expect(parcela).toMatchObject({ valor_centavos: 25000, vencimento: '2026-10-20' });
    await ctx.http.put(`/api/parcelas/${parcela.id}`).send({ pago_em: '2026-10-01' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ valor_total_centavos: 1 }).expect(200);
    expect((await parcelasDe(criado.id))[0]).toMatchObject({ valor_centavos: 25000, pago_em: '2026-10-01' });
  });

  it('passar para mensalidade remove a parcela única ainda não paga', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({
      valor_total_centavos: 0, mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10,
    }).expect(200);
    const parcelas = await parcelasDe(criado.id);
    expect(parcelas).toEqual([expect.objectContaining({ descricao: 'Mensalidade', valor_centavos: 5000, mensalidade: 1 })]);
  });

  it('marcar configurado sem vencimento, depois de apagar a parcela no Financeiro, não dá erro nem recria', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    const [parcela] = await parcelasDe(criado.id);
    await ctx.http.delete(`/api/parcelas/${parcela.id}`).expect(204);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    expect(await parcelasDe(criado.id)).toEqual([]);
  });

  it('com parcelas feitas à mão no Financeiro, a sincronização não mexe', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    await ctx.http.post(`/api/projetos/${criado.id}/parcelas`).send({ valor_centavos: 100, vencimento: '2026-11-05' }).expect(201);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ valor_total_centavos: 30000 }).expect(200);
    expect((await parcelasDe(criado.id)).map((p) => p.valor_centavos)).toEqual([20000, 100]);
  });

  it('venda de placas cobra o valor total da linha', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa', preco_venda_centavos: 8000 })).body;
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Placas NFC', servico: 'placas_nfc', vencimento: '2026-10-05',
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_total_centavos: 15000 }],
    }).expect(201)).body;
    expect(await parcelasDe(criado.id)).toEqual([expect.objectContaining({ descricao: 'Pagamento', valor_centavos: 15000 })]);
  });

  it('site não ganha parcela automática', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', valor_total_centavos: 50000, vencimento: '2026-10-05' }).expect(201)).body;
    expect(await parcelasDe(criado.id)).toEqual([]);
  });
});

describe('/api/projetos — categorias, nicho e início da mensalidade', () => {
  it('site sem categorias recebe "Site"; com categorias guarda na ordem do cadastro', async () => {
    const semCampo = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' }).expect(201)).body;
    expect(semCampo.categorias).toEqual([{ id: 1, nome: 'Site' }]);
    const com = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'B', categorias: [4, 3, 4] }).expect(201)).body;
    expect(com.categorias).toEqual([{ id: 3, nome: 'Sistema' }, { id: 4, nome: 'SaaS' }]);
    const lista = (await ctx.http.get('/api/projetos?servico=site_sistema')).body;
    expect(lista.find((p) => p.id === com.id).categorias.map((c) => c.nome)).toEqual(['Sistema', 'SaaS']);
  });

  it('lista vazia, id inexistente ou formato errado é 400', async () => {
    const vazio = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', categorias: [] }).expect(400);
    expect(vazio.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Escolha pelo menos uma categoria' }]);
    const inexistente = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', categorias: [99] }).expect(400);
    expect(inexistente.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Categoria não encontrada' }]);
    const texto = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', categorias: ['Site'] }).expect(400);
    expect(texto.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Deve ser uma lista de categorias' }]);
  });

  it('PUT troca as categorias; PUT sem o campo mantém; PUT com [] é 400', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ categorias: [2] }).expect(200)).body.categorias).toEqual([{ id: 2, nome: 'Landing page' }]);
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ titulo: 'Novo' }).expect(200)).body.categorias).toEqual([{ id: 2, nome: 'Landing page' }]);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ categorias: [] }).expect(400);
  });

  it('GMN não tem categorias', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', categorias: [1] }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Só sites e sistemas têm categorias' }]);
    const sem = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio' }).expect(201)).body;
    expect(sem.categorias).toEqual([]);
  });

  it('site não aceita mais linhas de serviço', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', servicos: [{ tipo: 'sistemas' }] }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].tipo', mensagem: 'Tipo de serviço inválido' }]);
  });

  it('nicho: grava, devolve o nome, limpa com null e recusa inexistente', async () => {
    const nicho = (await ctx.http.post('/api/nichos').send({ nome: 'Barbearia' })).body;
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', nicho_id: nicho.id }).expect(201)).body;
    expect(criado).toMatchObject({ nicho_id: nicho.id, nicho_nome: 'Barbearia' });
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ nicho_id: null }).expect(200)).body).toMatchObject({ nicho_id: null, nicho_nome: null });
    const ruim = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', nicho_id: 999 }).expect(400);
    expect(ruim.body.erros).toEqual([{ campo: 'nicho_id', mensagem: 'Nicho não encontrado' }]);
  });

  it('modo "data" exige a data; os outros não', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    const mensal = { mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10 };
    const semData = await ctx.http.put(`/api/projetos/${criado.id}`).send({ ...mensal, mensalidade_inicio_modo: 'data' }).expect(400);
    expect(semData.body.erros).toEqual([{ campo: 'mensalidade_inicio_data', mensagem: 'Obrigatório quando a cobrança começa numa data' }]);
    const ok = await ctx.http.put(`/api/projetos/${criado.id}`).send({ ...mensal, mensalidade_inicio_modo: 'desenvolvimento' }).expect(200);
    expect(ok.body).toMatchObject({ mensalidade_inicio_modo: 'desenvolvimento', mensalidade_inicio_data: null });
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ mensalidade_inicio_modo: 'outro' }).expect(400);
  });

  it('GMN que liga a mensalidade passa a cobrar a partir de hoje', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio' })).body;
    const res = await ctx.http.put(`/api/projetos/${criado.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 3000, mensalidade_dia_vencimento: 10 }).expect(200);
    expect(res.body).toMatchObject({ mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-09-23' });
  });

  it('ir para andamento preenche a data de início', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'andamento' })).body.data_inicio).toBe('2026-09-23');
  });
});
