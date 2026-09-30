# QR Code: remover destino atual + criar cliente na hora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o campo `destino_atual` (e o histórico de mudanças dele) do módulo de QR Codes, deixando só cadastro + imagem; e permitir criar um cliente novo direto no formulário de QR code, igual já existe no Funil.

**Architecture:** `destino_atual`/`qrcodes_historico` somem do schema, repo, rotas e telas. `POST /api/qrcodes` ganha o mesmo branch de `corpo.novo_cliente` que `routes/projetos.js` já usa: valida com `REGRAS_CLIENTE`, cria cliente + QR code numa transação. `FormQRCode.jsx` ganha a opção "+ Novo cliente", replicando `FormOportunidade.jsx`.

**Tech Stack:** Express + `node:sqlite`, React 19, Vitest/Testing Library — mesmo stack do restante do projeto.

Spec completa: [[2026-09-30-qrcode-sem-destino-novo-cliente-design]].

## Global Constraints

- A migration apaga permanentemente `destino_atual` de todo QR code existente e toda a tabela `qrcodes_historico` — sem backup, decisão já validada com o Lucca.
- O padrão de "+ Novo cliente" replica exatamente `FormOportunidade.jsx` + `routes/projetos.js` (erros do cliente novo prefixados com `novo_cliente.`).

---

## Task 1: Backend — remove destino_atual/histórico, adiciona criação de cliente inline

**Files:**
- Create: `server/db/migrations/007_qrcodes_sem_destino.sql`
- Modify: `server/repos/qrcodes.js`
- Modify: `server/routes/qrcodes.js`
- Modify: `server/routes/qrcodes.test.js`
- Modify: `server/routes/clientes.test.js`

**Interfaces:**
- Consumes: `REGRAS_CLIENTE` de `server/routes/clientes.js`; `emTransacao` de `server/repos/crud.js` (mesmo par usado em `server/routes/projetos.js`).
- Produces: `POST /api/qrcodes` aceita `{ novo_cliente: { nome } }` no lugar de `cliente_id`. Nenhuma resposta de `/api/qrcodes*` inclui mais `destino_atual` ou `historico`.

- [ ] **Step 1: Escrever os testes (atualizando os existentes e adicionando os novos)**

Substituir o conteúdo completo de `server/routes/qrcodes.test.js`:

```js
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

  it('exige nome e categoria válida', async () => {
    const res = await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: cliente.id, categoria: 'invalida' })
      .expect(400);
    expect(res.body.erros).toEqual(
      expect.arrayContaining([
        { campo: 'nome', mensagem: 'Obrigatório' },
        { campo: 'categoria', mensagem: 'Valor inválido: invalida' },
      ]),
    );
  });

  it('recusa cliente_id inexistente', async () => {
    const res = await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: 999, nome: 'QR', categoria: 'cardapio' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
  });

  it('cria QR code junto com um cliente novo', async () => {
    const res = await ctx.http
      .post('/api/qrcodes')
      .send({ novo_cliente: { nome: 'Bruno' }, nome: 'QR do Bruno', categoria: 'cardapio' })
      .expect(201);
    expect(res.body).toMatchObject({ nome: 'QR do Bruno', categoria: 'cardapio' });
    const clientes = await ctx.http.get('/api/clientes').expect(200);
    const bruno = clientes.body.find((c) => c.nome === 'Bruno');
    expect(bruno).toBeDefined();
    expect(res.body.cliente_id).toBe(bruno.id);
  });

  it('prefixa erros do cliente novo com novo_cliente.', async () => {
    const res = await ctx.http
      .post('/api/qrcodes')
      .send({ novo_cliente: { nome: '' }, nome: 'QR', categoria: 'cardapio' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'novo_cliente.nome', mensagem: 'Obrigatório' }]);
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

  it('responde 404 para id inexistente ou inválido', async () => {
    await ctx.http.get('/api/qrcodes/999').expect(404);
    await ctx.http.get('/api/qrcodes/abc').expect(404);
  });

  it('atualiza campos', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http.put(`/api/qrcodes/${qr.id}`).send({ nome: 'Novo nome' }).expect(200);
    expect(res.body).toMatchObject({ nome: 'Novo nome' });
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
```

Em `server/routes/clientes.test.js`, trocar a linha 46:

```js
      .send({ cliente_id: cliente.id, nome: 'QR balcão', categoria: 'cardapio', destino_atual: 'https://x.com' })
```

por:

```js
      .send({ cliente_id: cliente.id, nome: 'QR balcão', categoria: 'cardapio' })
```

E a linha 74:

```js
      .send({ cliente_id: comQr.id, nome: 'QR', categoria: 'cardapio', destino_atual: 'https://x.com' })
```

por:

```js
      .send({ cliente_id: comQr.id, nome: 'QR', categoria: 'cardapio' })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run server/routes/qrcodes.test.js server/routes/clientes.test.js`
Expected: FAIL — quase todos os testes falham, não só os dois novos. O backend antigo ainda exige `destino_atual` (`REGRAS_QRCODE` tem `obrigatorio: true`), e os testes atualizados não mandam mais esse campo, então até a função auxiliar `criarQrcode()` (usada por quase todo teste) quebra com 400 em vez do 201 esperado. Isso é esperado nesse ponto — os testes já refletem o estado final, o backend ainda não foi atualizado (Steps 3–5).

- [ ] **Step 3: Criar a migração**

Criar `server/db/migrations/007_qrcodes_sem_destino.sql`:

```sql
DROP TABLE qrcodes_historico;
ALTER TABLE qrcodes DROP COLUMN destino_atual;
```

- [ ] **Step 4: Simplificar o repo**

Substituir o conteúdo completo de `server/repos/qrcodes.js`:

```js
import { criarRepo } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'imagem_arquivo', 'status'];

export function repoQrcodes(db) {
  const base = criarRepo(db, 'qrcodes', CAMPOS_QRCODE);
  return {
    ...base,
    listar({ cliente_id, status } = {}) {
      const filtro = {};
      if (cliente_id) filtro.cliente_id = Number(cliente_id);
      if (status) filtro.status = status;
      return base.listar(filtro, 'nome COLLATE NOCASE');
    },
  };
}
```

- [ ] **Step 5: Atualizar as rotas**

Substituir o conteúdo completo de `server/routes/qrcodes.js`:

```js
import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { repoQrcodes } from '../repos/qrcodes.js';
import { repoClientes } from '../repos/clientes.js';
import { emTransacao } from '../repos/crud.js';
import { criarUpload } from '../http/upload.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { REGRAS_CLIENTE } from './clientes.js';

const CATEGORIAS_QR = ['avaliacao', 'cardapio'];
const STATUS_QR = ['ativo', 'arquivado'];
const EXTENSOES_QR = { 'image/png': '.png', 'application/pdf': '.pdf' };

export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: CATEGORIAS_QR, obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  status: { tipo: 'enum', valores: STATUS_QR, padrao: 'ativo' },
};

export function rotasQrcodes({ db, dataDir }) {
  const qrcodes = repoQrcodes(db);
  const clientes = repoClientes(db);
  const upload = criarUpload(dataDir, EXTENSOES_QR);
  const r = Router();

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  function apagarArquivo(nomeArquivo) {
    if (nomeArquivo) rmSync(path.join(dataDir, 'uploads', nomeArquivo), { force: true });
  }

  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });

  r.post('/qrcodes', (req, res) => {
    const corpo = req.body ?? {};
    if (corpo.novo_cliente) {
      let dadosCliente;
      try {
        dadosCliente = validar(corpo.novo_cliente, REGRAS_CLIENTE);
      } catch (erro) {
        if (!(erro instanceof ErroValidacao)) throw erro;
        throw new ErroValidacao(erro.erros.map((e) => ({ ...e, campo: `novo_cliente.${e.campo}` })));
      }
      const { cliente_id: _ignorado, ...regrasSemCliente } = REGRAS_QRCODE;
      const dados = validar(corpo, regrasSemCliente);
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        return qrcodes.criar({ ...dados, cliente_id: cliente.id });
      });
      return res.status(201).json(criado);
    }
    const dados = validar(corpo, REGRAS_QRCODE);
    exigirCliente(dados.cliente_id);
    res.status(201).json(qrcodes.criar(dados));
  });

  r.get('/qrcodes/:id', (req, res) => {
    const qrcode = qrcodes.obter(lerId(req.params.id));
    if (!qrcode) throw naoEncontrado('QR code');
    res.json(qrcode);
  });

  r.put('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_QRCODE, { parcial: true });
    if (dados.cliente_id !== undefined) exigirCliente(dados.cliente_id);
    const atualizado = qrcodes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('QR code');
    res.json(atualizado);
  });

  r.post('/qrcodes/:id/imagem', upload.single('imagem'), (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    if (!req.file) throw new ErroHttp(400, 'Nenhum arquivo enviado');
    apagarArquivo(qrcode.imagem_arquivo);
    res.json(qrcodes.atualizar(id, { imagem_arquivo: req.file.filename }));
  });

  r.delete('/qrcodes/:id/imagem', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    res.json(qrcodes.atualizar(id, { imagem_arquivo: null }));
  });

  r.delete('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.remover(id);
    res.status(204).end();
  });

  return r;
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `npx vitest run server/routes/qrcodes.test.js server/routes/clientes.test.js`
Expected: PASS em todos.

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/007_qrcodes_sem_destino.sql server/repos/qrcodes.js server/routes/qrcodes.js server/routes/qrcodes.test.js server/routes/clientes.test.js
git commit -m "feat: remove destino_atual/histórico do QR code e permite criar cliente na hora"
```

---

## Task 2: Frontend — formulário de QR code (sem destino, com "+ Novo cliente") e listagem

**Files:**
- Modify: `web/src/components/FormQRCode.jsx`
- Modify: `web/src/pages/QRCodes.jsx`
- Modify: `web/src/pages/QRCodes.test.jsx`

**Interfaces:**
- Consumes: `POST /api/qrcodes` aceitando `{ novo_cliente: { nome } }` (Task 1).
- Produces: `FormQRCode` chama `onSalvar` com `{ novo_cliente: { nome } }` no lugar de `cliente_id` quando "+ Novo cliente" está selecionado; nunca mais manda `destino_atual`.

- [ ] **Step 1: Escrever os testes falhando**

Substituir o conteúdo completo de `web/src/pages/QRCodes.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRCodes } from './QRCodes.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Ana' };
const qr = {
  id: 5, cliente_id: 1, nome: 'QR balcão', categoria: 'cardapio', descricao_local: null,
  imagem_arquivo: null, status: 'ativo',
};

describe('QRCodes', () => {
  it('lista os QR codes', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes?': [qr] });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    expect(await screen.findByRole('link', { name: 'QR balcão' })).toHaveAttribute('href', '/qrcodes/5');
    const tabela = within(screen.getByRole('table'));
    expect(tabela.getByText('Ana')).toBeInTheDocument();
    expect(tabela.getByText('Cardápio')).toBeInTheDocument();
  });

  it('filtra por cliente', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes?': [qr],
      'GET /qrcodes?cliente_id=1': [qr],
    });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    await screen.findByRole('link', { name: 'QR balcão' });
    await userEvent.setup().selectOptions(screen.getByLabelText('Filtrar por cliente'), '1');
    await screen.findByRole('link', { name: 'QR balcão' });
    expect(chamadas.at(-1).caminho).toBe('/qrcodes?cliente_id=1');
  });

  it('cria e navega para o detalhe', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes?': [],
      'POST /qrcodes': { ...qr, id: 9 },
    });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ QR Code' }));
    await user.selectOptions(screen.getByLabelText('Cliente'), '1');
    await user.type(screen.getByLabelText('Nome'), 'QR balcão');
    await user.click(screen.getByRole('button', { name: 'Criar QR Code' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      cliente_id: 1, nome: 'QR balcão', categoria: 'avaliacao',
    });
  });

  it('cria QR code com cliente novo', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes?': [],
      'POST /qrcodes': { ...qr, id: 9, cliente_id: 3 },
    });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ QR Code' }));
    await user.selectOptions(screen.getByLabelText('Cliente'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo cliente'), 'Diego');
    await user.type(screen.getByLabelText('Nome'), 'QR balcão');
    await user.click(screen.getByRole('button', { name: 'Criar QR Code' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      novo_cliente: { nome: 'Diego' }, nome: 'QR balcão', categoria: 'avaliacao',
    });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run web/src/pages/QRCodes.test.jsx`
Expected: FAIL — só o teste `cria QR code com cliente novo` falha (`selectOptions(..., 'novo')` não encontra essa opção, porque `FormQRCode.jsx` ainda não tem "+ Novo cliente"). Os outros 3 continuam passando nesse ponto — o backend da Task 1 já ignora `destino_atual` mesmo que o form antigo ainda mande, e o teste `cria e navega para o detalhe` não verifica mais esse campo.

- [ ] **Step 3: Atualizar `FormQRCode.jsx`**

Substituir o conteúdo completo de `web/src/components/FormQRCode.jsx`:

```jsx
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { CATEGORIAS_QR, ROTULO_CATEGORIA_QR, STATUS_QR, ROTULO_STATUS_QR } from '../lib/rotulos.js';

export function FormQRCode({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const editando = Boolean(inicial.id);
  const { valores, campo } = useFormulario({
    cliente_id: inicial.cliente_id ? String(inicial.cliente_id) : '',
    novo_cliente_nome: '',
    nome: inicial.nome ?? '',
    categoria: inicial.categoria ?? CATEGORIAS_QR[0],
    descricao_local: inicial.descricao_local ?? '',
    status: inicial.status ?? 'ativo',
  });
  const { erros, erro, enviando, executar } = useEnvio();
  const clienteNovo = valores.cliente_id === 'novo';

  function enviar(e) {
    e.preventDefault();
    const corpo = { ...valores };
    delete corpo.novo_cliente_nome;
    if (clienteNovo) {
      delete corpo.cliente_id;
      corpo.novo_cliente = { nome: valores.novo_cliente_nome };
    } else {
      corpo.cliente_id = valores.cliente_id ? Number(valores.cliente_id) : null;
    }
    if (!editando) delete corpo.status;
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
        <select {...campo('cliente_id')}>
          <option value="">Selecione…</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="novo">+ Novo cliente</option>
        </select>
      </Campo>
      {clienteNovo && (
        <Campo rotulo="Nome do novo cliente" nome="novo_cliente.nome" erros={erros} {...campo('novo_cliente_nome')} />
      )}
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Categoria" nome="categoria" erros={erros}>
        <select {...campo('categoria')}>
          {CATEGORIAS_QR.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA_QR[c]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Local de aplicação" nome="descricao_local" erros={erros}>
        <textarea rows={2} {...campo('descricao_local')} />
      </Campo>
      {editando && (
        <Campo rotulo="Status" nome="status" erros={erros}>
          <select {...campo('status')}>
            {STATUS_QR.map((s) => <option key={s} value={s}>{ROTULO_STATUS_QR[s]}</option>)}
          </select>
        </Campo>
      )}
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Remover a coluna "Destino atual" da listagem**

Em `web/src/pages/QRCodes.jsx`, trocar:

```jsx
          <thead><tr><th>Nome</th><th>Cliente</th><th>Categoria</th><th>Destino atual</th><th>Status</th></tr></thead>
          <tbody>
            {qrcodes.map((q) => (
              <tr key={q.id}>
                <td><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></td>
                <td>{nomeCliente(q.cliente_id)}</td>
                <td>{ROTULO_CATEGORIA_QR[q.categoria]}</td>
                <td>{q.destino_atual}</td>
                <td>{ROTULO_STATUS_QR[q.status]}</td>
              </tr>
            ))}
```

por:

```jsx
          <thead><tr><th>Nome</th><th>Cliente</th><th>Categoria</th><th>Status</th></tr></thead>
          <tbody>
            {qrcodes.map((q) => (
              <tr key={q.id}>
                <td><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></td>
                <td>{nomeCliente(q.cliente_id)}</td>
                <td>{ROTULO_CATEGORIA_QR[q.categoria]}</td>
                <td>{ROTULO_STATUS_QR[q.status]}</td>
              </tr>
            ))}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run web/src/pages/QRCodes.test.jsx`
Expected: PASS em todos (4 testes).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/FormQRCode.jsx web/src/pages/QRCodes.jsx web/src/pages/QRCodes.test.jsx
git commit -m "feat: formulário de QR code sem destino atual, com opção de criar cliente na hora"
```

---

## Task 3: Frontend — remove o cartão de histórico do detalhe do QR code

**Files:**
- Modify: `web/src/pages/QRCodeDetalhe.jsx`
- Modify: `web/src/pages/QRCodeDetalhe.test.jsx`

**Interfaces:**
- Consumes: `FormQRCode` sem o campo "Destino atual" (Task 2); `GET /api/qrcodes/:id` sem `historico` (Task 1).

- [ ] **Step 1: Escrever os testes falhando**

Substituir o conteúdo completo de `web/src/pages/QRCodeDetalhe.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRCodeDetalhe } from './QRCodeDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Ana' };
const qr = {
  id: 5, cliente_id: 1, nome: 'QR balcão', categoria: 'cardapio', descricao_local: 'Porta de entrada',
  imagem_arquivo: null, status: 'ativo', atualizado_em: 'T1',
};

describe('QRCodeDetalhe', () => {
  it('mostra os dados', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': qr });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    expect(await screen.findByDisplayValue('QR balcão')).toBeInTheDocument();
  });

  it('edita o nome', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': qr,
      'PUT /qrcodes/5': { ...qr, nome: 'QR balcão novo' },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    const user = userEvent.setup();
    const campo = await screen.findByLabelText('Nome');
    await user.clear(campo);
    await user.type(campo, 'QR balcão novo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByDisplayValue('QR balcão novo');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ nome: 'QR balcão novo' });
  });

  it('exclui com confirmação e volta pra lista', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': qr, 'DELETE /qrcodes/5': resposta(204, null) });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
  });

  it('upload de PNG mostra preview de imagem', async () => {
    mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': qr,
      'POST /qrcodes/5/imagem': { ...qr, imagem_arquivo: 'abc.png' },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    const arquivo = new File(['x'], 'qr.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Adicionar arquivo'), { target: { files: [arquivo] } });
    expect(await screen.findByAltText('Arquivo do QR code')).toHaveAttribute('src', '/uploads/abc.png');
  });

  it('upload de PDF mostra preview embutido', async () => {
    mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': qr,
      'POST /qrcodes/5/imagem': { ...qr, imagem_arquivo: 'abc.pdf' },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    const arquivo = new File(['x'], 'qr.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByLabelText('Adicionar arquivo'), { target: { files: [arquivo] } });
    expect(await screen.findByTitle('Arquivo do QR code')).toHaveAttribute('src', '/uploads/abc.pdf');
  });

  it('remove o arquivo', async () => {
    const comImagem = { ...qr, imagem_arquivo: 'abc.png' };
    mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': comImagem,
      'DELETE /qrcodes/5/imagem': { ...qr, imagem_arquivo: null },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover arquivo' }));
    await screen.findByLabelText('Adicionar arquivo');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run web/src/pages/QRCodeDetalhe.test.jsx`
Expected: FAIL em todos os testes do arquivo. O cartão de histórico ainda no componente acessa `qrcode.historico.length`, mas a API (já atualizada na Task 1) não manda mais `historico` — isso lança `TypeError: Cannot read properties of undefined (reading 'length')` e quebra a renderização em qualquer teste que monte `<QRCodeDetalhe />`.

- [ ] **Step 3: Remover o cartão de histórico**

Em `web/src/pages/QRCodeDetalhe.jsx`, remover o bloco:

```jsx
        <div className="cartao">
          <h2>Histórico de redirecionamento</h2>
          {qrcode.historico.length ? (
            <ul className="lista">
              {qrcode.historico.map((h) => (
                <li key={h.id}>
                  <span>{h.destino_anterior ?? '—'}</span> → <span>{h.destino_novo}</span>{' '}
                  <span className="etiqueta">{new Date(h.alterado_em).toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          ) : <p className="vazio">Nenhuma alteração de destino ainda.</p>}
        </div>
```

(Esse bloco é o último `<div className="cartao">` dentro do `<div className="grade-2">`, logo antes dos dois fechamentos `</div>` finais.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run web/src/pages/QRCodeDetalhe.test.jsx`
Expected: PASS em todos (6 testes).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npx vitest run`
Expected: PASS em tudo (server + web).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/QRCodeDetalhe.jsx web/src/pages/QRCodeDetalhe.test.jsx
git commit -m "feat: remove cartão de histórico de redirecionamento do detalhe do QR code"
```
