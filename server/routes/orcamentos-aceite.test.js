import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { definirConfig } from '../repos/config.js';

let ctx;
let cliente;
let modelo;
beforeEach(async () => {
  ctx = criarContexto({ hoje: '2026-10-21' });
  definirConfig(ctx.db, 'preco_servico_google_meu_negocio_centavos', '25000');
  const placa = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa' }).expect(201)).body;
  await ctx.http.post('/api/placas/lotes').send({
    material_id: placa.id, quantidade: 50, valor_kit_centavos: 1000, data_compra: '2026-09-01',
  }).expect(201);
  modelo = (await ctx.http.post('/api/placas/modelos').send({
    nome: 'Redonda', preco_venda_centavos: 8000, itens: [{ material_id: placa.id, quantidade: 1 }],
  }).expect(201)).body;
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Filinto' }).expect(201)).body;
});

const servicos = async () => (await ctx.http.get('/api/tabela-precos').expect(200)).body.servicos;
const porNome = async (nome) => (await servicos()).find((s) => s.nome === nome);
const novoOrcamento = async () => (await ctx.http.post(`/api/clientes/${cliente.id}/orcamentos`).expect(201)).body;
const addItem = async (orc, corpo) => (await ctx.http.post(`/api/orcamentos/${orc.id}/itens`).send(corpo).expect(201)).body;
const aceitar = (orc, escolhas) => ctx.http.post(`/api/orcamentos/${orc.id}/aceitar`).send({ escolhas });
const itemDe = (orc, nome) => orc.itens.find((i) => i.nome === nome);
const projetosDo = () => ctx.db.prepare('SELECT * FROM projetos ORDER BY id').all().map((p) => ({ ...p }));
const parcelasDe = (projetoId) => ctx.db.prepare('SELECT descricao, valor_centavos, vencimento FROM parcelas WHERE projeto_id = ? ORDER BY vencimento, id')
  .all(projetoId).map((p) => ({ ...p }));
const vendasDo = () => ctx.db.prepare('SELECT * FROM placas_vendas ORDER BY id').all().map((v) => ({ ...v }));

// Cardápio (traz a hospedagem junto) + GMN + gestão do GMN + 3 placas, com 10% de combo.
async function orcamentoCompleto() {
  let orc = await novoOrcamento();
  orc = await addItem(orc, { servico_id: (await porNome('Cardápio / catálogo digital')).id });
  orc = await addItem(orc, { servico_id: (await porNome('Configuração do Google Meu Negócio')).id });
  orc = await addItem(orc, { servico_id: (await porNome('Gestão do Google Meu Negócio')).id });
  orc = await addItem(orc, { servico_id: (await porNome('Placa NFC')).id, placa_modelo_id: modelo.id, quantidade: 3 });
  return orc;
}

describe('POST /orcamentos/:id/aceitar', () => {
  it('cria site, mensalidades, GMN e venda de placa com o desconto dividido e marca aceito', async () => {
    const orc = await orcamentoCompleto();
    expect(orc.totais).toMatchObject({ subtotal_unico_centavos: 139000, desconto_centavos: 13900, total_unico_centavos: 125100 });
    const cardapio = itemDe(orc, 'Cardápio / catálogo digital');
    const gmn = itemDe(orc, 'Configuração do Google Meu Negócio');
    const res = (await aceitar(orc, [
      { item_id: cardapio.id, destino: 'site', parcelas: { modo: 'entrada_entrega', primeira: '2026-10-25' } },
      { item_id: itemDe(orc, 'Hospedagem e suporte').id, destino: 'mensal_site', dia_vencimento: 10 },
      { item_id: gmn.id, destino: 'gmn', parcelas: { modo: 'mensais', quantidade: 3, primeira: '2026-11-01' } },
      { item_id: itemDe(orc, 'Gestão do Google Meu Negócio').id, destino: 'mensal_gmn', alvo_item_id: gmn.id },
      { item_id: itemDe(orc, 'Placa NFC — Redonda').id, destino: 'placa' },
    ]).expect(200)).body;
    expect(res.situacao).toBe('aceito');

    const [site, google] = projetosDo();
    expect(site).toMatchObject({
      servico: 'site_sistema', titulo: 'Cardápio / catálogo digital', etapa: 'valor_definido', cliente_id: cliente.id,
      valor_total_centavos: 81000, orcamento_id: orc.id,
      mensalidade_ativa: 1, mensalidade_valor_centavos: 15000, mensalidade_dia_vencimento: 10, mensalidade_inicio_modo: 'entrega',
    });
    expect(parcelasDe(site.id)).toEqual([
      { descricao: 'Entrada (50%)', valor_centavos: 40500, vencimento: '2026-10-25' },
      { descricao: 'Na entrega (50%)', valor_centavos: 40500, vencimento: '2026-11-25' },
    ]);
    const categorias = (await ctx.http.get(`/api/projetos/${site.id}`).expect(200)).body.categorias;
    expect(categorias.map((c) => c.nome)).toEqual(['Site']);

    expect(google).toMatchObject({
      servico: 'google_meu_negocio', etapa: 'andamento', valor_total_centavos: 22500, orcamento_id: orc.id,
      mensalidade_ativa: 1, mensalidade_valor_centavos: 15000, mensalidade_dia_vencimento: 21,
      mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-10-21', data_inicio: '2026-10-21',
    });
    expect(parcelasDe(google.id)).toEqual([
      { descricao: 'Parcela 1/3', valor_centavos: 7500, vencimento: '2026-11-01' },
      { descricao: 'Parcela 2/3', valor_centavos: 7500, vencimento: '2026-12-01' },
      { descricao: 'Parcela 3/3', valor_centavos: 7500, vencimento: '2027-01-01' },
    ]);

    const [venda] = vendasDo();
    expect(venda).toMatchObject({
      modelo_id: modelo.id, quantidade: 3, preco_vendido_centavos: 7200, custo_unitario_centavos: 20,
      cliente_id: cliente.id, data_venda: '2026-10-21', recebido_em: null, quantidade_montada: 0, orcamento_id: orc.id,
    });
    // a soma do que foi criado bate com o total do orçamento
    expect(site.valor_total_centavos + google.valor_total_centavos + venda.preco_vendido_centavos * venda.quantidade).toBe(125100);

    expect(res.gerados).toEqual({
      projetos: [
        { id: site.id, titulo: 'Cardápio / catálogo digital', servico: 'site_sistema', cliente_id: cliente.id, vinculado: false, pode_apagar: true },
        { id: google.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', cliente_id: cliente.id, vinculado: false, pode_apagar: true },
      ],
      vendas: [{ id: venda.id, modelo_nome: 'Redonda', quantidade: 3, pode_apagar: true }],
    });
    // a venda aparece como a receber no Financeiro
    const aReceber = (await ctx.http.get('/api/parcelas?servico=placas_nfc').expect(200)).body;
    expect(aReceber).toMatchObject([{ tipo: 'venda_placa', valor_centavos: 21600, estado: 'pendente' }]);
  });

  it('não gera duas vezes', async () => {
    const orc = await orcamentoCompleto();
    const cardapio = itemDe(orc, 'Cardápio / catálogo digital');
    await aceitar(orc, [{ item_id: cardapio.id, destino: 'site' }]).expect(200);
    const res = await aceitar(orc, [{ item_id: cardapio.id, destino: 'site' }]).expect(409);
    expect(res.body.erro).toMatch(/já gerou/);
    expect(projetosDo()).toHaveLength(1);
  });

  it('sem parcelas, à vista e N mensais com os centavos que sobram na última', async () => {
    let orc = await novoOrcamento();
    orc = await addItem(orc, { livre: true, nome: 'Loja', valor_unico_centavos: 100000 });
    orc = await addItem(orc, { livre: true, nome: 'Landing page da promoção', valor_unico_centavos: 50000 });
    orc = await addItem(orc, { livre: true, nome: 'Fotos', valor_unico_centavos: 20000 });
    await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ desconto_pct: null }).expect(200);
    await aceitar(orc, [
      { item_id: orc.itens[0].id, destino: 'site', parcelas: { modo: 'mensais', quantidade: 3, primeira: '2026-01-31' } },
      { item_id: orc.itens[1].id, destino: 'site', parcelas: { modo: 'avista' } },
      { item_id: orc.itens[2].id, destino: 'site', parcelas: { modo: 'nenhuma' } },
    ]).expect(200);
    const [loja, landing, fotos] = projetosDo();
    expect(parcelasDe(loja.id)).toEqual([
      { descricao: 'Parcela 1/3', valor_centavos: 33333, vencimento: '2026-01-31' },
      { descricao: 'Parcela 2/3', valor_centavos: 33333, vencimento: '2026-02-28' },
      { descricao: 'Parcela 3/3', valor_centavos: 33334, vencimento: '2026-03-31' },
    ]);
    // sem data, a primeira vence hoje
    expect(parcelasDe(landing.id)).toEqual([{ descricao: 'À vista', valor_centavos: 50000, vencimento: '2026-10-21' }]);
    expect(parcelasDe(fotos.id)).toEqual([]);
    const categoria = (id) => ctx.db.prepare('SELECT c.nome FROM projetos_categorias pc JOIN categorias c ON c.id = pc.categoria_id WHERE pc.projeto_id = ?').get(id).nome;
    expect([categoria(loja.id), categoria(landing.id)]).toEqual(['Site', 'Landing page']);
  });

  it('desconto com resto: a soma bate e a placa fica com preço inteiro por unidade', async () => {
    let orc = await novoOrcamento();
    orc = await addItem(orc, { livre: true, nome: 'Site', valor_unico_centavos: 100001 });
    orc = await addItem(orc, { servico_id: (await porNome('Placa NFC')).id, placa_modelo_id: modelo.id, quantidade: 3 });
    orc = (await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ desconto_pct: 7 }).expect(200)).body;
    await aceitar(orc, orc.itens.map((i) => ({ item_id: i.id, destino: i.tipo_servico === 'placa' ? 'placa' : 'site' }))).expect(200);
    const [site] = projetosDo();
    const [venda] = vendasDo();
    expect(site.valor_total_centavos + venda.preco_vendido_centavos * 3).toBe(orc.totais.total_unico_centavos);
  });

  it('item desmarcado não cria nada; tudo desmarcado só marca aceito', async () => {
    const orc = await orcamentoCompleto();
    const res = (await aceitar(orc, orc.itens.map((i) => ({ item_id: i.id, destino: 'nenhum' }))).expect(200)).body;
    expect(res.situacao).toBe('aceito');
    expect(res.gerados).toEqual({ projetos: [], vendas: [] });
    expect(projetosDo()).toEqual([]);
    expect(vendasDo()).toEqual([]);
  });

  it('gestão do GMN sem configuração cria um GMN só para a mensalidade', async () => {
    let orc = await novoOrcamento();
    orc = await addItem(orc, { servico_id: (await porNome('Gestão do Google Meu Negócio')).id });
    await aceitar(orc, [{ item_id: orc.itens[0].id, destino: 'mensal_gmn', dia_vencimento: 5 }]).expect(200);
    expect(projetosDo()).toMatchObject([{
      servico: 'google_meu_negocio', valor_total_centavos: 0, mensalidade_ativa: 1, mensalidade_valor_centavos: 15000,
      mensalidade_dia_vencimento: 5, orcamento_id: orc.id,
    }]);
  });

  it('recusa escolhas impossíveis sem gravar nada', async () => {
    const orc = await orcamentoCompleto();
    const hospedagem = itemDe(orc, 'Hospedagem e suporte');
    const cardapio = itemDe(orc, 'Cardápio / catálogo digital');
    const placa = itemDe(orc, 'Placa NFC — Redonda');
    // hospedagem sem site
    let res = await aceitar(orc, [{ item_id: hospedagem.id, destino: 'mensal_site' }]).expect(400);
    expect(res.body.erro).toMatch(/nenhum site/);
    // placa não vira site
    await aceitar(orc, [{ item_id: placa.id, destino: 'site' }]).expect(400);
    // duas mensalidades no mesmo site
    let comDois = await addItem(orc, { servico_id: (await porNome('Hospedagem e suporte')).id });
    expect(comDois.itens.filter((i) => i.tipo_servico === 'hospedagem')).toHaveLength(1);
    comDois = await addItem(orc, { livre: true, nome: 'Manutenção', valor_mensal_centavos: 5000 });
    res = await aceitar(orc, [
      { item_id: cardapio.id, destino: 'site' },
      { item_id: hospedagem.id, destino: 'mensal_site' },
      { item_id: itemDe(comDois, 'Manutenção').id, destino: 'mensal_site' },
    ]).expect(400);
    expect(res.body.erro).toMatch(/já recebe outra mensalidade/);
    // placa sem lote: falha no meio e desfaz tudo
    ctx.db.exec('DELETE FROM placas_lotes');
    res = await aceitar(orc, [{ item_id: cardapio.id, destino: 'site' }, { item_id: placa.id, destino: 'placa' }]).expect(400);
    expect(res.body.erro).toMatch(/Placa NFC — Redonda: .*lote/);
    expect(projetosDo()).toEqual([]);
    expect((await ctx.http.get(`/api/orcamentos/${orc.id}`)).body.situacao).toBe('rascunho');
  });

  it('com dois sites a hospedagem precisa dizer qual', async () => {
    let orc = await novoOrcamento();
    orc = await addItem(orc, { servico_id: (await porNome('Landing page')).id });
    orc = await addItem(orc, { servico_id: (await porNome('Loja online')).id });
    const [landing, loja, hospedagem] = orc.itens;
    expect(hospedagem.tipo_servico).toBe('hospedagem');
    const base = [{ item_id: landing.id, destino: 'site' }, { item_id: loja.id, destino: 'site' }];
    await aceitar(orc, [...base, { item_id: hospedagem.id, destino: 'mensal_site' }]).expect(400);
    await aceitar(orc, [...base, { item_id: hospedagem.id, destino: 'mensal_site', alvo_item_id: loja.id }]).expect(200);
    const lista = projetosDo();
    expect(lista.find((p) => p.titulo === 'Loja online')).toMatchObject({ mensalidade_ativa: 1, mensalidade_valor_centavos: 15000 });
    expect(lista.find((p) => p.titulo === 'Landing page')).toMatchObject({ mensalidade_ativa: 0 });
  });

  it('PUT não aceita sem a conferência', async () => {
    const orc = await orcamentoCompleto();
    const res = await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ situacao: 'aceito' }).expect(409);
    expect(res.body.erro).toMatch(/confira/);
  });
});

describe('POST /orcamentos/:id/desfazer', () => {
  async function aceito() {
    const orc = await orcamentoCompleto();
    const gmn = itemDe(orc, 'Configuração do Google Meu Negócio');
    return (await aceitar(orc, [
      { item_id: itemDe(orc, 'Cardápio / catálogo digital').id, destino: 'site', parcelas: { modo: 'avista' } },
      { item_id: gmn.id, destino: 'gmn', parcelas: { modo: 'avista' } },
      { item_id: itemDe(orc, 'Placa NFC — Redonda').id, destino: 'placa' },
    ]).expect(200)).body;
  }

  it('apaga o que não andou e mantém o que já andou, que continua ligado ao orçamento', async () => {
    const orc = await aceito();
    const [site, google] = orc.gerados.projetos;
    const pagar = ctx.db.prepare('SELECT id FROM parcelas WHERE projeto_id = ?').get(site.id);
    await ctx.http.put(`/api/parcelas/${pagar.id}`).send({ pago_em: '2026-10-21' }).expect(200);
    const depois = (await ctx.http.get(`/api/orcamentos/${orc.id}`)).body;
    expect(depois.gerados.projetos.map((p) => p.pode_apagar)).toEqual([false, true]);

    const res = (await ctx.http.post(`/api/orcamentos/${orc.id}/desfazer`).send({ situacao: 'enviado', apagar: true }).expect(200)).body;
    expect(res.situacao).toBe('enviado');
    expect(res.gerados).toEqual({ projetos: [{ ...site, pode_apagar: false }], vendas: [] });
    expect(projetosDo().map((p) => p.id)).toEqual([site.id]);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM projetos WHERE id = ?').get(google.id).n).toBe(0);
    expect(vendasDo()).toEqual([]);

    // já gerou: voltar para aceito é direto, e gerar de novo é recusado
    await aceitar(orc, []).expect(409);
    expect((await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ situacao: 'aceito' }).expect(200)).body.situacao).toBe('aceito');
  });

  it('venda recebida ou com placa montada não é apagada', async () => {
    const orc = await aceito();
    const [venda] = orc.gerados.vendas;
    await ctx.http.post(`/api/placas/vendas/${venda.id}/recebimento`).expect(200);
    const res = (await ctx.http.post(`/api/orcamentos/${orc.id}/desfazer`).send({ situacao: 'recusado', apagar: true }).expect(200)).body;
    expect(res.gerados).toEqual({ projetos: [], vendas: [{ ...venda, pode_apagar: false }] });

    const outro = await aceito();
    ctx.db.prepare('UPDATE placas_vendas SET quantidade_montada = 1 WHERE id = ?').run(outro.gerados.vendas[0].id);
    const res2 = (await ctx.http.post(`/api/orcamentos/${outro.id}/desfazer`).send({ situacao: 'rascunho', apagar: true }).expect(200)).body;
    expect(res2.gerados.vendas).toHaveLength(1);
  });

  it('sem apagar só muda a situação', async () => {
    const orc = await aceito();
    const res = (await ctx.http.post(`/api/orcamentos/${orc.id}/desfazer`).send({ situacao: 'rascunho' }).expect(200)).body;
    expect(res.situacao).toBe('rascunho');
    expect(res.gerados).toEqual(orc.gerados);
    await ctx.http.post(`/api/orcamentos/${orc.id}/desfazer`).send({ situacao: 'aceito' }).expect(400);
  });

  it('apagar o orçamento mantém o que ele gerou', async () => {
    const orc = await aceito();
    await ctx.http.delete(`/api/orcamentos/${orc.id}`).expect(204);
    expect(projetosDo().map((p) => p.orcamento_id)).toEqual([null, null]);
    expect(vendasDo().map((v) => v.orcamento_id)).toEqual([null]);
  });
});

describe('GET /orcamentos', () => {
  it('lista todos com cliente, totais, validade e o que pede atenção', async () => {
    const outro = (await ctx.http.post('/api/clientes').send({ nome: 'Popy' }).expect(201)).body;
    const criar = async (c, campos, mexidoEm) => {
      let orc = (await ctx.http.post(`/api/clientes/${c.id}/orcamentos`).expect(201)).body;
      orc = await addItem(orc, { livre: true, nome: 'Site', valor_unico_centavos: 100000, valor_mensal_centavos: 5000 });
      orc = (await ctx.http.put(`/api/orcamentos/${orc.id}`).send(campos).expect(200)).body;
      if (mexidoEm) {
        ctx.db.prepare('UPDATE orcamentos SET atualizado_em = ? WHERE id = ?').run(mexidoEm, orc.id);
        ctx.db.prepare('UPDATE orcamento_itens SET atualizado_em = ? WHERE orcamento_id = ?').run(mexidoEm, orc.id);
      }
      return orc;
    };
    const semResposta = await criar(cliente, { situacao: 'enviado', data: '2026-10-01', validade_dias: 30 });
    const vencendo = await criar(outro, { situacao: 'enviado', data: '2026-10-18', validade_dias: 5 });
    const parado = await criar(cliente, { situacao: 'rascunho' }, '2026-10-10T12:00:00.000Z');
    const recente = await criar(cliente, { situacao: 'rascunho' }, '2026-10-20T12:00:00.000Z');

    const lista = (await ctx.http.get('/api/orcamentos').expect(200)).body;
    expect(lista.map((o) => o.id)).toEqual([recente.id, parado.id, vencendo.id, semResposta.id]);
    expect(lista[3]).toEqual({
      id: semResposta.id, numero: semResposta.id, cliente_id: cliente.id, cliente_nome: 'Filinto', data: '2026-10-01',
      validade_dias: 30, situacao: 'enviado', totais: semResposta.totais, gerou: false,
      vence_em: '2026-10-31', dias_para_vencer: 10, sem_resposta: true, vencendo: false, parado: false,
    });
    expect(lista[3].totais).toMatchObject({ total_unico_centavos: 100000, total_mensal_centavos: 5000 });
    expect(lista[2]).toMatchObject({ cliente_nome: 'Popy', vence_em: '2026-10-23', dias_para_vencer: 2, sem_resposta: false, vencendo: true });
    expect(lista[1]).toMatchObject({ situacao: 'rascunho', parado: true, vencendo: false });
    expect(lista[0]).toMatchObject({ parado: false });
  });
});

describe('aceite vinculando a um projeto que já existe', () => {
  // "Cardápio digital p/ empresas" em protótipo, com tarefa, nota e prazo, como o do Filinto.
  async function cardapioExistente(campos = {}) {
    const projeto = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Cardápio digital p/ empresas', etapa: 'prototipo', valor_total_centavos: 150000,
      notas: 'cliente quer o admin simples', prazo_entrega: '2026-11-30', ...campos,
    }).expect(201)).body;
    await ctx.http.post(`/api/projetos/${projeto.id}/tarefas`).send({ texto: 'Pegar lista de produtos reais' }).expect(201);
    return projeto;
  }
  // uma parcela paga e uma aberta, combinadas antes do orçamento
  const comParcelas = async (projeto) => {
    const paga = (await ctx.http.post(`/api/projetos/${projeto.id}/parcelas`).send({ descricao: 'Sinal', valor_centavos: 20000, vencimento: '2026-10-01' }).expect(201)).body;
    await ctx.http.put(`/api/parcelas/${paga.id}`).send({ pago_em: '2026-10-01' }).expect(200);
    await ctx.http.post(`/api/projetos/${projeto.id}/parcelas`).send({ descricao: 'Combinado antes', valor_centavos: 30000, vencimento: '2026-12-01' }).expect(201);
  };
  const projeto = (id) => ({ ...ctx.db.prepare('SELECT * FROM projetos WHERE id = ?').get(id) });
  const tarefasDe = (id) => ctx.db.prepare('SELECT texto FROM tarefas WHERE projeto_id = ?').all(id).map((t) => t.texto);
  const escolhasDo = (orc, cardapioExtra = {}, hospedagemExtra = {}) => [
    { item_id: itemDe(orc, 'Cardápio / catálogo digital').id, destino: 'site', parcelas: { modo: 'entrada_entrega', primeira: '2026-10-25' }, ...cardapioExtra },
    { item_id: itemDe(orc, 'Hospedagem e suporte').id, destino: 'mensal_site', dia_vencimento: 10, ...hospedagemExtra },
  ];

  it('mostra os projetos que podem ser vinculados (sem perdido, fictício, já ligado ou de outro serviço/cliente)', async () => {
    const existente = await cardapioExistente();
    await comParcelas(existente);
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Velho', etapa: 'perdido' }).expect(201);
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Demo', etapa: 'andamento', ficticio: true }).expect(201);
    const t = '2026-10-01T00:00:00.000Z';
    ctx.db.prepare("INSERT INTO projetos (cliente_id, titulo, servico, etapa, criado_em, atualizado_em) VALUES (?, 'Placas', 'placas_nfc', 'andamento', ?, ?)")
      .run(cliente.id, t, t);
    const outro = (await ctx.http.post('/api/clientes').send({ nome: 'Popy' }).expect(201)).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: outro.id, titulo: 'Site da Popy' }).expect(201);
    const orc = await novoOrcamento();
    expect(orc.projetos_vinculaveis).toEqual([{
      id: existente.id, titulo: 'Cardápio digital p/ empresas', servico: 'site_sistema', etapa: 'prototipo',
      valor_total_centavos: 150000, mensalidade_ativa: 0, mensalidade_valor_centavos: 0, mensalidade_dia_vencimento: null,
      parcelas: [
        { id: expect.any(Number), descricao: 'Sinal', valor_centavos: 20000, vencimento: '2026-10-01', pago_em: '2026-10-01' },
        { id: expect.any(Number), descricao: 'Combinado antes', valor_centavos: 30000, vencimento: '2026-12-01', pago_em: null },
      ],
    }]);
  });

  it('site em protótipo vai para Valor definido com o valor do orçamento, sem perder tarefas, parcelas e dados', async () => {
    const existente = await cardapioExistente();
    await comParcelas(existente);
    const antes = projeto(existente.id);
    const orc = await orcamentoCompleto();
    const res = (await aceitar(orc, escolhasDo(orc, { projeto_id: existente.id })).expect(200)).body;

    // não criou outro site
    expect(projetosDo().filter((p) => p.servico === 'site_sistema')).toHaveLength(1);
    const depois = projeto(existente.id);
    expect(depois).toEqual({
      ...antes,
      etapa: 'valor_definido', valor_total_centavos: 81000, orcamento_id: orc.id, orcamento_vinculado: 1,
      mensalidade_ativa: 1, mensalidade_valor_centavos: 15000, mensalidade_dia_vencimento: 10,
      atualizado_em: depois.atualizado_em,
    });
    expect(tarefasDe(existente.id)).toEqual(['Pegar lista de produtos reais']);
    // as parcelas antigas ficam e as do aceite entram além delas
    expect(parcelasDe(existente.id)).toEqual([
      { descricao: 'Sinal', valor_centavos: 20000, vencimento: '2026-10-01' },
      { descricao: 'Entrada (50%)', valor_centavos: 40500, vencimento: '2026-10-25' },
      { descricao: 'Na entrega (50%)', valor_centavos: 40500, vencimento: '2026-11-25' },
      { descricao: 'Combinado antes', valor_centavos: 30000, vencimento: '2026-12-01' },
    ]);
    expect(res.gerados.projetos).toEqual([{
      id: existente.id, titulo: 'Cardápio digital p/ empresas', servico: 'site_sistema', cliente_id: cliente.id,
      vinculado: true, pode_apagar: false, parcelas_abertas: 2,
    }]);
    // já vinculado: não aparece mais como opção
    expect(res.projetos_vinculaveis).toEqual([]);
  });

  it('projeto já em versão final não muda de etapa; GMN configurado continua configurado', async () => {
    const existente = await cardapioExistente({ etapa: 'andamento' });
    const gmn = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'GMN antigo', servico: 'google_meu_negocio',
    }).expect(201)).body;
    await ctx.http.put(`/api/projetos/${gmn.id}`).send({ etapa: 'entregue' }).expect(200);
    const orc = await orcamentoCompleto();
    await aceitar(orc, [
      ...escolhasDo(orc, { projeto_id: existente.id, parcelas: { modo: 'nenhuma' } }),
      { item_id: itemDe(orc, 'Configuração do Google Meu Negócio').id, destino: 'gmn', projeto_id: gmn.id },
    ]).expect(200);
    expect(projeto(existente.id)).toMatchObject({ etapa: 'andamento', valor_total_centavos: 81000, orcamento_vinculado: 1 });
    expect(projeto(gmn.id)).toMatchObject({ etapa: 'entregue', valor_total_centavos: 22500, orcamento_id: orc.id });
    expect(parcelasDe(existente.id)).toEqual([]);
    expect(projetosDo()).toHaveLength(2);
  });

  it('mensalidade que o projeto já tem fica, a menos que peça para substituir', async () => {
    const existente = await cardapioExistente({ mensalidade_ativa: true, mensalidade_valor_centavos: 9000, mensalidade_dia_vencimento: 5 });
    const orc = await orcamentoCompleto();
    await aceitar(orc, escolhasDo(orc, { projeto_id: existente.id })).expect(200);
    expect(projeto(existente.id)).toMatchObject({ mensalidade_ativa: 1, mensalidade_valor_centavos: 9000, mensalidade_dia_vencimento: 5 });

    // substituindo: valor e dia do orçamento, e a mensalidade ainda não vencida acompanha
    const outro = await cardapioExistente({
      titulo: 'Outro', mensalidade_ativa: true, mensalidade_valor_centavos: 9000, mensalidade_dia_vencimento: 5,
      mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-09-05',
    });
    const t = '2026-10-01T00:00:00.000Z';
    const mensal = ctx.db.prepare(`INSERT INTO parcelas (projeto_id, descricao, valor_centavos, vencimento, mensalidade, criado_em, atualizado_em)
      VALUES (?, 'Mensalidade', 9000, ?, 1, ?, ?)`);
    mensal.run(outro.id, '2026-10-05', t, t);
    mensal.run(outro.id, '2026-11-05', t, t);
    const orc2 = await orcamentoCompleto();
    await aceitar(orc2, escolhasDo(orc2, { projeto_id: outro.id }, { substituir_mensalidade: true })).expect(200);
    expect(projeto(outro.id)).toMatchObject({ mensalidade_valor_centavos: 15000, mensalidade_dia_vencimento: 10 });
    const mensais = ctx.db.prepare('SELECT valor_centavos, vencimento FROM parcelas WHERE projeto_id = ? AND mensalidade = 1 ORDER BY vencimento')
      .all(outro.id).map((p) => ({ ...p }));
    // a atrasada fica como foi combinada; a que ainda não venceu passa para o valor e o dia novos
    expect(mensais).toEqual([{ valor_centavos: 9000, vencimento: '2026-10-05' }, { valor_centavos: 15000, vencimento: '2026-11-10' }]);
  });

  it('sem mensalidade no projeto, a do orçamento é ligada como num projeto novo', async () => {
    const existente = await cardapioExistente();
    const orc = await orcamentoCompleto();
    await aceitar(orc, escolhasDo(orc, { projeto_id: existente.id })).expect(200);
    expect(projeto(existente.id)).toMatchObject({ mensalidade_ativa: 1, mensalidade_valor_centavos: 15000, mensalidade_dia_vencimento: 10 });
  });

  it('recusa projeto de outro cliente, de outro serviço, perdido, inexistente, já vinculado ou repetido, sem gravar nada', async () => {
    const existente = await cardapioExistente();
    const outroCliente = (await ctx.http.post('/api/clientes').send({ nome: 'Popy' }).expect(201)).body;
    const daPopy = (await ctx.http.post('/api/projetos').send({ cliente_id: outroCliente.id, titulo: 'Site da Popy' }).expect(201)).body;
    const perdido = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Velho', etapa: 'perdido' }).expect(201)).body;
    const gmn = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio' }).expect(201)).body;
    const orc = await orcamentoCompleto();
    const cardapio = itemDe(orc, 'Cardápio / catálogo digital');
    const configGmn = itemDe(orc, 'Configuração do Google Meu Negócio');
    const tentar = async (escolhas, erro) => {
      const res = await aceitar(orc, escolhas).expect(400);
      expect(res.body.erro).toMatch(erro);
    };
    await tentar([{ item_id: cardapio.id, destino: 'site', projeto_id: daPopy.id }], /é de outro cliente/);
    await tentar([{ item_id: cardapio.id, destino: 'site', projeto_id: gmn.id }], /é de outro serviço/);
    await tentar([{ item_id: configGmn.id, destino: 'gmn', projeto_id: existente.id }], /é de outro serviço/);
    await tentar([{ item_id: cardapio.id, destino: 'site', projeto_id: perdido.id }], /está perdido/);
    await tentar([{ item_id: cardapio.id, destino: 'site', projeto_id: 9999 }], /não existe/);
    await tentar([{ item_id: itemDe(orc, 'Placa NFC — Redonda').id, destino: 'placa', projeto_id: existente.id }], /só site e Google Meu Negócio/);
    const comDois = await addItem(orc, { livre: true, nome: 'Landing', valor_unico_centavos: 10000 });
    await tentar([
      { item_id: cardapio.id, destino: 'site', projeto_id: existente.id },
      { item_id: itemDe(comDois, 'Landing').id, destino: 'site', projeto_id: existente.id },
    ], /mesmo projeto foi escolhido para dois itens/);
    expect(projeto(existente.id)).toMatchObject({ etapa: 'prototipo', orcamento_id: null, valor_total_centavos: 150000 });

    // já vinculado a outro orçamento
    const primeiro = await orcamentoCompleto();
    await aceitar(primeiro, [{ item_id: itemDe(primeiro, 'Cardápio / catálogo digital').id, destino: 'site', projeto_id: existente.id }]).expect(200);
    await tentar([{ item_id: cardapio.id, destino: 'site', projeto_id: existente.id }], /já está ligado a um orçamento/);
    expect((await ctx.http.get(`/api/orcamentos/${orc.id}`)).body.situacao).toBe('rascunho');
  });

  it('desfazer: o vinculado não é apagado, só desvinculado, e perde só as parcelas abertas do aceite', async () => {
    const existente = await cardapioExistente();
    await comParcelas(existente);
    const orc = await orcamentoCompleto();
    const aceito = (await aceitar(orc, [
      ...escolhasDo(orc, { projeto_id: existente.id }),
      { item_id: itemDe(orc, 'Configuração do Google Meu Negócio').id, destino: 'gmn', parcelas: { modo: 'avista' } },
    ]).expect(200)).body;
    // a entrada do aceite foi paga
    const entrada = ctx.db.prepare("SELECT id FROM parcelas WHERE projeto_id = ? AND descricao = 'Entrada (50%)'").get(existente.id);
    await ctx.http.put(`/api/parcelas/${entrada.id}`).send({ pago_em: '2026-10-25' }).expect(200);
    const google = aceito.gerados.projetos.find((p) => p.servico === 'google_meu_negocio');

    const res = (await ctx.http.post(`/api/orcamentos/${orc.id}/desfazer`).send({ situacao: 'enviado', apagar: true }).expect(200)).body;
    expect(res.gerados).toEqual({ projetos: [], vendas: [] });
    // o GMN criado sumiu; o vinculado continua, sem orçamento, com etapa, valor e mensalidade do aceite
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM projetos WHERE id = ?').get(google.id).n).toBe(0);
    expect(projeto(existente.id)).toMatchObject({
      orcamento_id: null, orcamento_vinculado: 0, etapa: 'valor_definido', valor_total_centavos: 81000, mensalidade_ativa: 1,
    });
    expect(tarefasDe(existente.id)).toEqual(['Pegar lista de produtos reais']);
    expect(parcelasDe(existente.id)).toEqual([
      { descricao: 'Sinal', valor_centavos: 20000, vencimento: '2026-10-01' },
      { descricao: 'Entrada (50%)', valor_centavos: 40500, vencimento: '2026-10-25' },
      { descricao: 'Combinado antes', valor_centavos: 30000, vencimento: '2026-12-01' },
    ]);
    // desvinculado, volta a ser opção e o orçamento pode ser aceito de novo
    expect(res.projetos_vinculaveis.map((p) => p.id)).toEqual([existente.id]);
    await aceitar(orc, [{ item_id: itemDe(orc, 'Cardápio / catálogo digital').id, destino: 'site', projeto_id: existente.id }]).expect(200);
  });

  it('desfazer sem apagar mantém o vínculo', async () => {
    const existente = await cardapioExistente();
    const orc = await orcamentoCompleto();
    await aceitar(orc, escolhasDo(orc, { projeto_id: existente.id })).expect(200);
    const res = (await ctx.http.post(`/api/orcamentos/${orc.id}/desfazer`).send({ situacao: 'enviado' }).expect(200)).body;
    expect(res.gerados.projetos).toMatchObject([{ id: existente.id, vinculado: true, parcelas_abertas: 2 }]);
    expect(projeto(existente.id).orcamento_id).toBe(orc.id);
  });
});
