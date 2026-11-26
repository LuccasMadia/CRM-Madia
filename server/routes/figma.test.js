import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { githubFalso } from '../test/githubFalso.js';

const BASE = 'https://api.figma.com/v1';
const ARQUIVO = `${BASE}/files/AbC123?depth=1`;
const DADOS = { name: 'Site Ana', lastModified: '2026-11-20T10:00:00Z' };

let ctx;
let figma;
let cliente;
async function montar(rotas = {}) {
  figma = githubFalso({ [`${BASE}/me`]: { handle: 'lucas' }, [ARQUIVO]: DADOS, ...rotas });
  ctx = criarContexto({ fetch: figma.fetch });
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
}
const conectar = () => ctx.http.put('/api/figma/conexao').send({ token: 'figd_segredo' }).expect(200);
const novoProjeto = async (dados = {}) => (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site Ana', ...dados }).expect(201)).body;
const leituras = () => figma.requisicoes.filter((r) => r.url.pathname === '/v1/files/AbC123').length;

beforeEach(() => montar());

describe('conexão com o Figma', () => {
  it('conecta, guarda o token sem devolvê-lo e desconecta', async () => {
    expect((await ctx.http.get('/api/figma').expect(200)).body).toEqual({ conectado: false, usuario: null });
    expect((await conectar()).body).toEqual({ conectado: true, usuario: 'lucas' });
    expect(JSON.stringify((await ctx.http.get('/api/figma')).body)).not.toContain('figd_segredo');
    expect((await ctx.http.delete('/api/figma/conexao').expect(200)).body).toEqual({ conectado: false, usuario: null });
  });

  it('token inválido é recusado no campo token e nada é guardado', async () => {
    await montar({ [`${BASE}/me`]: { status: 403, corpo: {} } });
    const res = await ctx.http.put('/api/figma/conexao').send({ token: 'ruim' }).expect(400);
    expect(res.body.erros[0].campo).toBe('token');
    expect((await ctx.http.get('/api/figma')).body.conectado).toBe(false);
  });

});

describe('GET /projetos/:id/figma', () => {
  it('sem token devolve 409 pedindo para conectar', async () => {
    const p = await novoProjeto({ figma_url: 'https://figma.com/design/AbC123/x' });
    const res = await ctx.http.get(`/api/projetos/${p.id}/figma`).expect(409);
    expect(res.body.erro).toBe('Conecte o Figma em Configurações.');
  });

  it('projeto sem arquivo devolve encontrado:false sem chamar o Figma', async () => {
    await conectar();
    const p = await novoProjeto();
    expect((await ctx.http.get(`/api/projetos/${p.id}/figma`).expect(200)).body).toEqual({ encontrado: false });
    expect(leituras()).toBe(0);
  });

  it('devolve nome, data e link; a segunda leitura usa o cache e atualizar=1 não', async () => {
    await conectar();
    const p = await novoProjeto({ figma_url: 'https://figma.com/design/AbC123/x' });
    const esperado = { encontrado: true, nome: 'Site Ana', editado_em: '2026-11-20T10:00:00Z', url: 'https://www.figma.com/design/AbC123' };
    expect((await ctx.http.get(`/api/projetos/${p.id}/figma`).expect(200)).body).toEqual(esperado);
    await ctx.http.get(`/api/projetos/${p.id}/figma`).expect(200);
    expect(leituras()).toBe(1);
    await ctx.http.get(`/api/projetos/${p.id}/figma?atualizar=1`).expect(200);
    expect(leituras()).toBe(2);
  });

  it('arquivo que sumiu (404) vira encontrado:false; token revogado vira 502 com a mensagem', async () => {
    await conectar();
    const p = await novoProjeto({ figma_url: 'https://figma.com/design/AbC123/x' });
    await montar({ [ARQUIVO]: { status: 404, corpo: {} } });
    await conectar();
    const q = await novoProjeto({ figma_url: 'https://figma.com/design/AbC123/x' });
    expect((await ctx.http.get(`/api/projetos/${q.id}/figma`).expect(200)).body).toEqual({ encontrado: false });
    await montar({ [ARQUIVO]: { status: 403, corpo: {} } });
    await conectar();
    const r = await novoProjeto({ figma_url: 'https://figma.com/design/AbC123/x' });
    const res = await ctx.http.get(`/api/projetos/${r.id}/figma`).expect(502);
    expect(res.body.erro).toMatch(/Token do Figma inválido/);
    expect(p.id).toBeGreaterThan(0);
  });

  it('projeto inexistente devolve 404', async () => {
    await conectar();
    await ctx.http.get('/api/projetos/9999/figma').expect(404);
  });
});
