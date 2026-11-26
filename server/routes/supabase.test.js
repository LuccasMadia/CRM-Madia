import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { definirConfig } from '../repos/config.js';

const REF = 'abcdefghijklmnopqrst';
const OUTRO = 'zzzzzzzzzzzzzzzzzzzz';
const bruto = (ref, status, extra = {}) => ({ id: ref, name: `Projeto ${ref.slice(0, 3)}`, region: 'sa-east-1', status, created_at: '2026-01-01T00:00:00Z', ...extra });

// fetch falso: cada token do Supabase responde com a sua lista (ou { status }).
function supabaseFalso(porToken) {
  const requisicoes = [];
  const fetch = async (url, init = {}) => {
    const token = String(init.headers?.Authorization ?? '').replace('Bearer ', '');
    requisicoes.push({ token });
    const r = porToken[token];
    if (r === undefined) return new Response('{}', { status: 401 });
    if (!Array.isArray(r)) return new Response('{}', { status: r.status });
    return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, requisicoes, porToken };
}

let ctx;
let falso;
let cliente;
async function montar(porToken = { sbp_a: [bruto(REF, 'ACTIVE_HEALTHY')] }) {
  falso = supabaseFalso(porToken);
  ctx = criarContexto({ fetch: falso.fetch });
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
}
const adicionar = (nome, token) => ctx.http.post('/api/supabase/contas').send({ nome, token });
const conectar = async () => { await adicionar('Conta 1', 'sbp_a').expect(201); };
const novoProjeto = async (dados = {}) => (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Sistema Ana', ...dados }).expect(201)).body;
const leituras = (token) => falso.requisicoes.filter((r) => r.token === token).length;

beforeEach(() => montar());

describe('contas do Supabase', () => {
  it('adiciona contas sem devolver o token e remove', async () => {
    expect((await ctx.http.get('/api/supabase').expect(200)).body).toEqual({ conectado: false, contas: [] });
    const depois = (await adicionar('Conta 1', 'sbp_a').expect(201)).body;
    expect(depois).toEqual({ conectado: true, contas: [{ id: 1, nome: 'Conta 1' }] });
    expect(JSON.stringify((await ctx.http.get('/api/supabase')).body)).not.toContain('sbp_a');
    const remover = (await ctx.http.delete('/api/supabase/contas/1').expect(200)).body;
    expect(remover).toEqual({ conectado: false, contas: [] });
    await ctx.http.delete('/api/supabase/contas/1').expect(404);
  });

  it('nome repetido é recusado (sem diferenciar maiúsculas) e token inválido não guarda nada', async () => {
    await conectar();
    const repetido = await adicionar('conta 1', 'sbp_a').expect(400);
    expect(repetido.body.erros[0]).toMatchObject({ campo: 'nome', mensagem: 'Já existe uma conta com esse nome' });
    const ruim = await adicionar('Conta 2', 'sbp_ruim').expect(400);
    expect(ruim.body.erros[0]).toMatchObject({ campo: 'token', mensagem: 'Token inválido ou sem permissão' });
    expect((await ctx.http.get('/api/supabase')).body.contas).toHaveLength(1);
  });

  it('o token antigo (versão de uma conta só) continua conectado como Principal', async () => {
    definirConfig(ctx.db, 'supabase_token', 'sbp_a');
    expect((await ctx.http.get('/api/supabase').expect(200)).body).toEqual({ conectado: true, contas: [{ id: 1, nome: 'Principal' }] });
  });
});

describe('lista de projetos', () => {
  it('sem contas devolve 409', async () => {
    const res = await ctx.http.get('/api/supabase/projetos').expect(409);
    expect(res.body.erro).toBe('Conecte o Supabase em Configurações.');
  });

  it('junta os projetos das contas, cada um com o nome da conta', async () => {
    await montar({ sbp_a: [bruto(REF, 'ACTIVE_HEALTHY')], sbp_b: [bruto(OUTRO, 'INACTIVE')] });
    await adicionar('Conta 1', 'sbp_a').expect(201);
    await adicionar('Conta 2', 'sbp_b').expect(201);
    const { projetos, erros } = (await ctx.http.get('/api/supabase/projetos').expect(200)).body;
    expect(erros).toEqual([]);
    expect(projetos.map((p) => [p.ref, p.conta, p.estado])).toEqual([[REF, 'Conta 1', 'no_ar'], [OUTRO, 'Conta 2', 'pausado']]);
  });

  it('a segunda leitura usa o cache e atualizar=1 não', async () => {
    await conectar();
    await ctx.http.get('/api/supabase/projetos').expect(200);
    const antes = leituras('sbp_a');
    await ctx.http.get('/api/supabase/projetos').expect(200);
    expect(leituras('sbp_a')).toBe(antes);
    await ctx.http.get('/api/supabase/projetos?atualizar=1').expect(200);
    expect(leituras('sbp_a')).toBe(antes + 1);
  });

  it('conta com token revogado vai em erros e não esconde os projetos das outras', async () => {
    await montar({ sbp_a: [bruto(REF, 'ACTIVE_HEALTHY')], sbp_b: [bruto(OUTRO, 'ACTIVE_HEALTHY')] });
    await adicionar('Conta 1', 'sbp_a').expect(201);
    await adicionar('Conta 2', 'sbp_b').expect(201);
    falso.porToken.sbp_b = { status: 401 };
    const { projetos, erros } = (await ctx.http.get('/api/supabase/projetos?atualizar=1').expect(200)).body;
    expect(projetos.map((p) => p.ref)).toEqual([REF]);
    expect(erros).toEqual([{ conta_id: 2, conta: 'Conta 2', erro: 'Token do Supabase inválido ou sem permissão. Cole um novo em Configurações → Supabase.' }]);
  });
});

describe('GET /projetos/:id/supabase', () => {
  it('sem conta 409; projeto inexistente 404; sem ref encontrado:false', async () => {
    const p = await novoProjeto({ supabase_ref: REF });
    await ctx.http.get(`/api/projetos/${p.id}/supabase`).expect(409);
    await conectar();
    await ctx.http.get('/api/projetos/9999/supabase').expect(404);
    const q = await novoProjeto({ titulo: 'Sem ref' });
    expect((await ctx.http.get(`/api/projetos/${q.id}/supabase`).expect(200)).body).toEqual({ encontrado: false });
  });

  it('devolve nome, região, estado, link e a conta; ref que sumiu vira encontrado:false', async () => {
    await montar({ sbp_a: [bruto(REF, 'INACTIVE')] });
    await conectar();
    const p = await novoProjeto({ supabase_ref: REF });
    expect((await ctx.http.get(`/api/projetos/${p.id}/supabase`).expect(200)).body).toEqual({
      encontrado: true, nome: 'Projeto abc', regiao: 'sa-east-1', estado: 'pausado', link: `https://supabase.com/dashboard/project/${REF}`, conta: 'Conta 1',
    });
    const q = await novoProjeto({ titulo: 'Outro', supabase_ref: OUTRO });
    expect((await ctx.http.get(`/api/projetos/${q.id}/supabase`).expect(200)).body).toEqual({ encontrado: false });
  });

  it('ref que não aparece enquanto uma conta falha vira 502 com o nome da conta', async () => {
    await montar({ sbp_a: [bruto(REF, 'ACTIVE_HEALTHY')], sbp_b: [bruto(OUTRO, 'ACTIVE_HEALTHY')] });
    await adicionar('Conta 1', 'sbp_a').expect(201);
    await adicionar('Conta 2', 'sbp_b').expect(201);
    const p = await novoProjeto({ supabase_ref: OUTRO });
    falso.porToken.sbp_b = { status: 403 };
    const res = await ctx.http.get(`/api/projetos/${p.id}/supabase?atualizar=1`).expect(502);
    expect(res.body.erro).toMatch(/^Conta Conta 2: Token do Supabase inválido/);
  });
});

describe('GET /supabase/atencao', () => {
  it('soma as contas: real pausado vira atenção; entregue pausado vira o código de perigo', async () => {
    await montar({ sbp_a: [bruto(REF, 'INACTIVE')], sbp_b: [bruto(OUTRO, 'INACTIVE')] });
    await adicionar('Conta 1', 'sbp_a').expect(201);
    await adicionar('Conta 2', 'sbp_b').expect(201);
    await novoProjeto({ titulo: 'Sistema Ana', supabase_ref: REF });
    await novoProjeto({ titulo: 'Loja Bia', supabase_ref: OUTRO, etapa: 'entregue' });
    const { alertas } = (await ctx.http.get('/api/supabase/atencao').expect(200)).body;
    expect(alertas).toHaveLength(2);
    expect(alertas.find((a) => a.codigo === 'supabase_pausado')).toMatchObject({ texto: 'Sistema Ana está pausado no Supabase' });
    expect(alertas.find((a) => a.codigo === 'supabase_pausado_entregue')).toMatchObject({ texto: 'Loja Bia já foi entregue e o Supabase está pausado' });
  });

  it('fictício, perdido e projeto no ar não alertam', async () => {
    await montar({ sbp_a: [bruto(REF, 'INACTIVE'), bruto(OUTRO, 'INACTIVE'), bruto('yyyyyyyyyyyyyyyyyyyy', 'ACTIVE_HEALTHY')] });
    await conectar();
    await novoProjeto({ titulo: 'Fictício', ficticio: 1, supabase_ref: REF });
    await novoProjeto({ titulo: 'Perdido', etapa: 'perdido', supabase_ref: OUTRO });
    await novoProjeto({ titulo: 'No ar', supabase_ref: 'yyyyyyyyyyyyyyyyyyyy' });
    expect((await ctx.http.get('/api/supabase/atencao').expect(200)).body).toEqual({ alertas: [] });
  });

  it('sem conexão ou com todas as contas falhando devolve alertas vazios, nunca erro', async () => {
    expect((await ctx.http.get('/api/supabase/atencao').expect(200)).body).toEqual({ alertas: [] });
    await montar({ sbp_a: { status: 500 } });
    definirConfig(ctx.db, 'supabase_token', 'sbp_a');
    expect((await ctx.http.get('/api/supabase/atencao').expect(200)).body).toEqual({ alertas: [] });
  });
});
