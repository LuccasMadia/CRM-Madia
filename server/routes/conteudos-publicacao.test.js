import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import { criarContexto } from '../test/contexto.js';

const PASSADO = '2000-01-01T00:00:00.000Z';
const FUTURO = '2999-01-01T00:00:00.000Z';

let ctx;
let chamadas;
beforeEach(() => {
  chamadas = [];
  const publicador = {
    iniciar: (id) => {
      chamadas.push(id);
      ctx.db.prepare("UPDATE conteudos SET estado = 'publicando' WHERE id = ?").run(id);
      return Promise.resolve();
    },
  };
  ctx = criarContexto({ publicador });
});

const png = () => sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer();
async function criarPost(extra = {}) {
  const c = (await ctx.http.post('/api/conteudos').send({ titulo: 'Post', tipo: 'post', ...extra })).body;
  await ctx.http.post(`/api/conteudos/${c.id}/midias`).attach('midias', await png(), { filename: 'a.png', contentType: 'image/png' });
  return c;
}
const definir = (id, estado, extra = '') => ctx.db.prepare(`UPDATE conteudos SET estado = ?${extra} WHERE id = ?`).run(estado, id);

describe('publicar', () => {
  it('responde 202 e chama iniciar', async () => {
    const c = await criarPost();
    const res = await ctx.http.post(`/api/conteudos/${c.id}/publicar`).expect(202);
    expect(chamadas).toEqual([c.id]);
    expect(res.body).toMatchObject({ id: c.id, estado: 'publicando' });
    expect(res.body.midias).toHaveLength(1);
  });
});

describe('agendar', () => {
  it('recusa horário no passado', async () => {
    const c = await criarPost();
    const res = await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: PASSADO }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'agendado_para', mensagem: 'Escolha um horário no futuro.' }]);
  });
  it('recusa data inválida', async () => {
    const c = await criarPost();
    const res = await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: 'amanha' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'agendado_para', mensagem: 'Data e hora inválidas.' }]);
  });
  it('agenda no futuro e limpa o erro', async () => {
    const c = await criarPost();
    definir(c.id, 'falhou', ", publicacao_erro = 'x'");
    const res = await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: FUTURO }).expect(200);
    expect(res.body).toMatchObject({ estado: 'agendado', agendado_para: FUTURO, publicacao_erro: null });
  });
  it('recusa carrossel sem imagens', async () => {
    const c = (await ctx.http.post('/api/conteudos').send({ titulo: 'C', tipo: 'carrossel' })).body;
    const res = await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: FUTURO }).expect(400);
    expect(res.body.erros[0].campo).toBe('publicacao');
    expect(res.body.erros[0].mensagem).toMatch(/Carrossel precisa de 2 a 10/);
  });
  it('409 se publicando ou publicado', async () => {
    const c = await criarPost();
    definir(c.id, 'publicando');
    await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: FUTURO }).expect(409);
    definir(c.id, 'publicado');
    const res = await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: FUTURO }).expect(409);
    expect(res.body.erro).toBe('Este post já foi publicado.');
  });
});

describe('cancelar agendamento', () => {
  it('volta para rascunho', async () => {
    const c = await criarPost();
    await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: FUTURO }).expect(200);
    const res = await ctx.http.delete(`/api/conteudos/${c.id}/agendamento`).expect(200);
    expect(res.body).toMatchObject({ estado: 'rascunho', agendado_para: null });
  });
  it('409 se não está agendado', async () => {
    const c = await criarPost();
    const res = await ctx.http.delete(`/api/conteudos/${c.id}/agendamento`).expect(409);
    expect(res.body.erro).toBe('Este post não está agendado.');
  });
});

describe('avisos e listas', () => {
  it('lista atrasados e falhas', async () => {
    const a = await criarPost({ titulo: 'A' });
    const f = await criarPost({ titulo: 'F' });
    await criarPost({ titulo: 'R' });
    definir(a.id, 'atrasado', ", agendado_para = '2000-01-01T00:00:00.000Z'");
    definir(f.id, 'falhou', ", publicacao_erro = 'boom'");
    const res = await ctx.http.get('/api/conteudos/avisos').expect(200);
    expect(res.body.atrasados.map((c) => c.id)).toEqual([a.id]);
    expect(res.body.falhas.map((c) => c.id)).toEqual([f.id]);
    expect(res.body.atrasados[0].midias).toHaveLength(1);
  });
  it('filtra por estado de publicação e recusa desconhecido', async () => {
    const c = await criarPost();
    definir(c.id, 'agendado', ", agendado_para = '2999-01-01T00:00:00.000Z'");
    const res = await ctx.http.get('/api/conteudos?estado=agendado').expect(200);
    expect(res.body.map((x) => x.id)).toEqual([c.id]);
    await ctx.http.get('/api/conteudos?estado=xyz').expect(400);
  });
  it('lista padrão inclui agendado', async () => {
    const c = await criarPost();
    definir(c.id, 'agendado', ", agendado_para = '2999-01-01T00:00:00.000Z'");
    const res = await ctx.http.get('/api/conteudos').expect(200);
    expect(res.body.map((x) => x.id)).toEqual([c.id]);
  });
  it('PUT com estado num agendado ignora o estado e mantém o horário', async () => {
    const c = await criarPost();
    await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: FUTURO }).expect(200);
    const res = await ctx.http.put(`/api/conteudos/${c.id}`).send({ legenda: 'nova', estado: 'pronto' }).expect(200);
    expect(res.body).toMatchObject({ estado: 'agendado', agendado_para: FUTURO, legenda: 'nova' });
  });
  it('PUT em publicando dá 409; em agendado mantém agendado', async () => {
    const c = await criarPost();
    await ctx.http.post(`/api/conteudos/${c.id}/agendar`).send({ agendado_para: FUTURO }).expect(200);
    const ok = await ctx.http.put(`/api/conteudos/${c.id}`).send({ legenda: 'nova' }).expect(200);
    expect(ok.body).toMatchObject({ estado: 'agendado', legenda: 'nova' });
    definir(c.id, 'publicando');
    await ctx.http.put(`/api/conteudos/${c.id}`).send({ legenda: 'x' }).expect(409);
  });
  it('grid inclui agendado e publicando antes dos prontos', async () => {
    const p = await criarPost({ titulo: 'P', estado: 'pronto' });
    const a = await criarPost({ titulo: 'A' });
    const g = await criarPost({ titulo: 'G' });
    definir(a.id, 'agendado', ", agendado_para = '2999-01-01T00:00:00.000Z'");
    definir(g.id, 'publicando');
    const res = await ctx.http.get('/api/instagram/grid').expect(200);
    expect(res.body.prontos.map((c) => c.id)).toEqual([g.id, a.id, p.id]);
  });
});
