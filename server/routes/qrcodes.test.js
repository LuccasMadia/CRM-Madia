import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
        categoria: 'cardapio',
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
    expect(res.body[0]).toMatchObject({ nome: 'QR balcão loja', categoria: 'cardapio', status: 'ativo' });
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
      .send({ cliente_id: 999, nome: 'QR', categoria: 'cardapio', destino_atual: 'https://x.com' })
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

  it('atualiza campos e não gera histórico quando o destino não muda', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http.put(`/api/qrcodes/${qr.id}`).send({ nome: 'Novo nome' }).expect(200);
    expect(res.body).toMatchObject({ nome: 'Novo nome' });
    expect(res.body.historico).toEqual([]);
  });

  it('gera histórico quando o destino_atual muda', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http
      .put(`/api/qrcodes/${qr.id}`)
      .send({ destino_atual: 'https://canva.com/design/novo' })
      .expect(200);
    expect(res.body.destino_atual).toBe('https://canva.com/design/novo');
    expect(res.body.historico).toHaveLength(1);
    expect(res.body.historico[0]).toMatchObject({
      destino_anterior: 'https://canva.com/design/abc',
      destino_novo: 'https://canva.com/design/novo',
    });

    const detalhe = await ctx.http.get(`/api/qrcodes/${qr.id}`).expect(200);
    expect(detalhe.body.historico).toHaveLength(1);
  });

  it('mantém o histórico ordenado do mais recente pro mais antigo', async () => {
    const qr = await criarQrcode();
    await ctx.http.put(`/api/qrcodes/${qr.id}`).send({ destino_atual: 'https://x.com/1' }).expect(200);
    await ctx.http.put(`/api/qrcodes/${qr.id}`).send({ destino_atual: 'https://x.com/2' }).expect(200);
    const res = await ctx.http.get(`/api/qrcodes/${qr.id}`).expect(200);
    expect(res.body.historico.map((h) => h.destino_novo)).toEqual(['https://x.com/2', 'https://x.com/1']);
  });

  it('valida cliente_id ao atualizar', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http.put(`/api/qrcodes/${qr.id}`).send({ cliente_id: 999 }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
  });

  it('responde 404 ao atualizar id inexistente', async () => {
    await ctx.http.put('/api/qrcodes/999').send({ nome: 'X' }).expect(404);
  });

  it('recebe imagem PNG e serve em /uploads', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', Buffer.from('conteudo-png'), { filename: 'qr.png', contentType: 'image/png' })
      .expect(200);
    expect(res.body.imagem_arquivo).toMatch(/\.png$/);
    await ctx.http.get(`/uploads/${res.body.imagem_arquivo}`).expect(200);
  });

  it('recebe PDF', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', Buffer.from('conteudo-pdf'), { filename: 'qr.pdf', contentType: 'application/pdf' })
      .expect(200);
    expect(res.body.imagem_arquivo).toMatch(/\.pdf$/);
  });

  it('recusa formato não suportado', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(res.body.erro).toMatch(/Formato não suportado/);
  });

  it('recusa quando nenhum arquivo é enviado', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http.post(`/api/qrcodes/${qr.id}/imagem`).expect(400);
    expect(res.body.erro).toMatch(/Nenhum arquivo/);
  });

  it('troca o arquivo e apaga o antigo do disco', async () => {
    const qr = await criarQrcode();
    const primeiro = (
      await ctx.http
        .post(`/api/qrcodes/${qr.id}/imagem`)
        .attach('imagem', Buffer.from('a'), { filename: 'a.png', contentType: 'image/png' })
    ).body.imagem_arquivo;
    const segundo = (
      await ctx.http
        .post(`/api/qrcodes/${qr.id}/imagem`)
        .attach('imagem', Buffer.from('b'), { filename: 'b.png', contentType: 'image/png' })
    ).body.imagem_arquivo;
    expect(existsSync(path.join(ctx.dataDir, 'uploads', primeiro))).toBe(false);
    expect(existsSync(path.join(ctx.dataDir, 'uploads', segundo))).toBe(true);
  });

  it('remove o arquivo', async () => {
    const qr = await criarQrcode();
    const { imagem_arquivo } = (
      await ctx.http
        .post(`/api/qrcodes/${qr.id}/imagem`)
        .attach('imagem', Buffer.from('a'), { filename: 'a.png', contentType: 'image/png' })
    ).body;
    const res = await ctx.http.delete(`/api/qrcodes/${qr.id}/imagem`).expect(200);
    expect(res.body.imagem_arquivo).toBeNull();
    expect(existsSync(path.join(ctx.dataDir, 'uploads', imagem_arquivo))).toBe(false);
  });

  it('exclui o QR code e apaga o arquivo do disco', async () => {
    const qr = await criarQrcode();
    const { imagem_arquivo } = (
      await ctx.http
        .post(`/api/qrcodes/${qr.id}/imagem`)
        .attach('imagem', Buffer.from('a'), { filename: 'a.png', contentType: 'image/png' })
    ).body;
    await ctx.http.delete(`/api/qrcodes/${qr.id}`).expect(204);
    await ctx.http.get(`/api/qrcodes/${qr.id}`).expect(404);
    expect(existsSync(path.join(ctx.dataDir, 'uploads', imagem_arquivo))).toBe(false);
  });

  it('responde 404 ao excluir id inexistente', async () => {
    await ctx.http.delete('/api/qrcodes/999').expect(404);
  });
});
