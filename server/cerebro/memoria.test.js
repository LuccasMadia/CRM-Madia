import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { montarMemoria } from './memoria.js';

const ids = (mem, area) => mem.areas.find((a) => a.id === area).pontos.map((p) => p.id);

async function base(ctx) {
  const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
  const novo = async (dados) => (await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, ...dados }).expect(201)).body;
  return { ana, novo };
}

describe('montarMemoria', () => {
  it('traz as 6 áreas na ordem, mesmo vazias', () => {
    const ctx = criarContexto();
    expect(montarMemoria(ctx.db, '2026-09-23').areas.map((a) => a.id))
      .toEqual(['clientes', 'comercial', 'projetos', 'processos', 'administrativo', 'conteudo']);
  });

  it('separa teste (comercial) de prototipo (projetos), sem id repetido, sem fictício nem perdido', async () => {
    const ctx = criarContexto();
    const { ana, novo } = await base(ctx);
    const t = await novo({ titulo: 'Em teste', etapa: 'teste' });
    const p = await novo({ titulo: 'Protótipo', etapa: 'prototipo' });
    await novo({ titulo: 'Case', etapa: 'andamento', ficticio: true });
    await novo({ titulo: 'Perdido', etapa: 'perdido' });
    await ctx.http.post(`/api/projetos/${p.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-12-10' });
    const mem = montarMemoria(ctx.db, '2026-09-23');
    expect(ids(mem, 'comercial')).toContain(`projeto:${t.id}`);
    expect(ids(mem, 'projetos')).not.toContain(`projeto:${t.id}`);
    expect(ids(mem, 'projetos')).toEqual([`projeto:${p.id}`]);
    expect(ids(mem, 'clientes')).toEqual([`cliente:${ana.id}`]);
    const todos = mem.areas.flatMap((a) => a.pontos.map((x) => x.id));
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos.some((i) => i.startsWith('parcela:'))).toBe(true);
    expect(JSON.stringify(mem)).not.toMatch(/Case/);
  });

  it('tarefa vencida vira destaque com link do projeto', async () => {
    const ctx = criarContexto();
    const { novo } = await base(ctx);
    const p = await novo({ titulo: 'Site', etapa: 'andamento' });
    await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Vencida', prazo: '2026-09-20' });
    await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Em dia', prazo: '2026-09-30' });
    const pontos = montarMemoria(ctx.db, '2026-09-23').areas.find((a) => a.id === 'processos').pontos;
    expect(pontos.find((x) => x.rotulo === 'Vencida')).toMatchObject({ destaque: true, link: `/projetos/${p.id}` });
    expect(pontos.find((x) => x.rotulo === 'Em dia').destaque).toBe(false);
  });

  it('cada ponto diz com o que está ligado: projeto→cliente, tarefa e parcela→projeto', async () => {
    const ctx = criarContexto();
    const { ana, novo } = await base(ctx);
    const p = await novo({ titulo: 'Site', etapa: 'andamento' });
    await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Revisar' });
    await ctx.http.post(`/api/projetos/${p.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-12-10' });
    const pontos = montarMemoria(ctx.db, '2026-09-23').areas.flatMap((a) => a.pontos);
    const ligacoes = (prefixo) => pontos.find((x) => x.id.startsWith(prefixo)).ligacoes;
    expect(ligacoes('projeto:')).toEqual([`cliente:${ana.id}`]);
    expect(ligacoes('tarefa:')).toEqual([`projeto:${p.id}`]);
    expect(ligacoes('parcela:')).toEqual([`projeto:${p.id}`]);
    expect(pontos.every((x) => Array.isArray(x.ligacoes))).toBe(true);
  });

  it('todo ponto tem tipo, vivo e texto null', async () => {
    const ctx = criarContexto();
    const { novo } = await base(ctx);
    const p = await novo({ titulo: 'Site', etapa: 'andamento' });
    await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Revisar' });
    const pontos = montarMemoria(ctx.db, '2026-09-23').areas.flatMap((a) => a.pontos);
    expect(pontos.length).toBeGreaterThan(2);
    expect(pontos.every((x) => typeof x.tipo === 'string' && typeof x.vivo === 'boolean' && x.texto === null)).toBe(true);
  });

  it('tarefa concluída e parcela paga entram como histórico apagado e sem destaque', async () => {
    const ctx = criarContexto();
    const { novo } = await base(ctx);
    const p = await novo({ titulo: 'Site', etapa: 'andamento' });
    const t = (await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Feita', prazo: '2026-09-01' })).body;
    const pa = (await ctx.http.post(`/api/projetos/${p.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-09-05' })).body;
    ctx.db.prepare('UPDATE tarefas SET concluida = 1 WHERE id = ?').run(t.id);
    ctx.db.prepare("UPDATE parcelas SET pago_em = '2026-09-06' WHERE id = ?").run(pa.id);
    const pontos = montarMemoria(ctx.db, '2026-09-23').areas.flatMap((a) => a.pontos);
    expect(pontos.find((x) => x.id === `tarefa:${t.id}`)).toMatchObject({ vivo: false, destaque: false, tipo: 'tarefa' });
    expect(pontos.find((x) => x.id === `parcela:${pa.id}`)).toMatchObject({ vivo: false, destaque: false, tipo: 'parcela' });
  });

  it('projeto perdido entra em comercial como histórico; fictício não entra em lugar nenhum', async () => {
    const ctx = criarContexto();
    const { novo } = await base(ctx);
    const perdido = await novo({ titulo: 'Perdido', etapa: 'perdido', prazo_entrega: '2026-09-01' });
    await novo({ titulo: 'Fake', etapa: 'perdido', ficticio: true });
    const mem = montarMemoria(ctx.db, '2026-09-23');
    expect(mem.areas.find((a) => a.id === 'comercial').pontos.find((x) => x.id === `projeto:${perdido.id}`))
      .toMatchObject({ vivo: false, destaque: false, tipo: 'projeto' });
    expect(JSON.stringify(mem)).not.toContain('Fake');
  });

  it('entregue antigo vai para projetos como histórico', async () => {
    const ctx = criarContexto();
    const { novo } = await base(ctx);
    const p = await novo({ titulo: 'Velho', etapa: 'entregue', data_entrega: '2026-07-20' });
    const ponto = montarMemoria(ctx.db, '2026-09-23').areas.find((a) => a.id === 'projetos').pontos.find((x) => x.id === `projeto:${p.id}`);
    expect(ponto).toMatchObject({ vivo: false, destaque: false });
  });

  it('post do Instagram sem conteúdo vira ponto; com conteúdo ligado ou removido, não', async () => {
    const ctx = criarContexto();
    const ins = ctx.db.prepare(
      "INSERT INTO instagram_midias (id, tipo, legenda, publicado_em, removido, atualizado_em) VALUES (?, 'post', ?, '2026-09-10T12:00:00+0000', ?, '2026-09-10')",
    );
    ins.run('m1', 'Livre', 0);
    ins.run('m2', 'Ligado', 0);
    ins.run('m3', 'Removido', 1);
    ctx.db.prepare("INSERT INTO conteudos (tipo, titulo, midia_id, criado_em, atualizado_em) VALUES ('post', 'Rascunho', 'm2', '2026-09-01', '2026-09-01')").run();
    const pontos = montarMemoria(ctx.db, '2026-09-23').areas.find((a) => a.id === 'conteudo').pontos;
    const insta = pontos.filter((x) => x.tipo === 'instagram');
    expect(insta).toHaveLength(1);
    expect(insta[0]).toMatchObject({
      id: 'instagram:m1', rotulo: 'Livre', vivo: false, destaque: false, link: '/conteudo',
      ligacoes: ['app:instagram'], resumo: 'post publicado em 10/09/2026',
    });
  });

  it('tarefa solta com cliente liga ao cliente', async () => {
    const ctx = criarContexto();
    const { ana } = await base(ctx);
    ctx.db.prepare("INSERT INTO tarefas (texto, cliente_id, criado_em, atualizado_em) VALUES ('Ligar', ?, '2026-09-01', '2026-09-01')").run(ana.id);
    const t = montarMemoria(ctx.db, '2026-09-23').areas.find((a) => a.id === 'processos').pontos.find((x) => x.rotulo === 'Ligar');
    expect(t.ligacoes).toEqual([`cliente:${ana.id}`]);
  });

  it('vivos vêm antes do histórico em cada área', async () => {
    const ctx = criarContexto();
    const { novo } = await base(ctx);
    const p = await novo({ titulo: 'Site', etapa: 'andamento' });
    const velha = (await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Velha' })).body;
    await ctx.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'Nova' });
    ctx.db.prepare('UPDATE tarefas SET concluida = 1 WHERE id = ?').run(velha.id);
    const pontos = montarMemoria(ctx.db, '2026-09-23').areas.find((a) => a.id === 'processos').pontos;
    expect(pontos.map((x) => x.vivo)).toEqual([true, false]);
  });
});
