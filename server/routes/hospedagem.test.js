import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { fetchFalso } from '../test/instagramFalso.js';

const V = 'https://api.vercel.com';
const PROJETOS_VERCEL = { projects: [{ id: 'prj_1', name: 'rango' }] };

let ctx;
let falso;
let projeto;

function montar(rotas = {}, hoje = '2026-11-20') {
  falso = fetchFalso({ [`GET ${V}/v10/projects?limit=100`]: PROJETOS_VERCEL, ...rotas });
  ctx = criarContexto({ hoje, fetch: falso.fetch });
  ctx.app.locals.monitorSites = { checarTodos: async () => {} };
}
async function criarProjeto(dados = {}) {
  const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
  return (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', valor_total_centavos: 10000, ...dados })).body;
}
const conectar = (token = 'segredo-vercel') => ctx.http.put('/api/vercel/conexao').send({ token });
const cadastrar = (dados) => ctx.http.put(`/api/projetos/${projeto.id}/hospedagem`).send(dados);
const cadastroVercel = () => cadastrar({ tipo: 'vercel', url: 'rango.com.br', vercel_projeto_id: 'prj_1', vercel_projeto_nome: 'rango' });

beforeEach(async () => {
  montar();
  projeto = await criarProjeto();
});

describe('conexão com a Vercel', () => {
  it('conecta com token válido e não devolve o token', async () => {
    expect((await ctx.http.get('/api/vercel/estado').expect(200)).body).toEqual({ conectado: false, prazo_dias: 7 });
    const res = await conectar().expect(200);
    expect(res.body).toEqual({ conectado: true, prazo_dias: 7 });
    expect(falso.requisicoes[0].headers.Authorization).toBe('Bearer segredo-vercel');
  });

  it('401 da Vercel vira 400 no campo token', async () => {
    montar({ [`GET ${V}/v10/projects?limit=100`]: { status: 401, corpo: {} } });
    const res = await conectar().expect(400);
    expect(res.body.erros).toEqual([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
    expect((await ctx.http.get('/api/vercel/estado')).body.conectado).toBe(false);
  });

  it('sem rede ao conectar -> 502', async () => {
    ctx = criarContexto({ fetch: async () => { throw new Error('offline'); } });
    const res = await conectar().expect(502);
    expect(res.body.erro).toMatch(/Não foi possível falar com a Vercel/);
    expect((await ctx.http.get('/api/vercel/estado')).body.conectado).toBe(false);
  });

  it('erro da Vercel ao listar projetos -> 502', async () => {
    montar({ [`GET ${V}/v10/projects?limit=100`]: { status: 500, corpo: {} } });
    ctx.db.prepare("INSERT INTO config (chave, valor) VALUES ('vercel_token', 'x')").run();
    const res = await ctx.http.get('/api/vercel/projetos').expect(502);
    expect(res.body.erro).toBe('A Vercel respondeu 500.');
  });

  it('desconectar apaga o token', async () => {
    await conectar();
    await ctx.http.delete('/api/vercel/conexao').expect(204);
    expect((await ctx.http.get('/api/vercel/estado')).body.conectado).toBe(false);
  });

  it('prazo: aceita 1 a 60 e recusa 0 e 61', async () => {
    expect((await ctx.http.put('/api/vercel/prazo').send({ dias: 10 }).expect(200)).body.prazo_dias).toBe(10);
    await ctx.http.put('/api/vercel/prazo').send({ dias: 0 }).expect(400);
    await ctx.http.put('/api/vercel/prazo').send({ dias: 61 }).expect(400);
  });

  it('lista projetos da Vercel; 409 sem token', async () => {
    expect((await ctx.http.get('/api/vercel/projetos').expect(409)).body.erro).toBe('Conecte a Vercel em Configurações.');
    await conectar();
    expect((await ctx.http.get('/api/vercel/projetos').expect(200)).body).toEqual([{ id: 'prj_1', nome: 'rango' }]);
  });

  it('nenhuma resposta contém o token', async () => {
    await conectar();
    await cadastroVercel();
    const textos = [
      (await ctx.http.get('/api/vercel/estado')).text,
      (await ctx.http.get(`/api/projetos/${projeto.id}/hospedagem`)).text,
      (await ctx.http.get('/api/hospedagem/avisos')).text,
      (await ctx.http.get('/api/hospedagem/status')).text,
      (await ctx.http.get('/api/vercel/projetos')).text,
    ];
    for (const t of textos) expect(t).not.toContain('segredo-vercel');
  });
});

describe('cadastro da hospedagem', () => {
  it('GET sem cadastro devolve hospedagem nula', async () => {
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/hospedagem`).expect(200);
    expect(res.body).toEqual({ hospedagem: null, pausas: [], cobranca: null });
  });

  it('prefixa https:// e dispara o monitor', async () => {
    let chamou = 0;
    ctx.app.locals.monitorSites = { checarTodos: async () => { chamou++; } };
    const res = await cadastrar({ tipo: 'vercel', url: 'rangodobicho.com.br' }).expect(200);
    expect(res.body.hospedagem.url).toBe('https://rangodobicho.com.br');
    expect(chamou).toBe(1);
    await cadastrar({ tipo: 'vercel', url: 'rangodobicho.com.br', vercel_projeto_id: 'prj_1' }).expect(200);
    expect(chamou).toBe(1);
  });

  it('recusa endereço inválido e exige url na Vercel', async () => {
    const res = await cadastrar({ tipo: 'vercel', url: 'abc' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'url', mensagem: 'Endereço inválido' }]);
    await cadastrar({ tipo: 'vercel' }).expect(400);
    await cadastrar({ tipo: 'vercel', url: 'ftp://a.com' }).expect(400);
  });

  it('sem_hospedagem zera url e projeto', async () => {
    await cadastroVercel();
    const res = await cadastrar({ tipo: 'sem_hospedagem', url: 'x.com', vercel_projeto_id: 'p' }).expect(200);
    expect(res.body.hospedagem).toMatchObject({ tipo: 'sem_hospedagem', url: null, vercel_projeto_id: null });
  });

  it('projeto GMN e inexistente', async () => {
    const gmn = await criarProjeto();
    ctx.db.prepare("UPDATE projetos SET servico = 'google_meu_negocio' WHERE id = ?").run(gmn.id);
    const res = await ctx.http.get(`/api/projetos/${gmn.id}/hospedagem`).expect(400);
    expect(res.body.erro).toBe('Só sites e sistemas têm hospedagem.');
    await ctx.http.get('/api/projetos/999/hospedagem').expect(404);
  });

  it('status para a lista de sites', async () => {
    await cadastroVercel();
    const res = await ctx.http.get('/api/hospedagem/status').expect(200);
    expect(res.body).toEqual([{ projeto_id: projeto.id, tipo: 'vercel', status: 'desconhecido', status_desde: null }]);
  });
});

describe('pausar e religar', () => {
  const pausarUrl = `POST ${V}/v1/projects/prj_1/pause`;
  const religarUrl = `POST ${V}/v1/projects/prj_1/unpause`;
  const pausar = () => ctx.http.post(`/api/projetos/${projeto.id}/hospedagem/pausar`);
  const religar = () => ctx.http.post(`/api/projetos/${projeto.id}/hospedagem/religar`);

  it('pausa, registra e depois religa', async () => {
    montar({ [pausarUrl]: {}, [religarUrl]: {} });
    projeto = await criarProjeto();
    await conectar();
    await cadastroVercel();
    const res = await pausar().expect(200);
    expect(res.body.hospedagem.status).toBe('pausado');
    expect(res.body.pausas[0].acao).toBe('pausou');
    expect(falso.requisicoes.some((r) => r.metodo === 'POST' && r.url.href === `${V}/v1/projects/prj_1/pause`)).toBe(true);
    await pausar().expect(409);
    const volta = await religar().expect(200);
    expect(volta.body.hospedagem).toMatchObject({ status: 'desconhecido', status_desde: null });
    expect(volta.body.pausas.map((p) => p.acao)).toEqual(['religou', 'pausou']);
    await religar().expect(409);
  });

  it('Vercel recusa: 502 com a mensagem e nada muda', async () => {
    montar({ [pausarUrl]: { status: 401, corpo: {} } });
    projeto = await criarProjeto();
    await conectar();
    await cadastroVercel();
    const res = await pausar().expect(502);
    expect(res.body.erro).toMatch(/^Token da Vercel inválido/);
    const g = (await ctx.http.get(`/api/projetos/${projeto.id}/hospedagem`)).body;
    expect(g.hospedagem.status).toBe('desconhecido');
    expect(g.pausas).toEqual([]);
  });

  it('religar: Vercel recusa -> 502 e nada muda', async () => {
    montar({ [religarUrl]: { status: 404, corpo: {} } });
    projeto = await criarProjeto();
    await conectar();
    await cadastroVercel();
    ctx.db.prepare("UPDATE hospedagens SET status='pausado' WHERE projeto_id=?").run(projeto.id);
    const res = await religar().expect(502);
    expect(res.body.erro).toBe('Projeto não encontrado na Vercel.');
    const g = (await ctx.http.get(`/api/projetos/${projeto.id}/hospedagem`)).body;
    expect(g.hospedagem.status).toBe('pausado');
    expect(g.pausas).toEqual([]);
  });

  it('religar funciona em site fictício pausado', async () => {
    montar({ [religarUrl]: {} });
    projeto = await criarProjeto({ ficticio: true });
    await conectar();
    await cadastroVercel();
    ctx.db.prepare("UPDATE hospedagens SET status='pausado' WHERE projeto_id=?").run(projeto.id);
    const res = await religar().expect(200);
    expect(res.body.hospedagem.status).toBe('desconhecido');
    expect(falso.requisicoes.some((r) => r.url.href === `${V}/v1/projects/prj_1/unpause`)).toBe(true);
  });

  it('409 sem token, sem projeto da Vercel e fictício', async () => {
    await cadastroVercel();
    expect((await pausar().expect(409)).body.erro).toBe('Conecte a Vercel em Configurações.');
    await conectar();
    await cadastrar({ tipo: 'vercel', url: 'rango.com.br' });
    expect((await pausar().expect(409)).body.erro).toBe('Escolha o projeto da Vercel na aba Hospedagem.');
    const fic = await criarProjeto({ ficticio: true });
    await ctx.http.put(`/api/projetos/${fic.id}/hospedagem`).send({ tipo: 'vercel', url: 'f.com.br', vercel_projeto_id: 'prj_1' });
    const res = await ctx.http.post(`/api/projetos/${fic.id}/hospedagem/pausar`).expect(409);
    expect(res.body.erro).toBe('Site fictício não tem corte.');
  });
});

describe('avisos e cobrança', () => {
  async function comMensalidadeAtrasada() {
    projeto = await criarProjeto({
      mensalidade_ativa: true,
      mensalidade_valor_centavos: 5000,
      mensalidade_dia_vencimento: 10,
      mensalidade_inicio_modo: 'data',
      mensalidade_inicio_data: '2026-11-10',
    });
    await cadastroVercel();
  }
  const avisos = async () => (await ctx.http.get('/api/hospedagem/avisos').expect(200)).body;

  it('atrasada -> avisei -> avisado; pagar zera o aviso', async () => {
    await comMensalidadeAtrasada();
    const a = await avisos();
    expect(a.cobrancas).toHaveLength(1);
    expect(a.cobrancas[0]).toMatchObject({ projeto_id: projeto.id, titulo: 'Site', cliente_nome: 'Ana', url: 'https://rango.com.br', fase: 'atrasada', valor_centavos: 5000 });
    const av = await ctx.http.post(`/api/projetos/${projeto.id}/hospedagem/avisei`).expect(200);
    expect(av.body.hospedagem.cliente_avisado_em).toBe('2026-11-20');
    expect(av.body.cobranca.fase).toBe('avisado');
    expect((await avisos()).cobrancas[0].fase).toBe('avisado');

    const parcelas = (await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`)).body.parcelas;
    await ctx.http.put(`/api/parcelas/${parcelas[0].id}`).send({ pago_em: '2026-11-20' }).expect(200);
    expect((await avisos()).cobrancas).toEqual([]);
    const g = (await ctx.http.get(`/api/projetos/${projeto.id}/hospedagem`)).body;
    expect(g.hospedagem.cliente_avisado_em).toBeNull();
  });

  it('avisei sem atraso dá 409', async () => {
    await cadastroVercel();
    const res = await ctx.http.post(`/api/projetos/${projeto.id}/hospedagem/avisei`).expect(409);
    expect(res.body.erro).toBe('Não há mensalidade atrasada.');
  });

  it('site fora do ar aparece em fora_do_ar', async () => {
    await cadastroVercel();
    ctx.db
      .prepare("UPDATE hospedagens SET status='fora_do_ar', status_desde='2026-11-19T10:00:00.000Z', ultimo_motivo='Erro 503' WHERE projeto_id=?")
      .run(projeto.id);
    const a = await avisos();
    expect(a.fora_do_ar).toEqual([
      { projeto_id: projeto.id, titulo: 'Site', cliente_nome: 'Ana', url: 'https://rango.com.br', desde: '2026-11-19T10:00:00.000Z', motivo: 'Erro 503' },
    ]);
  });
});
