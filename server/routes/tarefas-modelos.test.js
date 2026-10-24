import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { definirConfig } from '../repos/config.js';

let ctx;
let cliente;
let site;
beforeEach(async () => {
  ctx = criarContexto({ hoje: '2026-10-21' });
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Pingou' })).body;
  site = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Sorveteria Pingou' })).body;
});

const modelos = async () => (await ctx.http.get('/api/tarefas-modelos').expect(200)).body;
const modeloSite = async () => (await modelos()).find((m) => m.nome === 'Site');
const tarefasDe = async (projetoId) => (await ctx.http.get(`/api/projetos/${projetoId}/tarefas`)).body;

describe('modelos de tarefas', () => {
  it('vêm semeados: Site com a sequência da Pingou, Google Meu Negócio e Placas NFC', async () => {
    const lista = await modelos();
    expect(lista.map((m) => [m.nome, m.tipo, m.itens.length])).toEqual([
      ['Google Meu Negócio', 'google_meu_negocio', 5],
      ['Placas NFC', 'placas_nfc', 4],
      ['Site', 'site_sistema', 7],
    ]);
    expect((await modeloSite()).itens.map((i) => i.texto)).toEqual([
      'Levantar conteúdo e fotos com o cliente', 'Criar identidade visual (cores e estilo)', 'Montar o wireframe',
      'Desenvolver o site', 'Testar no celular', 'Publicar e configurar o domínio', 'Gravar vídeo de apresentação para o Instagram',
    ]);
  });

  it('cria, renomeia, ganha itens, reordena, edita e apaga', async () => {
    const m = (await ctx.http.post('/api/tarefas-modelos').send({ nome: 'Landing', tipo: 'site_sistema' }).expect(201)).body;
    await ctx.http.post('/api/tarefas-modelos').send({ nome: 'X', tipo: 'outro' }).expect(400);
    await ctx.http.post(`/api/tarefas-modelos/${m.id}/itens`).send({ texto: 'Briefing', dias_apos_inicio: 1 }).expect(201);
    const comDois = (await ctx.http.post(`/api/tarefas-modelos/${m.id}/itens`).send({ texto: 'Publicar', descricao: 'Vercel' }).expect(201)).body;
    await ctx.http.post(`/api/tarefas-modelos/${m.id}/itens`).send({ texto: 'X', dias_apos_inicio: -1 }).expect(400);
    const [a, b] = comDois.itens;
    const reordenado = (await ctx.http.put(`/api/tarefas-modelos/${m.id}/itens/ordem`).send({ ids: [b.id, a.id] }).expect(200)).body;
    expect(reordenado.itens.map((i) => i.texto)).toEqual(['Publicar', 'Briefing']);
    const editado = (await ctx.http.put(`/api/tarefas-modelos/itens/${a.id}`).send({ texto: 'Briefing com o cliente', dias_apos_inicio: 2 }).expect(200)).body;
    expect(editado.itens.find((i) => i.id === a.id)).toMatchObject({ texto: 'Briefing com o cliente', dias_apos_inicio: 2 });
    expect((await ctx.http.put(`/api/tarefas-modelos/${m.id}`).send({ nome: 'Landing page' }).expect(200)).body.nome).toBe('Landing page');
    expect((await ctx.http.delete(`/api/tarefas-modelos/itens/${b.id}`).expect(200)).body.itens).toHaveLength(1);
    await ctx.http.delete(`/api/tarefas-modelos/${m.id}`).expect(204);
    await ctx.http.get(`/api/projetos/${site.id}/aplicar-modelo?modelo_id=${m.id}`).expect(404);
  });

  it('aplicar no projeto: prévia, prazos a partir de hoje, tipo do modelo e sem duplicar o que já existe', async () => {
    const m = await modeloSite();
    await ctx.http.post(`/api/projetos/${site.id}/tarefas`).send({ texto: '  montar O WIREFRAME ' });
    const previa = (await ctx.http.get(`/api/projetos/${site.id}/aplicar-modelo?modelo_id=${m.id}`).expect(200)).body;
    expect(previa.itens.slice(0, 3)).toEqual([
      { texto: 'Levantar conteúdo e fotos com o cliente', descricao: 'Textos, produtos, preços, logo e fotos que vão no site.', prazo: '2026-10-22', ja_existe: false },
      { texto: 'Criar identidade visual (cores e estilo)', descricao: null, prazo: '2026-10-23', ja_existe: false },
      { texto: 'Montar o wireframe', descricao: null, prazo: '2026-10-24', ja_existe: true },
    ]);

    expect((await ctx.http.post(`/api/projetos/${site.id}/aplicar-modelo`).send({ modelo_id: m.id }).expect(200)).body).toEqual({ criadas: 6, ignoradas: 1 });
    // aplicar de novo não cria nada
    expect((await ctx.http.post(`/api/projetos/${site.id}/aplicar-modelo`).send({ modelo_id: m.id }).expect(200)).body).toEqual({ criadas: 0, ignoradas: 7 });
    const lista = await tarefasDe(site.id);
    expect(lista).toHaveLength(7);
    expect(lista.find((t) => t.texto === 'Gravar vídeo de apresentação para o Instagram')).toMatchObject({
      tipo: 'site_sistema', prazo: '2026-11-04', cliente_id: cliente.id, etapa: 'a_fazer',
    });
    await ctx.http.post(`/api/projetos/${site.id}/aplicar-modelo`).send({}).expect(400);
  });

  it('projeto com início no futuro conta os prazos a partir do início', async () => {
    const futuro = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Novo', data_inicio: '2026-11-01' })).body;
    const m = await modeloSite();
    const previa = (await ctx.http.get(`/api/projetos/${futuro.id}/aplicar-modelo?modelo_id=${m.id}`)).body;
    expect(previa.itens[0].prazo).toBe('2026-11-02');
  });

  it('criar projeto ou GMN com modelo já cria as tarefas, na mesma transação', async () => {
    const m = await modeloSite();
    const novo = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Cardápio', modelo_tarefas_id: m.id }).expect(201)).body;
    expect(await tarefasDe(novo.id)).toHaveLength(7);
    const gmn = (await modelos()).find((x) => x.tipo === 'google_meu_negocio');
    const google = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', modelo_tarefas_id: gmn.id,
    }).expect(201)).body;
    expect((await tarefasDe(google.id)).map((t) => t.tipo)).toEqual(Array(5).fill('google_meu_negocio'));
    const antes = (await ctx.http.get('/api/projetos')).body.length;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'X', modelo_tarefas_id: 999 }).expect(400);
    expect((await ctx.http.get('/api/projetos')).body).toHaveLength(antes);
  });
});

describe('aceite do orçamento com modelo de tarefas', () => {
  beforeEach(() => definirConfig(ctx.db, 'preco_servico_google_meu_negocio_centavos', '25000'));
  const servico = async (nome) => (await ctx.http.get('/api/tabela-precos')).body.servicos.find((s) => s.nome === nome);
  async function orcamento() {
    const cardapio = await servico('Cardápio / catálogo digital');
    const gmn = await servico('Configuração do Google Meu Negócio');
    const orc = (await ctx.http.post(`/api/clientes/${cliente.id}/orcamentos`).expect(201)).body;
    await ctx.http.post(`/api/orcamentos/${orc.id}/itens`).send({ servico_id: cardapio.id }).expect(201);
    return (await ctx.http.post(`/api/orcamentos/${orc.id}/itens`).send({ servico_id: gmn.id }).expect(201)).body;
  }
  const item = (orc, nome) => orc.itens.find((i) => i.nome === nome).id;

  it('cria as tarefas no projeto novo e no vinculado, sem repetir, tudo na mesma transação', async () => {
    const lista = await modelos();
    const mSite = lista.find((m) => m.tipo === 'site_sistema');
    const mGmn = lista.find((m) => m.tipo === 'google_meu_negocio');
    await ctx.http.post(`/api/projetos/${site.id}/tarefas`).send({ texto: 'Montar o wireframe' });
    const orc = await orcamento();
    await ctx.http.post(`/api/orcamentos/${orc.id}/aceitar`).send({ escolhas: [
      { item_id: item(orc, 'Cardápio / catálogo digital'), destino: 'site', projeto_id: site.id, modelo_tarefas_id: mSite.id },
      { item_id: item(orc, 'Configuração do Google Meu Negócio'), destino: 'gmn', modelo_tarefas_id: mGmn.id },
    ] }).expect(200);
    expect(await tarefasDe(site.id)).toHaveLength(7);
    const gmn = ctx.db.prepare("SELECT id FROM projetos WHERE servico = 'google_meu_negocio'").get();
    expect(await tarefasDe(gmn.id)).toHaveLength(5);
  });

  it('modelo inexistente recusa o aceite inteiro', async () => {
    const orc = await orcamento();
    await ctx.http.post(`/api/orcamentos/${orc.id}/aceitar`).send({ escolhas: [
      { item_id: item(orc, 'Cardápio / catálogo digital'), destino: 'site', modelo_tarefas_id: 999 },
    ] }).expect(400);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM projetos').get().n).toBe(1);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM tarefas').get().n).toBe(0);
  });

  it('sem modelo, o aceite não cria tarefas (como antes)', async () => {
    const orc = await orcamento();
    await ctx.http.post(`/api/orcamentos/${orc.id}/aceitar`).send({ escolhas: [
      { item_id: item(orc, 'Cardápio / catálogo digital'), destino: 'site' },
    ] }).expect(200);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM tarefas').get().n).toBe(0);
  });
});

describe('cobrança que fecha sozinha', () => {
  async function venda() {
    const placa = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa' })).body;
    await ctx.http.post('/api/placas/lotes').send({ material_id: placa.id, quantidade: 10, valor_kit_centavos: 1000, data_compra: '2026-09-01' });
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Redonda', preco_venda_centavos: 8000, itens: [{ material_id: placa.id, quantidade: 1 }] })).body;
    return (await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, quantidade: 1, preco_vendido_centavos: 8000, cliente_id: cliente.id, data_venda: '2026-10-19',
    }).expect(201)).body.venda;
  }

  it('lembrete de venda de placa: título, empresa, tipo e ligação; não duplica; receber conclui com comentário', async () => {
    const v = await venda();
    const lembrete = (await ctx.http.post('/api/tarefas/lembrete-cobranca').send({ placa_venda_id: v.id }).expect(201)).body;
    expect(lembrete).toMatchObject({
      texto: 'Cobrar Pingou — R$ 80,00', tipo: 'cobranca', cliente_id: cliente.id, projeto_id: null, placa_venda_id: v.id, etapa: 'a_fazer',
    });
    const de_novo = (await ctx.http.post('/api/tarefas/lembrete-cobranca').send({ placa_venda_id: v.id }).expect(200)).body;
    expect([de_novo.id, de_novo.ja_existia]).toEqual([lembrete.id, true]);

    await ctx.http.post(`/api/placas/vendas/${v.id}/recebimento`).expect(200);
    const feita = (await ctx.http.get(`/api/tarefas/${lembrete.id}`)).body;
    expect([feita.etapa, feita.concluida, feita.concluida_em]).toEqual(['concluido', 1, '2026-10-21']);
    expect(feita.comentarios.map((c) => c.texto)).toEqual(['Concluída ao registrar o recebimento em 21/10.']);

    // desfazer o recebimento não reabre: só comenta
    await ctx.http.delete(`/api/placas/vendas/${v.id}/recebimento`).expect(200);
    const depois = (await ctx.http.get(`/api/tarefas/${lembrete.id}`)).body;
    expect(depois.etapa).toBe('concluido');
    expect(depois.comentarios.at(-1).texto).toMatch(/^Recebimento desfeito em 21\/10/);
    await ctx.http.post('/api/tarefas/lembrete-cobranca').send({ placa_venda_id: 999 }).expect(404);
  });

  it('parcela paga conclui as tarefas ligadas (também pela mensalidade); lembrete de parcela vai para o projeto', async () => {
    const parcela = (await ctx.http.post(`/api/projetos/${site.id}/parcelas`).send({ valor_centavos: 50000, vencimento: '2026-10-30', descricao: 'Entrada' })).body;
    const lembrete = (await ctx.http.post('/api/tarefas/lembrete-cobranca').send({ parcela_id: parcela.id }).expect(201)).body;
    expect(lembrete).toMatchObject({ texto: 'Cobrar Pingou — R$ 500,00', projeto_id: site.id, parcela_id: parcela.id, prazo: '2026-10-30', tipo: 'cobranca' });
    // outra tarefa ligada à mão, já no Aguardando cliente
    const manual = (await ctx.http.post('/api/tarefas').send({ texto: 'Lembrar da entrada', cliente_id: cliente.id, etapa: 'aguardando_cliente' })).body;
    await ctx.http.put(`/api/tarefas/${manual.id}`).send({ parcela_id: parcela.id }).expect(200);

    // mudar só o valor não conclui
    await ctx.http.put(`/api/parcelas/${parcela.id}`).send({ valor_centavos: 40000 }).expect(200);
    expect((await ctx.http.get(`/api/tarefas/${lembrete.id}`)).body.etapa).toBe('a_fazer');
    await ctx.http.put(`/api/parcelas/${parcela.id}`).send({ pago_em: '2026-10-21' }).expect(200);
    for (const id of [lembrete.id, manual.id]) expect((await ctx.http.get(`/api/tarefas/${id}`)).body.etapa).toBe('concluido');
    await ctx.http.post('/api/tarefas/lembrete-cobranca').send({ parcela_id: parcela.id }).expect(400);
    await ctx.http.post('/api/tarefas/lembrete-cobranca').send({}).expect(400);
  });

  it('ligar a um dinheiro só; o seletor "Ligada a" traz as parcelas abertas e as vendas a receber da empresa', async () => {
    const v = await venda();
    const parcela = (await ctx.http.post(`/api/projetos/${site.id}/parcelas`).send({ valor_centavos: 50000, vencimento: '2026-10-30' })).body;
    await ctx.http.post(`/api/projetos/${site.id}/parcelas`).send({ valor_centavos: 100, vencimento: '2026-10-01', pago_em: '2026-10-01' });
    const t = (await ctx.http.post('/api/tarefas').send({ texto: 'Cobrar', cliente_id: cliente.id, tipo: 'cobranca' })).body;
    const opcoes = (await ctx.http.get(`/api/tarefas/${t.id}/cobrancas`).expect(200)).body;
    expect(opcoes.map((o) => [o.tipo, o.id])).toEqual([['parcela', parcela.id], ['placa_venda', v.id]]);
    expect(opcoes[0].rotulo).toBe('Sorveteria Pingou · Parcela · R$ 500,00 · vence 30/10/2026');

    const ligada = (await ctx.http.put(`/api/tarefas/${t.id}`).send({ parcela_id: parcela.id }).expect(200)).body;
    expect([ligada.parcela_id, ligada.placa_venda_id]).toEqual([parcela.id, null]);
    const trocada = (await ctx.http.put(`/api/tarefas/${t.id}`).send({ placa_venda_id: v.id }).expect(200)).body;
    expect([trocada.parcela_id, trocada.placa_venda_id]).toEqual([null, v.id]);
    await ctx.http.put(`/api/tarefas/${t.id}`).send({ parcela_id: 999 }).expect(400);
    // apagar a venda só solta a tarefa
    await ctx.http.delete(`/api/placas/vendas/${v.id}`).expect(204);
    expect((await ctx.http.get(`/api/tarefas/${t.id}`)).body.placa_venda_id).toBeNull();
  });
});
