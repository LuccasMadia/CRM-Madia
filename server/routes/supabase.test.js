import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { githubFalso } from '../test/githubFalso.js';

const URL = 'https://api.supabase.com/v1/projects';
const REF = 'abcdefghijklmnopqrst';
const bruto = (ref, status, extra = {}) => ({ id: ref, name: `Projeto ${ref.slice(0, 3)}`, region: 'sa-east-1', status, created_at: '2026-01-01T00:00:00Z', ...extra });

let ctx;
let falso;
let cliente;
async function montar(rotas = {}) {
  falso = githubFalso({ [URL]: [bruto(REF, 'ACTIVE_HEALTHY')], ...rotas });
  ctx = criarContexto({ fetch: falso.fetch });
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
}
const conectar = () => ctx.http.put('/api/supabase/conexao').send({ token: 'sbp_segredo' }).expect(200);
const novoProjeto = async (dados = {}) => (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Sistema Ana', ...dados }).expect(201)).body;
const leituras = () => falso.requisicoes.filter((r) => r.url.pathname === '/v1/projects').length;

beforeEach(() => montar());

describe('conexão com o Supabase', () => {
  it('conecta, guarda o token sem devolvê-lo e desconecta', async () => {
    expect((await ctx.http.get('/api/supabase').expect(200)).body).toEqual({ conectado: false });
    expect((await conectar()).body).toEqual({ conectado: true });
    expect(JSON.stringify((await ctx.http.get('/api/supabase')).body)).not.toContain('sbp_segredo');
    expect((await ctx.http.delete('/api/supabase/conexao').expect(200)).body).toEqual({ conectado: false });
  });

  it('token inválido é recusado no campo token e nada é guardado', async () => {
    await montar({ [URL]: { status: 401, corpo: {} } });
    const res = await ctx.http.put('/api/supabase/conexao').send({ token: 'ruim' }).expect(400);
    expect(res.body.erros[0].campo).toBe('token');
    expect((await ctx.http.get('/api/supabase')).body.conectado).toBe(false);
  });
});

describe('lista de projetos', () => {
  it('sem token devolve 409', async () => {
    const res = await ctx.http.get('/api/supabase/projetos').expect(409);
    expect(res.body.erro).toBe('Conecte o Supabase em Configurações.');
  });

  it('devolve 30 projetos; a segunda leitura usa o cache e atualizar=1 não', async () => {
    const muitos = Array.from({ length: 30 }, (_, i) => bruto(`p${String(i).padStart(19, '0')}`, 'ACTIVE_HEALTHY'));
    await montar({ [URL]: muitos });
    await conectar();
    const lista = (await ctx.http.get('/api/supabase/projetos').expect(200)).body;
    expect(lista).toHaveLength(30);
    expect(lista[0]).toMatchObject({ estado: 'no_ar', regiao: 'sa-east-1' });
    const depois = leituras();
    await ctx.http.get('/api/supabase/projetos').expect(200);
    expect(leituras()).toBe(depois);
    await ctx.http.get('/api/supabase/projetos?atualizar=1').expect(200);
    expect(leituras()).toBe(depois + 1);
  });
});

describe('GET /projetos/:id/supabase', () => {
  it('sem token 409; projeto inexistente 404; sem ref encontrado:false', async () => {
    const p = await novoProjeto({ supabase_ref: REF });
    await ctx.http.get(`/api/projetos/${p.id}/supabase`).expect(409);
    await conectar();
    await ctx.http.get('/api/projetos/9999/supabase').expect(404);
    const q = await novoProjeto({ titulo: 'Sem ref' });
    expect((await ctx.http.get(`/api/projetos/${q.id}/supabase`).expect(200)).body).toEqual({ encontrado: false });
  });

  it('devolve nome, região, estado e link; ref que sumiu da conta vira encontrado:false', async () => {
    await montar({ [URL]: [bruto(REF, 'INACTIVE')] });
    await conectar();
    const p = await novoProjeto({ supabase_ref: REF });
    expect((await ctx.http.get(`/api/projetos/${p.id}/supabase`).expect(200)).body).toEqual({
      encontrado: true, nome: 'Projeto abc', regiao: 'sa-east-1', estado: 'pausado', link: `https://supabase.com/dashboard/project/${REF}`,
    });
    await montar({ [URL]: [] });
    await conectar();
    const q = await novoProjeto({ supabase_ref: REF });
    expect((await ctx.http.get(`/api/projetos/${q.id}/supabase`).expect(200)).body).toEqual({ encontrado: false });
  });

  it('token revogado vira 502 com a mensagem', async () => {
    await conectar();
    const p = await novoProjeto({ supabase_ref: REF });
    await montar({ [URL]: { status: 403, corpo: {} } });
    ctx.db.prepare("INSERT INTO config (chave, valor) VALUES ('supabase_token', 'x')").run();
    const q = await novoProjeto({ supabase_ref: REF });
    const res = await ctx.http.get(`/api/projetos/${q.id}/supabase`).expect(502);
    expect(res.body.erro).toMatch(/Token do Supabase inválido/);
    expect(p.id).toBeGreaterThan(0);
  });
});

describe('GET /supabase/atencao', () => {
  it('projeto real pausado vira atenção; entregue pausado vira o código de perigo', async () => {
    await montar({ [URL]: [bruto(REF, 'INACTIVE'), bruto('zzzzzzzzzzzzzzzzzzzz', 'INACTIVE')] });
    await conectar();
    await novoProjeto({ titulo: 'Sistema Ana', supabase_ref: REF });
    await novoProjeto({ titulo: 'Loja Bia', supabase_ref: 'zzzzzzzzzzzzzzzzzzzz', etapa: 'entregue' });
    const { alertas } = (await ctx.http.get('/api/supabase/atencao').expect(200)).body;
    expect(alertas).toHaveLength(2);
    expect(alertas.find((a) => a.codigo === 'supabase_pausado')).toMatchObject({ texto: 'Sistema Ana está pausado no Supabase' });
    expect(alertas.find((a) => a.codigo === 'supabase_pausado_entregue')).toMatchObject({ texto: 'Loja Bia já foi entregue e o Supabase está pausado' });
  });

  it('fictício, perdido e projeto no ar não alertam', async () => {
    await montar({ [URL]: [bruto(REF, 'INACTIVE'), bruto('zzzzzzzzzzzzzzzzzzzz', 'INACTIVE'), bruto('yyyyyyyyyyyyyyyyyyyy', 'ACTIVE_HEALTHY')] });
    await conectar();
    await novoProjeto({ titulo: 'Fictício', ficticio: 1, supabase_ref: REF });
    await novoProjeto({ titulo: 'Perdido', etapa: 'perdido', supabase_ref: 'zzzzzzzzzzzzzzzzzzzz' });
    await novoProjeto({ titulo: 'No ar', supabase_ref: 'yyyyyyyyyyyyyyyyyyyy' });
    expect((await ctx.http.get('/api/supabase/atencao').expect(200)).body).toEqual({ alertas: [] });
  });

  it('sem conexão ou com o Supabase fora do ar devolve alertas vazios, nunca erro', async () => {
    expect((await ctx.http.get('/api/supabase/atencao').expect(200)).body).toEqual({ alertas: [] });
    await montar({ [URL]: { status: 500, corpo: {} } });
    ctx.db.prepare("INSERT INTO config (chave, valor) VALUES ('supabase_token', 'x')").run();
    expect((await ctx.http.get('/api/supabase/atencao').expect(200)).body).toEqual({ alertas: [] });
  });
});
