import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { definirConfig } from '../repos/config.js';
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

describe('GET /api/cerebro', () => {
  const pastaCerebro = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cerebro-rota-'));
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# Madia');
    writeFileSync(path.join(dir, 'apps.json'), JSON.stringify([
      { id: 'vercel', nome: 'Vercel', para_que: 'Hospedagem', conexao: 'crm:vercel_token' },
      { id: 'figma', nome: 'Figma', para_que: 'Telas', conexao: 'manual' },
    ]));
    return dir;
  };

  it('traz 7 áreas, a última é Arquivos com o relatório da pasta', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const dir = pastaCerebro();
    mkdirSync(path.join(dir, 'relatorios'));
    const arq = path.join(dir, 'relatorios', 'semana-1.md');
    writeFileSync(arq, '# Semana');
    utimesSync(arq, new Date(2026, 8, 5, 12), new Date(2026, 8, 5, 12));
    definirConfig(ctx.db, 'cerebro_path', dir);
    const { areas } = (await ctx.http.get('/api/cerebro').expect(200)).body.memoria;
    expect(areas).toHaveLength(7);
    expect(areas[6]).toEqual({
      id: 'arquivos',
      rotulo: 'Arquivos',
      pontos: [{
        id: 'arquivo:relatorios/semana-1.md', tipo: 'arquivo', rotulo: 'semana-1', destaque: false, vivo: true, link: null, ligacoes: [],
        resumo: 'Relatório · modificado em 05/09/2026', texto: '# Semana',
      }],
    });
  });

  it('sem cerebro_path devolve centro nulo, 7 áreas e nenhum app', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const res = (await ctx.http.get('/api/cerebro').expect(200)).body;
    expect(res.centro).toBeNull();
    expect(res.memoria.areas).toHaveLength(7);
    expect(res.memoria.areas[6].pontos).toEqual([]);
    expect(res.apps).toEqual([]);
    expect(res.pede_atencao).toEqual([]);
  });

  it('cerebro_path vazio conta como não configurado', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    definirConfig(ctx.db, 'cerebro_path', '');
    expect((await ctx.http.get('/api/cerebro').expect(200)).body.centro).toBeNull();
  });

  it('marca como conectado só o app com chave no CRM', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    definirConfig(ctx.db, 'cerebro_path', pastaCerebro());
    definirConfig(ctx.db, 'vercel_token', 'tok');
    const res = (await ctx.http.get('/api/cerebro').expect(200)).body;
    expect(res.centro).toEqual({ texto: '# Madia' });
    expect(res.apps.find((a) => a.id === 'vercel').conectado).toBe(true);
    expect(res.apps.find((a) => a.id === 'figma').conectado).toBe(false);
  });

  it('pede_atencao usa singular/plural e o link certo', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    const a = await projeto(ctx, { cliente_id: ana.id, titulo: 'A', etapa: 'andamento', prazo_entrega: '2026-09-10' });
    let res = (await ctx.http.get('/api/cerebro').expect(200)).body;
    expect(res.pede_atencao).toEqual([{ texto: '1 projeto atrasado', tom: 'perigo', para: `/projetos/${a.id}` }]);
    await projeto(ctx, { cliente_id: ana.id, titulo: 'B', etapa: 'andamento', prazo_entrega: '2026-09-11' });
    await ctx.http.post(`/api/projetos/${a.id}/tarefas`).send({ texto: 'x', prazo: '2026-09-01' });
    await ctx.http.post(`/api/projetos/${a.id}/tarefas`).send({ texto: 'y', prazo: '2026-09-02' });
    res = (await ctx.http.get('/api/cerebro').expect(200)).body;
    expect(res.pede_atencao).toEqual([
      { texto: '2 projetos atrasados', tom: 'perigo', para: '/servicos?aba=sites' },
      { texto: '2 tarefas vencidas', tom: 'atencao', para: '/tarefas' },
    ]);
  });
});

describe('GET /api/cerebro: destaques batem com pede_atencao', () => {
  it('parcela de perdido, site fora do ar e tarefas (solta e de projeto) contam igual', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = await cliente(ctx);
    const perdido = await projeto(ctx, { cliente_id: ana.id, titulo: 'Perdido', etapa: 'perdido' });
    await ctx.http.post(`/api/projetos/${perdido.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-09-10' });
    const site = await projeto(ctx, { cliente_id: ana.id, titulo: 'Site', etapa: 'entregue', data_entrega: '2026-09-01' });
    ctx.db.prepare(
      `INSERT INTO hospedagens (projeto_id, tipo, url, status, status_desde, atualizado_em)
       VALUES (?, 'sem_hospedagem', 'https://ana.example', 'fora_do_ar', '2026-09-22', '2026-09-22')`,
    ).run(site.id);
    await ctx.http.post(`/api/projetos/${site.id}/tarefas`).send({ texto: 'Com projeto', prazo: '2026-09-01' });
    await ctx.http.post('/api/tarefas').send({ texto: 'Solta', prazo: '2026-09-02' }).expect(201);

    const res = (await ctx.http.get('/api/cerebro').expect(200)).body;
    const destaques = (prefixo) => res.memoria.areas.flatMap((a) => a.pontos).filter((p) => p.destaque && p.id.startsWith(prefixo)).length;
    const n = (texto) => Number(res.pede_atencao.find((x) => x.texto.includes(texto))?.texto.split(' ')[0] ?? 0);
    expect(n('parcela')).toBe(1);
    expect(destaques('parcela:') + destaques('venda:')).toBe(1);
    expect(n('fora do ar')).toBe(1);
    expect(destaques('hospedagem:')).toBe(1);
    expect(n('tarefa')).toBe(2);
    expect(destaques('tarefa:')).toBe(2);
    expect(n('projeto')).toBe(0);
    expect(destaques('projeto:')).toBe(0);
  });
});
