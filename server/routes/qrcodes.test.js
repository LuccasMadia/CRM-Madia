import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let cliente;
beforeEach(async () => {
  ctx = criarContexto();
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
});

async function criarQrcode(overrides = {}) {
  return (
    await ctx.http
      .post('/api/qrcodes')
      .send({
        cliente_id: cliente.id,
        nome: 'QR balcão loja',
        categoria: 'adesivo',
        destino_atual: 'https://canva.com/design/abc',
        ...overrides,
      })
      .expect(201)
  ).body;
}

describe('/api/qrcodes', () => {
  it('cria e lista', async () => {
    await criarQrcode();
    const res = await ctx.http.get('/api/qrcodes').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ nome: 'QR balcão loja', categoria: 'adesivo', status: 'ativo' });
  });

  it('exige nome, categoria válida e destino_atual', async () => {
    const res = await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: cliente.id, categoria: 'invalida' })
      .expect(400);
    expect(res.body.erros).toEqual(
      expect.arrayContaining([
        { campo: 'nome', mensagem: 'Obrigatório' },
        { campo: 'categoria', mensagem: 'Valor inválido: invalida' },
        { campo: 'destino_atual', mensagem: 'Obrigatório' },
      ]),
    );
  });

  it('recusa cliente_id inexistente', async () => {
    const res = await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: 999, nome: 'QR', categoria: 'adesivo', destino_atual: 'https://x.com' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
  });

  it('filtra por cliente_id e status', async () => {
    const qr = await criarQrcode();
    const outroCliente = (await ctx.http.post('/api/clientes').send({ nome: 'Bruno' })).body;
    await criarQrcode({ cliente_id: outroCliente.id, nome: 'QR do Bruno' });

    const porCliente = await ctx.http.get(`/api/qrcodes?cliente_id=${cliente.id}`).expect(200);
    expect(porCliente.body.map((q) => q.id)).toEqual([qr.id]);

    const porStatus = await ctx.http.get('/api/qrcodes?status=arquivado').expect(200);
    expect(porStatus.body).toEqual([]);
  });

  it('detalhe traz o histórico vazio', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http.get(`/api/qrcodes/${qr.id}`).expect(200);
    expect(res.body.historico).toEqual([]);
  });

  it('responde 404 para id inexistente ou inválido', async () => {
    await ctx.http.get('/api/qrcodes/999').expect(404);
    await ctx.http.get('/api/qrcodes/abc').expect(404);
  });
});
