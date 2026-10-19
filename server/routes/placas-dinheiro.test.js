import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let modelo;
let cliente;
beforeEach(async () => {
  ctx = criarContexto({ hoje: '2026-10-18' });
  const placa = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa' }).expect(201)).body;
  await ctx.http.post('/api/placas/lotes').send({
    material_id: placa.id, quantidade: 50, valor_kit_centavos: 1000, data_compra: '2026-09-01',
  }).expect(201);
  modelo = (await ctx.http.post('/api/placas/modelos').send({
    nome: 'Placa 10x10', preco_venda_centavos: 8000, itens: [{ material_id: placa.id, quantidade: 1 }],
  }).expect(201)).body;
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Rango do Bicho' }).expect(201)).body;
});

const vender = (data_venda, extra = {}) => ctx.http.post('/api/placas/vendas').send({
  modelo_id: modelo.id, quantidade: 1, preco_vendido_centavos: 8000, cliente_id: cliente.id, data_venda, ...extra,
}).expect(201);

async function vendaDeProjeto() {
  const projeto = (await ctx.http.post('/api/projetos').send({
    servico: 'placas_nfc', titulo: 'Placas NFC', cliente_id: cliente.id, vencimento: '2026-11-30',
    servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 5000 }],
  }).expect(201)).body;
  await ctx.http.put(`/api/projetos/${projeto.id}`).send({ etapa: 'entregue' }).expect(200);
}

describe('vendas de placa no Início', () => {
  it('venda aberta do mês entra no a receber; com mais de 7 dias, nas atrasadas', async () => {
    await vender('2026-10-15');
    await vender('2026-10-02');
    await vender('2026-10-16', { recebido: true });
    const { body } = await ctx.http.get('/api/painel').expect(200);
    expect(body.cartoes.a_receber_mes_centavos).toBe(16000);
    expect(body.cartoes.atrasadas).toEqual({ quantidade: 1, total_centavos: 8000 });
    expect(body.para_entregar.placas).toBe(2);
  });

  it('venda recebida entra nos gráficos de recebido e na fatia de placas', async () => {
    const { body: { venda } } = await vender('2026-09-10');
    await ctx.http.post(`/api/placas/vendas/${venda.id}/recebimento`).expect(200);
    const { body } = await ctx.http.get('/api/painel/graficos').expect(200);
    expect(body.recebido_por_mes.find((m) => m.mes === '2026-10').total_centavos).toBe(8000);
    expect(body.por_servico.find((s) => s.servico === 'placas_nfc').total_centavos).toBe(8000);
  });

  it('venda gerada por projeto fica fora de todo dinheiro', async () => {
    await vendaDeProjeto();
    const painel = (await ctx.http.get('/api/painel')).body;
    expect(painel.cartoes.a_receber_mes_centavos).toBe(0);
    expect(painel.cartoes.atrasadas.quantidade).toBe(0);
    expect(painel.para_entregar.placas).toBe(0);
    const graficos = (await ctx.http.get('/api/painel/graficos')).body;
    expect(graficos.por_servico.find((s) => s.servico === 'placas_nfc').total_centavos).toBe(0);
    const parcelas = (await ctx.http.get('/api/parcelas?servico=placas_nfc')).body;
    expect(parcelas.filter((p) => p.tipo === 'venda_placa')).toEqual([]);
    const mensal = (await ctx.http.get('/api/financeiro/mensal?ano=2026')).body;
    expect(mensal.find((m) => m.mes === '2026-10').recebido_centavos).toBe(0);
  });
});

describe('vendas de placa no Financeiro', () => {
  it('/parcelas traz a venda como linha, com os mesmos filtros', async () => {
    await vender('2026-10-15', { quantidade: 2 });
    const { body } = await ctx.http.get('/api/parcelas?servico=placas_nfc&estado=pendente&mes=2026-10').expect(200);
    expect(body).toEqual([expect.objectContaining({
      tipo: 'venda_placa', valor_centavos: 16000, vencimento: '2026-10-15', pago_em: null, estado: 'pendente',
      servico: 'placas_nfc', cliente_id: cliente.id, cliente_nome: 'Rango do Bicho',
      projeto_titulo: 'Placa 10x10 × 2', descricao: 'Venda de placas',
    })]);
    expect((await ctx.http.get('/api/parcelas?estado=atrasada')).body).toEqual([]);
  });

  it('parcelas comuns ganham tipo "parcela"', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201)).body;
    await ctx.http.post(`/api/projetos/${projeto.id}/parcelas`).send({ valor_centavos: 50000, vencimento: '2026-10-25' }).expect(201);
    await vender('2026-10-15');
    const { body } = await ctx.http.get('/api/parcelas').expect(200);
    expect(body.map((p) => p.tipo)).toEqual(['venda_placa', 'parcela']);
  });

  it('comprador avulso aparece pelo nome', async () => {
    await vender('2026-10-15', { cliente_id: null, comprador_nome: 'Fulano' });
    const [linha] = (await ctx.http.get('/api/parcelas').expect(200)).body;
    expect(linha).toMatchObject({ cliente_id: null, cliente_nome: 'Fulano' });
  });

  it('o recebido por mês soma as vendas recebidas', async () => {
    await vender('2026-10-15', { recebido: true });
    const { body } = await ctx.http.get('/api/financeiro/mensal?ano=2026').expect(200);
    expect(body.find((m) => m.mes === '2026-10').recebido_centavos).toBe(8000);
  });
});

describe('/api/servicos/resumo', () => {
  it('soma o a receber de cada serviço e as montadas de placas', async () => {
    await vender('2026-10-15');
    await ctx.http.post('/api/placas/montagens').send({ modelo_id: modelo.id, quantidade: 3, data_montagem: '2026-10-10' }).expect(201);
    const site = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201)).body;
    await ctx.http.post(`/api/projetos/${site.id}/parcelas`).send({ valor_centavos: 50000, vencimento: '2026-10-25' }).expect(201);
    await ctx.http.post(`/api/projetos/${site.id}/parcelas`).send({ valor_centavos: 10000, vencimento: '2026-09-25', pago_em: '2026-09-25' }).expect(201);
    const { body } = await ctx.http.get('/api/servicos/resumo').expect(200);
    expect(body).toEqual({
      site_sistema: { a_receber_centavos: 50000 },
      google_meu_negocio: { a_receber_centavos: 0 },
      placas_nfc: { a_receber_centavos: 8000, montadas: 3 },
    });
  });
});
