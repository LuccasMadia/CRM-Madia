import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { definirConfig } from '../repos/config.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-10-21' });
});

const servicos = async () => (await ctx.http.get('/api/tabela-precos').expect(200)).body.servicos;
const porNome = async (nome) => (await servicos()).find((s) => s.nome === nome);
const porTipo = async (tipo) => (await servicos()).find((s) => s.tipo === tipo);

async function novoCliente(nome = 'Filinto') {
  return (await ctx.http.post('/api/clientes').send({ nome }).expect(201)).body;
}
async function novoOrcamento(cliente) {
  const c = cliente ?? (await novoCliente());
  return (await ctx.http.post(`/api/clientes/${c.id}/orcamentos`).expect(201)).body;
}
const addItem = (orc, corpo) => ctx.http.post(`/api/orcamentos/${orc.id}/itens`).send(corpo);

describe('/api/orcamentos', () => {
  it('cria orçamento com número, data de hoje, 15 dias, a combinar e desconto 10', async () => {
    const cliente = await novoCliente();
    const orc = await novoOrcamento(cliente);
    expect(orc).toMatchObject({
      numero: orc.id, cliente_id: cliente.id, cliente_nome: 'Filinto', data: '2026-10-21',
      validade_dias: 15, pagamento: 'a combinar', prazo: 'a combinar', desconto_pct: 10,
      situacao: 'rascunho', itens: [], sugerir_hospedagem: false,
    });
    expect(orc.totais.total_unico_centavos).toBe(0);
    const lista = (await ctx.http.get(`/api/clientes/${cliente.id}/orcamentos`).expect(200)).body;
    expect(lista).toEqual([{ id: orc.id, numero: orc.id, data: '2026-10-21', situacao: 'rascunho', totais: orc.totais }]);
    await ctx.http.post('/api/clientes/999/orcamentos').expect(404);
    await ctx.http.get('/api/orcamentos/999').expect(404);
  });

  it('atualiza dados do orçamento com validação e exclui', async () => {
    const orc = await novoOrcamento();
    const res = (await ctx.http.put(`/api/orcamentos/${orc.id}`)
      .send({ validade_dias: 30, pagamento: '50% + 50%', situacao: 'enviado', desconto_pct: null, observacao: 'Oi' }).expect(200)).body;
    expect(res).toMatchObject({ validade_dias: 30, pagamento: '50% + 50%', situacao: 'enviado', desconto_pct: null, observacao: 'Oi' });
    await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ validade_dias: 0 }).expect(400);
    await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ situacao: 'xis' }).expect(400);
    await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ desconto_pct: 101 }).expect(400);
    await ctx.http.delete(`/api/orcamentos/${orc.id}`).expect(204);
    await ctx.http.get(`/api/orcamentos/${orc.id}`).expect(404);
  });

  it('monta o orçamento do Filinto: placa pelo preço do modelo, GMN da config, cardápio traz hospedagem junto', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Redonda', preco_venda_centavos: 8000, itens: [] }).expect(201)).body;
    definirConfig(ctx.db, 'preco_servico_google_meu_negocio_centavos', '25000');
    const orc = await novoOrcamento();
    const placa = await porTipo('placa');
    const gmn = await porTipo('gmn_config');
    const cardapio = await porNome('Cardápio / catálogo digital');

    await addItem(orc, { servico_id: placa.id }).expect(400);
    await addItem(orc, { servico_id: placa.id, placa_modelo_id: 999 }).expect(400);
    let res = (await addItem(orc, { servico_id: placa.id, placa_modelo_id: modelo.id }).expect(201)).body;
    expect(res.itens[0]).toMatchObject({ nome: 'Placa NFC — Redonda', valor_unico_centavos: 8000, quantidade: 1, tipo_servico: 'placa' });
    res = (await addItem(orc, { servico_id: gmn.id }).expect(201)).body;
    expect(res.itens[1]).toMatchObject({ valor_unico_centavos: 25000, tipo_servico: 'gmn_config' });
    res = (await addItem(orc, { servico_id: cardapio.id }).expect(201)).body;
    expect(res.itens).toHaveLength(4);
    expect(res.itens[2].valor_unico_centavos).toBe(90000);
    expect(res.itens[3]).toMatchObject({ nome: 'Hospedagem e suporte', valor_mensal_centavos: 15000, tipo_servico: 'hospedagem' });

    res = (await ctx.http.put(`/api/orcamentos/${orc.id}/itens/${res.itens[2].id}`).send({ valor_unico_centavos: 150000 }).expect(200)).body;
    expect(res.totais.total_unico_centavos).toBe(164700);
    expect(res.totais.desconto_centavos).toBe(18300);
    expect(res.totais.total_mensal_centavos).toBe(15000);

    // outro serviço obrigatório não duplica a hospedagem
    const agenda = await porNome('Sistema de agendamento');
    res = (await addItem(orc, { servico_id: agenda.id }).expect(201)).body;
    expect(res.itens.filter((i) => i.tipo_servico === 'hospedagem')).toHaveLength(1);
    expect(res.itens).toHaveLength(5);
  });

  it('mudar a quantidade da placa recalcula o preço; valor explícito vence', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Redonda', preco_venda_centavos: 8000, itens: [] }).expect(201)).body;
    const orc = await novoOrcamento();
    const placa = await porTipo('placa');
    let res = (await addItem(orc, { servico_id: placa.id, placa_modelo_id: modelo.id }).expect(201)).body;
    const itemId = res.itens[0].id;
    res = (await ctx.http.put(`/api/orcamentos/${orc.id}/itens/${itemId}`).send({ quantidade: 5 }).expect(200)).body;
    expect(res.itens[0]).toMatchObject({ quantidade: 5, valor_unico_centavos: 40000 });
    res = (await ctx.http.put(`/api/orcamentos/${orc.id}/itens/${itemId}`).send({ quantidade: 6, valor_unico_centavos: 1234 }).expect(200)).body;
    expect(res.itens[0]).toMatchObject({ quantidade: 6, valor_unico_centavos: 1234 });
  });

  it('landing page sugere hospedagem sem adicionar', async () => {
    const orc = await novoOrcamento();
    const landing = await porNome('Landing page');
    const res = (await addItem(orc, { servico_id: landing.id }).expect(201)).body;
    expect(res.sugerir_hospedagem).toBe(true);
    expect(res.itens).toHaveLength(1);
    const hosp = await porTipo('hospedagem');
    const depois = (await addItem(orc, { servico_id: hosp.id }).expect(201)).body;
    expect(depois.sugerir_hospedagem).toBe(false);
  });

  it('editar a tabela depois não muda orçamento existente', async () => {
    const orc = await novoOrcamento();
    const landing = await porNome('Landing page');
    await addItem(orc, { servico_id: landing.id }).expect(201);
    await ctx.http.put(`/api/tabela-precos/servicos/${landing.id}`).send({ valor_unico_centavos: 70000, nome: 'Landing nova' }).expect(200);
    const res = (await ctx.http.get(`/api/orcamentos/${orc.id}`).expect(200)).body;
    expect(res.itens[0]).toMatchObject({ nome: 'Landing page', valor_unico_centavos: 60000 });
    expect(res.totais.total_unico_centavos).toBe(60000);
  });

  it('aplica pacote Presença Local com e sem a gestão opcional', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Quadrada', preco_venda_centavos: 9000, itens: [] }).expect(201)).body;
    definirConfig(ctx.db, 'preco_servico_google_meu_negocio_centavos', '25000');
    const pacote = (await ctx.http.get('/api/tabela-precos').expect(200)).body.pacotes[0];
    const opcional = pacote.itens.find((i) => i.opcional).id;

    const a = await novoOrcamento();
    // placa sem modelo: 400 e nada é adicionado
    await ctx.http.post(`/api/orcamentos/${a.id}/pacote`).send({ pacote_id: pacote.id }).expect(400);
    expect((await ctx.http.get(`/api/orcamentos/${a.id}`)).body.itens).toHaveLength(0);
    const sem = (await ctx.http.post(`/api/orcamentos/${a.id}/pacote`)
      .send({ pacote_id: pacote.id, placa_modelo_id: modelo.id }).expect(200)).body;
    expect(sem.titulo_pacote).toBe('Presença Local');
    expect(sem.itens).toHaveLength(2);
    expect(sem.itens[0]).toMatchObject({ nome: 'Placa NFC — Quadrada', valor_unico_centavos: 9000 });

    const b = await novoOrcamento();
    const com = (await ctx.http.post(`/api/orcamentos/${b.id}/pacote`)
      .send({ pacote_id: pacote.id, opcionais: [opcional], placa_modelo_id: modelo.id }).expect(200)).body;
    expect(com.itens).toHaveLength(3);
    expect(com.itens[2]).toMatchObject({ nome: 'Gestão do Google Meu Negócio', valor_mensal_centavos: 15000 });
    await ctx.http.post(`/api/orcamentos/${b.id}/pacote`).send({ pacote_id: 999 }).expect(404);
  });

  it('pacote com hospedagem ou com dois serviços obrigatórios traz hospedagem uma vez só', async () => {
    const cardapio = await porNome('Cardápio / catálogo digital');
    const agenda = await porNome('Sistema de agendamento');
    const hosp = await porTipo('hospedagem');
    const criar = async (nome, ids) => (await ctx.http.post('/api/tabela-precos/pacotes')
      .send({ nome, itens: ids.map((servico_id) => ({ servico_id })) }).expect(201)).body;
    const comHosp = await criar('Com hospedagem', [cardapio.id, hosp.id]);
    const doisObrig = await criar('Dois obrigatórios', [cardapio.id, agenda.id]);
    const hospedagens = (o) => o.itens.filter((i) => i.tipo_servico === 'hospedagem');

    const a = await novoOrcamento();
    let res = (await ctx.http.post(`/api/orcamentos/${a.id}/pacote`).send({ pacote_id: comHosp.id }).expect(200)).body;
    expect(hospedagens(res)).toHaveLength(1);
    expect(res.totais.total_mensal_centavos).toBe(15000);

    const b = await novoOrcamento();
    res = (await ctx.http.post(`/api/orcamentos/${b.id}/pacote`).send({ pacote_id: doisObrig.id }).expect(200)).body;
    expect(res.itens).toHaveLength(3);
    expect(hospedagens(res)).toHaveLength(1);
  });

  it('item livre conta para o combo e é validado', async () => {
    const orc = await novoOrcamento();
    await addItem(orc, { livre: true, valor_unico_centavos: 100 }).expect(400);
    await addItem(orc, { livre: true, nome: 'Logo' }).expect(400);
    await addItem(orc, { livre: true, nome: 'Logo', valor_unico_centavos: 10000, frase: 'Marca' }).expect(201);
    const res = (await addItem(orc, { livre: true, nome: 'Foto', valor_unico_centavos: 10000 }).expect(201)).body;
    expect(res.itens[0]).toMatchObject({ servico_id: null, tipo_servico: null, nome: 'Logo', frase: 'Marca' });
    expect(res.totais).toMatchObject({ servicos_combo: 2, desconto_centavos: 2000, total_unico_centavos: 18000 });
    const mensal = (await addItem(orc, { livre: true, nome: 'Suporte', valor_mensal_centavos: 5000 }).expect(201)).body;
    expect(mensal.totais.total_mensal_centavos).toBe(5000);
  });

  it('duplicar copia itens e volta para rascunho', async () => {
    const orc = await novoOrcamento();
    await addItem(orc, { livre: true, nome: 'Logo', valor_unico_centavos: 10000 }).expect(201);
    await ctx.http.put(`/api/orcamentos/${orc.id}`).send({ situacao: 'enviado', pagamento: 'Pix', titulo_pacote: 'X' }).expect(200);
    const copia = (await ctx.http.post(`/api/orcamentos/${orc.id}/duplicar`).expect(201)).body;
    expect(copia.id).not.toBe(orc.id);
    expect(copia).toMatchObject({ situacao: 'rascunho', data: '2026-10-21', pagamento: 'Pix', titulo_pacote: 'X', numero: copia.id });
    expect(copia.itens).toHaveLength(1);
    expect(copia.itens[0]).toMatchObject({ nome: 'Logo', valor_unico_centavos: 10000 });
    expect(copia.totais).toEqual((await ctx.http.get(`/api/orcamentos/${orc.id}`)).body.totais);
  });

  it('não adiciona serviço inativo e não mexe em item de outro orçamento', async () => {
    const orc = await novoOrcamento();
    const outro = await novoOrcamento();
    const landing = await porNome('Landing page');
    const item = (await addItem(outro, { servico_id: landing.id }).expect(201)).body.itens[0];
    await ctx.http.put(`/api/tabela-precos/servicos/${landing.id}`).send({ ativo: false }).expect(200);
    await addItem(orc, { servico_id: landing.id }).expect(409);
    await addItem(orc, { servico_id: 999 }).expect(404);
    await ctx.http.put(`/api/orcamentos/${orc.id}/itens/${item.id}`).send({ nome: 'x' }).expect(404);
    await ctx.http.delete(`/api/orcamentos/${orc.id}/itens/${item.id}`).expect(404);
    const ok = (await ctx.http.put(`/api/orcamentos/${outro.id}/itens/${item.id}`).send({ nome: 'Novo', quantidade: 2, valor_mensal_centavos: null }).expect(200)).body;
    expect(ok.itens[0]).toMatchObject({ nome: 'Novo', quantidade: 2 });
    await ctx.http.put(`/api/orcamentos/${outro.id}/itens/${item.id}`).send({ quantidade: 0 }).expect(400);
    const apos = (await ctx.http.delete(`/api/orcamentos/${outro.id}/itens/${item.id}`).expect(200)).body;
    expect(apos.itens).toHaveLength(0);
  });

  it('excluir o cliente apaga os orçamentos dele', async () => {
    const cliente = await novoCliente('Sem projetos');
    const orc = await novoOrcamento(cliente);
    await addItem(orc, { livre: true, nome: 'Logo', valor_unico_centavos: 100 }).expect(201);
    await ctx.http.delete(`/api/clientes/${cliente.id}`).expect(204);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM orcamentos').get().n).toBe(0);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM orcamento_itens').get().n).toBe(0);
  });
});

describe('GET /api/orcamentos/:id/pdf', () => {
  it('baixa o PDF com o nome do arquivo', async () => {
    const orc = await novoOrcamento(await novoCliente('Açaí & Cia/SP'));
    const res = await ctx.http.get(`/api/orcamentos/${orc.id}/pdf`).buffer(true).parse((r, cb) => {
      const partes = []; r.on('data', (d) => partes.push(d)); r.on('end', () => cb(null, Buffer.concat(partes)));
    }).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Orcamento-001-Acai-Cia-SP.pdf"');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    await ctx.http.get('/api/orcamentos/999/pdf').expect(404);
  });
});
