import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

async function criarCliente(dados = { nome: 'Ana Souza', empresa: 'Doces da Ana' }) {
  return (await ctx.http.post('/api/clientes').send(dados).expect(201)).body;
}

function criarRepoGitFalso() {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const remoto = mkdtempSync(path.join(os.tmpdir(), 'crm-remoto-'));
  git(remoto, 'init', '--bare', '-b', 'main');
  const repo = mkdtempSync(path.join(os.tmpdir(), 'crm-git-'));
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Teste');
  git(repo, 'config', 'user.email', 'teste@example.com');
  writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(repo, 'README.md'), 'x');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'inicial');
  git(repo, 'remote', 'add', 'origin', remoto);
  git(repo, 'push', '-u', 'origin', 'main');
  return repo;
}

describe('/api/clientes', () => {
  it('cria e busca clientes por nome, empresa ou email', async () => {
    await criarCliente();
    await criarCliente({ nome: 'Bruno', email: 'bruno@x.com' });
    expect((await ctx.http.get('/api/clientes').expect(200)).body).toHaveLength(2);
    const busca = await ctx.http.get('/api/clientes?busca=doces').expect(200);
    expect(busca.body.map((c) => c.nome)).toEqual(['Ana Souza']);
  });

  it('exige nome', async () => {
    const res = await ctx.http.post('/api/clientes').send({ empresa: 'X' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
  });

  it('detalhe traz projetos e total faturado (só parcelas pagas)', async () => {
    const cliente = await criarCliente();
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201)).body;
    const agora = new Date().toISOString();
    const inserir = ctx.db.prepare(
      'INSERT INTO parcelas (projeto_id, valor_centavos, vencimento, pago_em, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)',
    );
    inserir.run(projeto.id, 1500, '2026-09-01', '2026-09-02', agora, agora);
    inserir.run(projeto.id, 9999, '2026-10-01', null, agora, agora);

    const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
    expect(res.body.total_faturado_centavos).toBe(1500);
    expect(res.body.projetos.map((p) => p.titulo)).toEqual(['Site']);
  });

  it('detalhe traz os qrcodes do cliente', async () => {
    const cliente = await criarCliente();
    await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: cliente.id, nome: 'QR balcão', categoria: 'cardapio' })
      .expect(201);
    const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
    expect(res.body.qrcodes.map((q) => q.nome)).toEqual(['QR balcão']);
  });

  it('atualiza parcialmente', async () => {
    const cliente = await criarCliente();
    const res = await ctx.http.put(`/api/clientes/${cliente.id}`).send({ telefone: '11 99999-0000' }).expect(200);
    expect(res.body).toMatchObject({ nome: 'Ana Souza', telefone: '11 99999-0000' });
  });

  it('não exclui cliente com projetos (409) e exclui cliente sem projetos', async () => {
    const comProjeto = await criarCliente();
    await ctx.http.post('/api/projetos').send({ cliente_id: comProjeto.id, titulo: 'Site' }).expect(201);
    const res = await ctx.http.delete(`/api/clientes/${comProjeto.id}`).expect(409);
    expect(res.body.erro).toMatch(/projetos/);
    await ctx.http.get(`/api/clientes/${comProjeto.id}`).expect(200);

    const semProjeto = await criarCliente({ nome: 'Carla' });
    await ctx.http.delete(`/api/clientes/${semProjeto.id}`).expect(204);
    await ctx.http.get(`/api/clientes/${semProjeto.id}`).expect(404);
  });

  it('não exclui cliente com QR codes (409)', async () => {
    const comQr = await criarCliente({ nome: 'Com QR' });
    await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: comQr.id, nome: 'QR', categoria: 'cardapio' })
      .expect(201);
    const res = await ctx.http.delete(`/api/clientes/${comQr.id}`).expect(409);
    expect(res.body.erro).toMatch(/QR codes/);
  });

  it('responde 404 para id inexistente ou inválido', async () => {
    await ctx.http.get('/api/clientes/999').expect(404);
    await ctx.http.get('/api/clientes/abc').expect(404);
  });

  it('gera pix_copia_cola quando a chave Pix está completa', async () => {
    const cliente = await criarCliente({
      nome: 'Ana Souza',
      empresa: 'Doces da Ana',
      chave_pix: 'ana@doces.com',
      tipo_chave_pix: 'email',
      cidade: 'Sao Paulo',
    });
    const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
    expect(res.body.pix_copia_cola).toContain('ana@doces.com');
  });

  it('pix_copia_cola é null quando o cliente não tem chave Pix', async () => {
    const cliente = await criarCliente();
    const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
    expect(res.body.pix_copia_cola).toBeNull();
  });

  it('exige tipo e cidade quando a chave Pix é informada', async () => {
    const res = await ctx.http
      .post('/api/clientes')
      .send({ nome: 'Bia', chave_pix: 'bia@x.com' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'chave_pix', mensagem: 'Informe tipo de chave e cidade' }]);
  });

  it('exige cidade ao completar a chave Pix via atualização parcial', async () => {
    const cliente = await criarCliente();
    const res = await ctx.http
      .put(`/api/clientes/${cliente.id}`)
      .send({ chave_pix: 'bia@x.com', tipo_chave_pix: 'email' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'chave_pix', mensagem: 'Informe tipo de chave e cidade' }]);
  });

  describe('publicar-pix', () => {
    it('exige chave Pix cadastrada', async () => {
      const cliente = await criarCliente();
      const res = await ctx.http.post(`/api/clientes/${cliente.id}/publicar-pix`).expect(400);
      expect(res.body.erro).toMatch(/Cadastre a chave Pix/);
    });

    it('exige portfolio_repo_path configurado', async () => {
      const cliente = await criarCliente({
        nome: 'Ana', empresa: 'Doces da Ana', chave_pix: 'ana@doces.com', tipo_chave_pix: 'email', cidade: 'Sao Paulo',
      });
      const res = await ctx.http.post(`/api/clientes/${cliente.id}/publicar-pix`).expect(400);
      expect(res.body.erro).toMatch(/Configure o caminho/);
    });

    it('grava src/data/pix.json no repo e comita', async () => {
      const repo = criarRepoGitFalso();
      await ctx.http.put('/api/config').send({ portfolio_repo_path: repo }).expect(200);
      const cliente = await criarCliente({
        nome: 'Ana', empresa: 'Doces da Ana', chave_pix: 'ana@doces.com', tipo_chave_pix: 'email', cidade: 'Sao Paulo',
      });

      const res = await ctx.http.post(`/api/clientes/${cliente.id}/publicar-pix`).expect(200);
      expect(res.body.commitado).toBe(true);
      expect(res.body.url).toBeNull();

      const pix = JSON.parse(readFileSync(path.join(repo, 'src/data/pix.json'), 'utf8'));
      expect(pix[String(cliente.id)].nome).toBe('Doces da Ana');
      expect(pix[String(cliente.id)].codigo).toContain('ana@doces.com');
    });

    it('devolve a URL completa quando portfolio_site_url está configurada', async () => {
      const repo = criarRepoGitFalso();
      await ctx.http.put('/api/config').send({ portfolio_repo_path: repo, portfolio_site_url: 'https://luccasmadia.com.br' }).expect(200);
      const cliente = await criarCliente({
        nome: 'Ana', empresa: 'Doces da Ana', chave_pix: 'ana@doces.com', tipo_chave_pix: 'email', cidade: 'Sao Paulo',
      });

      const res = await ctx.http.post(`/api/clientes/${cliente.id}/publicar-pix`).expect(200);
      expect(res.body.url).toBe(`https://luccasmadia.com.br/pix/${cliente.id}`);
    });
  });
});
