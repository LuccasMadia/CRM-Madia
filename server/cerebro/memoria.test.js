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
    expect(JSON.stringify(mem)).not.toMatch(/Case|Perdido/);
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
});
