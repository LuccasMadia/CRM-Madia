import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let cliente;
beforeEach(async () => {
  ctx = criarContexto();
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' }).expect(201)).body;
});

const criar = async (dados = {}) => (await ctx.http.post('/api/eventos').send({ titulo: 'Reunião', inicio: '2026-10-05T14:00', fim: '2026-10-05T15:00', ...dados }).expect(201)).body;

describe('POST /eventos', () => {
  it('cria um evento com uid próprio e origem crm', async () => {
    const e = await criar({ local: 'Sala 2', notas: 'Levar proposta', cliente_id: cliente.id });
    expect(e).toMatchObject({
      titulo: 'Reunião', inicio: '2026-10-05T14:00', fim: '2026-10-05T15:00', dia_inteiro: 0, local: 'Sala 2', notas: 'Levar proposta',
      cliente_id: cliente.id, projeto_id: null, origem: 'crm', recorrente: 0, pendente: 0, href: null, etag: null,
    });
    expect(e.uid).toMatch(/^[0-9a-f-]{36}@crm-madia$/);
    expect((await criar()).uid).not.toBe(e.uid);
  });

  it('aceita dia inteiro só com a data e fim opcional', async () => {
    const e = await criar({ dia_inteiro: true, inicio: '2026-10-05', fim: undefined });
    expect(e).toMatchObject({ dia_inteiro: 1, inicio: '2026-10-05', fim: null });
  });

  it('exige título e início', async () => {
    const res = await ctx.http.post('/api/eventos').send({}).expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['inicio', 'titulo']);
  });

  it('recusa data fora do formato e fim antes do início', async () => {
    expect((await ctx.http.post('/api/eventos').send({ titulo: 'x', inicio: '05/10/2026' }).expect(400)).body.erros[0].campo).toBe('inicio');
    expect((await ctx.http.post('/api/eventos').send({ titulo: 'x', inicio: '2026-02-31' }).expect(400)).body.erros[0].campo).toBe('inicio');
    const res = await ctx.http.post('/api/eventos').send({ titulo: 'x', inicio: '2026-10-05T15:00', fim: '2026-10-05T14:00' }).expect(400);
    expect(res.body.erros[0]).toMatchObject({ campo: 'fim' });
  });

  it('cliente ou projeto inexistente é recusado no campo certo', async () => {
    expect((await ctx.http.post('/api/eventos').send({ titulo: 'x', inicio: '2026-10-05', cliente_id: 999 }).expect(400)).body.erros[0].campo).toBe('cliente_id');
    expect((await ctx.http.post('/api/eventos').send({ titulo: 'x', inicio: '2026-10-05', projeto_id: 999 }).expect(400)).body.erros[0].campo).toBe('projeto_id');
  });
});

describe('GET /eventos', () => {
  it('lista só o que toca a janela, em ordem de início', async () => {
    await criar({ titulo: 'Depois', inicio: '2026-10-20T09:00', fim: '2026-10-20T10:00' });
    await criar({ titulo: 'Dentro', inicio: '2026-10-05T14:00', fim: '2026-10-05T15:00' });
    await criar({ titulo: 'Antes', inicio: '2026-09-01T09:00', fim: '2026-09-01T10:00' });
    await criar({ titulo: 'Cruza o início', inicio: '2026-09-30T22:00', fim: '2026-10-01T02:00' });
    const res = await ctx.http.get('/api/eventos?de=2026-10-01&ate=2026-10-10').expect(200);
    expect(res.body.map((e) => e.titulo)).toEqual(['Cruza o início', 'Dentro']);
  });

  it('sem janela devolve todos e não lista os apagados', async () => {
    const a = await criar({ titulo: 'A' });
    ctx.db.prepare('UPDATE eventos SET apagado = 1 WHERE id = ?').run(a.id);
    await criar({ titulo: 'B' });
    expect((await ctx.http.get('/api/eventos').expect(200)).body.map((e) => e.titulo)).toEqual(['B']);
  });

  it('janela inválida dá 400', async () => {
    await ctx.http.get('/api/eventos?de=ontem&ate=2026-10-10').expect(400);
  });
});

describe('PUT /eventos/:id', () => {
  it('edita os campos enviados', async () => {
    const e = await criar();
    const res = await ctx.http.put(`/api/eventos/${e.id}`).send({ titulo: 'Reunião com Ana', fim: '2026-10-05T16:00' }).expect(200);
    expect(res.body).toMatchObject({ titulo: 'Reunião com Ana', inicio: '2026-10-05T14:00', fim: '2026-10-05T16:00' });
  });

  it('valida o fim contra o início que já existe', async () => {
    const e = await criar();
    expect((await ctx.http.put(`/api/eventos/${e.id}`).send({ fim: '2026-10-05T13:00' }).expect(400)).body.erros[0].campo).toBe('fim');
  });

  it('evento recorrente é somente leitura', async () => {
    const e = await criar();
    ctx.db.prepare('UPDATE eventos SET recorrente = 1 WHERE id = ?').run(e.id);
    const res = await ctx.http.put(`/api/eventos/${e.id}`).send({ titulo: 'x' }).expect(409);
    expect(res.body.erro).toBe('Evento recorrente é somente leitura.');
    await ctx.http.delete(`/api/eventos/${e.id}`).expect(409);
  });

  it('inexistente dá 404', async () => {
    await ctx.http.put('/api/eventos/999').send({ titulo: 'x' }).expect(404);
  });
});

describe('DELETE /eventos/:id', () => {
  it('apaga de vez um evento que nunca foi para o iCloud', async () => {
    const e = await criar();
    await ctx.http.delete(`/api/eventos/${e.id}`).expect(204);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM eventos').get().n).toBe(0);
  });

  it('só marca como apagado se o evento já existe no iCloud (o sync apaga lá)', async () => {
    const e = await criar();
    ctx.db.prepare("UPDATE eventos SET href = '/cal/e.ics' WHERE id = ?").run(e.id);
    await ctx.http.delete(`/api/eventos/${e.id}`).expect(204);
    expect(ctx.db.prepare('SELECT apagado FROM eventos WHERE id = ?').get(e.id).apagado).toBe(1);
    expect((await ctx.http.get('/api/eventos')).body).toEqual([]);
  });

  it('apagar cliente ou projeto solta o evento em vez de apagá-lo', async () => {
    const e = await criar({ cliente_id: cliente.id });
    await ctx.http.delete(`/api/clientes/${cliente.id}`).expect(204);
    expect((await ctx.http.get('/api/eventos')).body[0]).toMatchObject({ id: e.id, cliente_id: null });
  });
});
