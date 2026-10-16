import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { fetchFalso } from '../test/instagramFalso.js';

const PERFIL = { user_id: '178', username: 'luccasmadia', followers_count: 1284, media_count: 1 };
const MIDIA = {
  id: 'm1', caption: 'Reels Popy', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn.test/m1.jpg',
  permalink: 'https://www.instagram.com/reel/m1/', timestamp: '2026-10-10T15:00:00+0000', like_count: 134, comments_count: 12,
};
let rotas;
let ctx;
let falso;

beforeEach(() => {
  rotas = {
    '/me': PERFIL,
    '/me/insights': { data: [] },
    '/me/media': { data: [MIDIA] },
    '/m1/insights': { data: [] },
    'https://cdn.test/m1.jpg': { status: 200, corpo: new Uint8Array([1]) },
  };
  falso = fetchFalso(new Proxy({}, { get: (_, chave) => rotas[chave] }));
  ctx = criarContexto({ hoje: '2026-10-16', fetch: falso.fetch });
});

async function conectar() {
  await ctx.http.put('/api/instagram/conexao').send({ token: 'segredo-123' }).expect(200);
  await ctx.app.locals.sincronizarInstagram.executar().catch(() => {});
}

describe('conexão', () => {
  it('começa desconectado', async () => {
    const res = await ctx.http.get('/api/instagram/estado').expect(200);
    expect(res.body).toMatchObject({ conectado: false, usuario: null, sincronizando: false });
  });

  it('token inválido é recusado no campo token', async () => {
    rotas['/me'] = { status: 400, corpo: { error: { code: 190, message: 'Invalid' } } };
    const res = await ctx.http.put('/api/instagram/conexao').send({ token: 'ruim' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
  });

  it('token válido conecta sem devolver o token', async () => {
    const res = await ctx.http.put('/api/instagram/conexao').send({ token: 'segredo-123' }).expect(200);
    expect(res.body).toMatchObject({ conectado: true, usuario: 'luccasmadia' });
    expect(res.body.expira_em).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('segredo-123');
    expect(JSON.stringify((await ctx.http.get('/api/instagram/estado')).body)).not.toContain('segredo-123');
  });

  it('desconectar apaga o acesso e mantém as mídias', async () => {
    await conectar();
    await ctx.http.delete('/api/instagram/conexao').expect(204);
    expect((await ctx.http.get('/api/instagram/estado')).body.conectado).toBe(false);
    expect((await ctx.http.get('/api/instagram/grid')).body.midias).toHaveLength(1);
  });
});

describe('sincronizar', () => {
  it('duas chamadas ao mesmo tempo não duplicam mídias', async () => {
    await ctx.http.put('/api/instagram/conexao').send({ token: 't' });
    const [a, b] = await Promise.all([ctx.http.post('/api/instagram/sincronizar'), ctx.http.post('/api/instagram/sincronizar')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM instagram_midias').get().n).toBe(1);
  });

  it('token expirado devolve 502 amigável e mantém o grid', async () => {
    await conectar();
    rotas['/me'] = { status: 400, corpo: { error: { code: 190, message: 'Invalid' } } };
    const res = await ctx.http.post('/api/instagram/sincronizar').expect(502);
    expect(res.body.erro).toMatch(/Reconecte/);
    expect((await ctx.http.get('/api/instagram/grid')).body.midias).toHaveLength(1);
    expect((await ctx.http.get('/api/instagram/estado')).body.ultimo_erro).toMatch(/Reconecte/);
  });
});

describe('grid e vínculos', () => {
  it('pronto aparece na prévia até ser ligado, e volta ao desfazer', async () => {
    const c = (await ctx.http.post('/api/conteudos').send({ titulo: 'Reels sexta', tipo: 'reels', estado: 'pronto' })).body;
    ctx.db.prepare("UPDATE conteudos SET criado_em = '2026-10-01T00:00:00.000Z' WHERE id = ?").run(c.id);
    rotas['/me/media'] = { data: [{ ...MIDIA, caption: 'outra coisa' }] };
    await conectar();
    let grid = (await ctx.http.get('/api/instagram/grid')).body;
    expect(grid.prontos.map((p) => p.titulo)).toEqual(['Reels sexta']);
    expect(grid.midias[0]).toMatchObject({ id: 'm1', capa_url: '/uploads/instagram/m1.jpg', conteudo_id: null });
    expect((await ctx.http.get('/api/instagram/midias/m1/candidatos')).body.map((p) => p.id)).toEqual([c.id]);

    await ctx.http.post('/api/instagram/midias/m1/vinculo').send({ conteudo_id: c.id }).expect(200);
    grid = (await ctx.http.get('/api/instagram/grid')).body;
    expect(grid.prontos).toEqual([]);
    expect(grid.midias[0]).toMatchObject({ conteudo_id: c.id, conteudo_titulo: 'Reels sexta' });

    await ctx.http.delete('/api/instagram/midias/m1/vinculo').expect(200);
    expect((await ctx.http.get('/api/instagram/grid')).body.prontos).toHaveLength(1);
  });

  it('escolhe o projeto do post e filtra por projeto', async () => {
    await conectar();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Popy' })).body;
    await ctx.http.put('/api/instagram/midias/m1').send({ projeto_id: 999 }).expect(400);
    const res = await ctx.http.put('/api/instagram/midias/m1').send({ projeto_id: projeto.id }).expect(200);
    expect(res.body).toMatchObject({ projeto_id: projeto.id, projeto_titulo: 'Popy' });
    expect((await ctx.http.get(`/api/instagram/midias?projeto_id=${projeto.id}`)).body.map((m) => m.id)).toEqual(['m1']);
    await ctx.http.put('/api/instagram/midias/nao-existe').send({ projeto_id: null }).expect(404);
  });

  it('série de seguidores em ordem crescente', async () => {
    ctx.db.exec("INSERT INTO instagram_seguidores (dia, seguidores) VALUES ('2026-10-15', 1280), ('2026-10-01', 1242), ('2026-01-01', 900)");
    const res = await ctx.http.get('/api/instagram/seguidores').expect(200);
    expect(res.body).toEqual([{ dia: '2026-10-01', seguidores: 1242 }, { dia: '2026-10-15', seguidores: 1280 }]);
  });
});
