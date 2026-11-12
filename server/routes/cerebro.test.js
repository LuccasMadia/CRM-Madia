import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { SERVICOS_ORDEM } from '../domain/cerebro.js';

async function cliente(ctx, nome = 'Ana') {
  return (await ctx.http.post('/api/clientes').send({ nome })).body;
}
async function projeto(ctx, dados) {
  return (await ctx.http.post('/api/projetos').send(dados).expect(201)).body;
}
const relatorio = async (ctx) => (await ctx.http.get('/api/cerebro/projetos').expect(200)).body;
const secao = (rel, servico) => rel.servicos.find((s) => s.servico === servico);

describe('GET /api/cerebro/projetos', () => {
  it('banco vazio devolve os três serviços com listas vazias', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const rel = await relatorio(ctx);
    expect(rel.gerado_em).toBe('2026-09-23');
    expect(rel.servicos.map((s) => s.servico)).toEqual(SERVICOS_ORDEM);
    for (const s of rel.servicos) {
      expect(s.nao_entregues).toEqual([]);
      expect(s.entregues).toEqual([]);
    }
    expect(rel.numeros.a_receber_centavos).toBe(0);
  });

  it('separa não entregues por serviço e ordena pelo funil', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    await projeto(ctx, { cliente_id: ana.id, titulo: 'Em andamento', etapa: 'andamento' });
    await projeto(ctx, { cliente_id: ana.id, titulo: 'Ideia', etapa: 'ideia' });
    await projeto(ctx, { cliente_id: ana.id, titulo: 'GMN', servico: 'google_meu_negocio' });
    const rel = await relatorio(ctx);
    expect(secao(rel, 'site_sistema').nao_entregues.map((f) => f.etapa)).toEqual(['ideia', 'andamento']);
    expect(secao(rel, 'google_meu_negocio').nao_entregues).toHaveLength(1);
  });

  it('deixa de fora fictícios e perdidos', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    await projeto(ctx, { cliente_id: ana.id, titulo: 'Real', etapa: 'andamento' });
    await projeto(ctx, { cliente_id: ana.id, titulo: 'Case', etapa: 'andamento', ficticio: true });
    await projeto(ctx, { cliente_id: ana.id, titulo: 'Perdido', etapa: 'perdido' });
    const rel = await relatorio(ctx);
    expect(secao(rel, 'site_sistema').nao_entregues.map((f) => f.titulo)).toEqual(['Real']);
  });

  it('entregue antigo sem pendência fica de fora; com parcela aberta entra', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    const recente = await projeto(ctx, { cliente_id: ana.id, titulo: 'Recente', etapa: 'entregue', data_entrega: '2026-09-01' });
    await projeto(ctx, { cliente_id: ana.id, titulo: 'Antigo', etapa: 'entregue', data_entrega: '2026-06-01' });
    const comParcela = await projeto(ctx, { cliente_id: ana.id, titulo: 'Antigo com parcela', etapa: 'entregue', data_entrega: '2026-06-01' });
    await ctx.http.post(`/api/projetos/${comParcela.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-12-10' });
    const rel = await relatorio(ctx);
    expect(secao(rel, 'site_sistema').entregues.map((f) => f.titulo).sort()).toEqual(['Antigo com parcela', 'Recente']);
    expect(secao(rel, 'site_sistema').entregues.find((f) => f.projeto_id === recente.id).data_entrega).toBe('2026-09-01');
  });

  it('projeto com prazo passado aparece em pede_acao.projetos_atrasados', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    const atrasado = await projeto(ctx, { cliente_id: ana.id, titulo: 'Atrasado', etapa: 'andamento', prazo_entrega: '2026-09-10' });
    await projeto(ctx, { cliente_id: ana.id, titulo: 'No prazo', etapa: 'andamento', prazo_entrega: '2026-09-30' });
    const rel = await relatorio(ctx);
    expect(rel.pede_acao.projetos_atrasados).toEqual([
      { projeto_id: atrasado.id, titulo: 'Atrasado', cliente_nome: 'Ana', servico: 'site_sistema', prazo_entrega: '2026-09-10' },
    ]);
    expect(secao(rel, 'site_sistema').nao_entregues.find((f) => f.projeto_id === atrasado.id).atrasado).toBe(true);
  });

  it('tarefa sem prazo não vence', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    const p = await projeto(ctx, { cliente_id: ana.id, titulo: 'Site', etapa: 'andamento' });
    await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Sem prazo' });
    await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Vencida', prazo: '2026-09-20' });
    const rel = await relatorio(ctx);
    expect(rel.pede_acao.tarefas_vencidas.map((t) => t.texto)).toEqual(['Vencida']);
    expect(secao(rel, 'site_sistema').nao_entregues[0].tarefas).toMatchObject({ feitas: 0, total: 2 });
  });

  it('parcelas atrasadas batem com o painel', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    const p = await projeto(ctx, { cliente_id: ana.id, titulo: 'Site', etapa: 'andamento', prazo_entrega: '2026-09-28' });
    await ctx.http.post(`/api/projetos/${p.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-09-10' });
    await ctx.http.post(`/api/projetos/${p.id}/parcelas`).send({ valor_centavos: 2000, vencimento: '2026-09-30' });
    const painel = (await ctx.http.get('/api/painel').expect(200)).body.cartoes.atrasadas;
    const rel = await relatorio(ctx);
    expect(painel).toEqual({ quantidade: 1, total_centavos: 1000 });
    expect(rel.pede_acao.parcelas_atrasadas).toMatchObject(painel);
    expect(rel.pede_acao.parcelas_atrasadas.itens).toEqual([
      { projeto_id: p.id, titulo: 'Site', cliente_nome: 'Ana', valor_centavos: 1000, vencimento: '2026-09-10' },
    ]);
    expect(rel.numeros).toMatchObject({ a_receber_centavos: 3000, vencido_centavos: 1000 });
  });

  it('site fora do ar aparece em pede_acao', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    const p = await projeto(ctx, { cliente_id: ana.id, titulo: 'Site', etapa: 'entregue', data_entrega: '2026-09-01' });
    ctx.db.prepare(
      `INSERT INTO hospedagens (projeto_id, tipo, url, status, status_desde, atualizado_em)
       VALUES (?, 'vercel', 'https://ana.example', 'fora_do_ar', '2026-09-22', '2026-09-22')`,
    ).run(p.id);
    const rel = await relatorio(ctx);
    expect(rel.pede_acao.sites_fora_do_ar).toEqual([
      { projeto_id: p.id, titulo: 'Site', url: 'https://ana.example', status_desde: '2026-09-22' },
    ]);
  });
});
