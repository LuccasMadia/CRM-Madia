# Controle de QR Codes (Canva) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Lucca um cadastro dentro do CRM-Madia para controlar manualmente os QR codes dinâmicos criados no Canva Pro+: para onde cada um aponta hoje, histórico de quando o destino mudou, e um arquivo (PNG ou PDF) de referência por QR code.

**Architecture:** Segue exatamente os padrões já usados no projeto — SQLite puro (`node:sqlite`) com migrations incrementais, repo genérico (`criarRepo`) mais métodos customizados, rotas Express testadas via `supertest` (`ctx.http`), e páginas React com `useCarregar`/`useEnvio`/`useFormulario` + componentes `Campo`/`Aviso`/`Modal`. Upload reaproveita `server/http/upload.js`, generalizado para aceitar um mapa de extensões diferente do já usado no portfólio.

**Tech Stack:** Node (`node:sqlite`, Express, Multer), React 19 + react-router, Vitest + Testing Library + Supertest.

## Global Constraints

- Backend é testado só via rotas HTTP com `ctx.http` (supertest) — sem testes unitários de repo isolados; é o padrão já usado em todo o projeto (nenhum arquivo em `server/repos/*.test.js` existe hoje).
- Todo QR code pertence a um cliente (`cliente_id` obrigatório); não há vínculo com projeto (spec, seção "Escopo"/"Fora de escopo").
- Histórico de redirecionamento só é gerado quando `destino_atual` muda; nenhum outro campo gera histórico (spec, seção "Escopo").
- Upload de QR code aceita só PNG e PDF, até 10 MB — diferente do upload de portfólio (PNG/JPG/WEBP), que continua como está (spec, seção "Modelo de dados"/"Backend").
- Não existe integração automática com o Canva — toda a Connect API pública foi checada e não expõe QR codes nem Insights; cadastro e atualização de destino são sempre manuais (spec, seção "Contexto").
- Seguir as convenções de nomes em português já usadas no projeto (arquivos, variáveis, mensagens de erro, rótulos).

---

### Task 1: Migration + repo `qrcodes` + rotas de criação/listagem/detalhe

**Files:**
- Create: `server/db/migrations/005_qrcodes.sql`
- Create: `server/repos/qrcodes.js`
- Create: `server/routes/qrcodes.js`
- Modify: `server/app.js`
- Create: `server/routes/qrcodes.test.js`

**Interfaces:**
- Produces: `repoQrcodes(db)` retornando `{ obter(id), listar({cliente_id, status}), criar(dados), atualizar(id, dados), remover(id), historico(qrcodeId) }` (de `server/repos/qrcodes.js`) — consumido pelas Tasks 2-5.
- Produces: `rotasQrcodes({ db })` (de `server/routes/qrcodes.js`), montado em `/api` — rotas `GET /qrcodes`, `POST /qrcodes`, `GET /qrcodes/:id`. Consumido pelas Tasks 2-4 (mesma função, assinatura evolui para `{ db, dataDir }` na Task 3).
- Produces: `REGRAS_QRCODE` exportado de `server/routes/qrcodes.js` — consumido pela Task 2 (rota PUT).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `server/routes/qrcodes.test.js`:

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/qrcodes.test.js`
Esperado: FAIL — `Cannot find module '../repos/qrcodes.js'` (o arquivo ainda não existe).

- [ ] **Step 3: Criar a migration**

Criar `server/db/migrations/005_qrcodes.sql`:

```sql
CREATE TABLE qrcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro')),
  descricao_local TEXT,
  destino_atual TEXT NOT NULL,
  imagem_arquivo TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE qrcodes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qrcode_id INTEGER NOT NULL REFERENCES qrcodes(id),
  destino_anterior TEXT,
  destino_novo TEXT NOT NULL,
  alterado_em TEXT NOT NULL
);
```

- [ ] **Step 4: Criar o repo**

Criar `server/repos/qrcodes.js`:

```js
import { criarRepo, linha } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'destino_atual', 'imagem_arquivo', 'status'];

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
    historico(qrcodeId) {
      return db
        .prepare('SELECT * FROM qrcodes_historico WHERE qrcode_id = ? ORDER BY alterado_em DESC, id DESC')
        .all(qrcodeId)
        .map(linha);
    },
  };
}
```

- [ ] **Step 5: Criar as rotas**

Criar `server/routes/qrcodes.js`:

```js
import { Router } from 'express';
import { repoQrcodes } from '../repos/qrcodes.js';
import { repoClientes } from '../repos/clientes.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';

const CATEGORIAS_QR = ['adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro'];
const STATUS_QR = ['ativo', 'arquivado'];

export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: CATEGORIAS_QR, obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  destino_atual: { tipo: 'texto', obrigatorio: true },
  status: { tipo: 'enum', valores: STATUS_QR, padrao: 'ativo' },
};

export function rotasQrcodes({ db }) {
  const qrcodes = repoQrcodes(db);
  const clientes = repoClientes(db);
  const r = Router();

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });

  r.post('/qrcodes', (req, res) => {
    const dados = validar(req.body, REGRAS_QRCODE);
    exigirCliente(dados.cliente_id);
    res.status(201).json(qrcodes.criar(dados));
  });

  r.get('/qrcodes/:id', (req, res) => {
    const qrcode = qrcodes.obter(lerId(req.params.id));
    if (!qrcode) throw naoEncontrado('QR code');
    res.json({ ...qrcode, historico: qrcodes.historico(qrcode.id) });
  });

  return r;
}
```

- [ ] **Step 6: Registrar a rota em `app.js`**

Em `server/app.js`, adicionar o import junto dos outros:

```js
import { rotasQrcodes } from './routes/qrcodes.js';
```

E a montagem junto das outras (logo após `rotasPublicacao`):

```js
  app.use('/api', rotasPublicacao(ctx));
  app.use('/api', rotasQrcodes(ctx));
```

- [ ] **Step 7: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/qrcodes.test.js`
Esperado: PASS (6 testes).

- [ ] **Step 8: Commit**

```bash
git add server/db/migrations/005_qrcodes.sql server/repos/qrcodes.js server/routes/qrcodes.js server/app.js server/routes/qrcodes.test.js
git commit -m "feat: adiciona cadastro de QR codes (criação, listagem e detalhe)"
```

---

### Task 2: Edição (`PUT`) + histórico automático de redirecionamento

**Files:**
- Modify: `server/repos/qrcodes.js`
- Modify: `server/routes/qrcodes.js`
- Modify: `server/routes/qrcodes.test.js`

**Interfaces:**
- Consumes: `repoQrcodes(db)` e `rotasQrcodes({ db })` da Task 1.
- Produces: `repoQrcodes(db).atualizar(id, dados)` passa a gravar histórico quando `destino_atual` muda; `PUT /api/qrcodes/:id` novo; função interna `montar(id)` em `server/routes/qrcodes.js`, reutilizada pela Task 3.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar dentro do `describe('/api/qrcodes', ...)` em `server/routes/qrcodes.test.js`, depois do teste "responde 404...":

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/qrcodes.test.js`
Esperado: FAIL — `PUT /api/qrcodes/:id` não existe (404 em vez de 200 nos novos testes).

- [ ] **Step 3: Implementar o histórico no repo**

Em `server/repos/qrcodes.js`, trocar o `return` para incluir `atualizar` customizado (arquivo completo):

```js
import { criarRepo, linha } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'destino_atual', 'imagem_arquivo', 'status'];

export function repoQrcodes(db) {
  const base = criarRepo(db, 'qrcodes', CAMPOS_QRCODE);

  function atualizar(id, dados) {
    const atual = base.obter(id);
    if (!atual) return null;
    const registrarHistorico = 'destino_atual' in dados && dados.destino_atual !== atual.destino_atual;
    const atualizado = base.atualizar(id, dados);
    if (registrarHistorico) {
      db.prepare(
        'INSERT INTO qrcodes_historico (qrcode_id, destino_anterior, destino_novo, alterado_em) VALUES (?, ?, ?, ?)',
      ).run(id, atual.destino_atual, dados.destino_atual, new Date().toISOString());
    }
    return atualizado;
  }

  return {
    ...base,
    atualizar,
    listar({ cliente_id, status } = {}) {
      const filtro = {};
      if (cliente_id) filtro.cliente_id = Number(cliente_id);
      if (status) filtro.status = status;
      return base.listar(filtro, 'nome COLLATE NOCASE');
    },
    historico(qrcodeId) {
      return db
        .prepare('SELECT * FROM qrcodes_historico WHERE qrcode_id = ? ORDER BY alterado_em DESC, id DESC')
        .all(qrcodeId)
        .map(linha);
    },
  };
}
```

- [ ] **Step 4: Adicionar a rota `PUT` e o helper `montar`**

Em `server/routes/qrcodes.js`, adicionar a função `montar` (logo após `exigirCliente`) e usá-la nas rotas de leitura/escrita, e adicionar a rota `PUT`. Arquivo completo:

```js
import { Router } from 'express';
import { repoQrcodes } from '../repos/qrcodes.js';
import { repoClientes } from '../repos/clientes.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';

const CATEGORIAS_QR = ['adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro'];
const STATUS_QR = ['ativo', 'arquivado'];

export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: CATEGORIAS_QR, obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  destino_atual: { tipo: 'texto', obrigatorio: true },
  status: { tipo: 'enum', valores: STATUS_QR, padrao: 'ativo' },
};

export function rotasQrcodes({ db }) {
  const qrcodes = repoQrcodes(db);
  const clientes = repoClientes(db);
  const r = Router();

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  function montar(id) {
    return { ...qrcodes.obter(id), historico: qrcodes.historico(id) };
  }

  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });

  r.post('/qrcodes', (req, res) => {
    const dados = validar(req.body, REGRAS_QRCODE);
    exigirCliente(dados.cliente_id);
    const criado = qrcodes.criar(dados);
    res.status(201).json(montar(criado.id));
  });

  r.get('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!qrcodes.obter(id)) throw naoEncontrado('QR code');
    res.json(montar(id));
  });

  r.put('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_QRCODE, { parcial: true });
    if (dados.cliente_id !== undefined) exigirCliente(dados.cliente_id);
    const atualizado = qrcodes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('QR code');
    res.json(montar(id));
  });

  return r;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/qrcodes.test.js`
Esperado: PASS (11 testes).

- [ ] **Step 6: Commit**

```bash
git add server/repos/qrcodes.js server/routes/qrcodes.js server/routes/qrcodes.test.js
git commit -m "feat: edição de QR code com histórico automático de redirecionamento"
```

---

### Task 3: Upload de imagem/PDF do QR code

**Files:**
- Modify: `server/http/upload.js`
- Modify: `server/routes/qrcodes.js`
- Modify: `server/routes/qrcodes.test.js`

**Interfaces:**
- Consumes: `montar(id)` e `rotasQrcodes({ db })` da Task 2 (assinatura passa a ser `rotasQrcodes({ db, dataDir })`).
- Produces: `criarUpload(dataDir, extensoes = EXTENSOES_IMAGEM)` — segundo parâmetro opcional, retrocompatível com o uso existente em `server/routes/portfolio.js` (`criarUpload(dataDir)`). Rotas novas: `POST /api/qrcodes/:id/imagem`, `DELETE /api/qrcodes/:id/imagem`.

- [ ] **Step 1: Escrever os testes (falhando)**

No topo de `server/routes/qrcodes.test.js`, adicionar aos imports:

```js
import { existsSync } from 'node:fs';
import path from 'node:path';
```

E adicionar dentro do `describe('/api/qrcodes', ...)`, depois do teste "responde 404 ao atualizar...":

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/qrcodes.test.js`
Esperado: FAIL — `POST /api/qrcodes/:id/imagem` não existe (404).

- [ ] **Step 3: Generalizar `criarUpload`**

Em `server/http/upload.js`, arquivo completo:

```js
import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { ErroHttp } from './erros.js';

const EXTENSOES_IMAGEM = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

export function criarUpload(dataDir, extensoes = EXTENSOES_IMAGEM) {
  const destino = path.join(dataDir, 'uploads');
  mkdirSync(destino, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: destino,
      filename: (req, arquivo, cb) => cb(null, randomUUID() + extensoes[arquivo.mimetype]),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 20 },
    fileFilter: (req, arquivo, cb) =>
      extensoes[arquivo.mimetype]
        ? cb(null, true)
        : cb(new ErroHttp(400, `Formato não suportado: ${arquivo.originalname}`)),
  });
}

export function removerArquivos(arquivos = []) {
  for (const arquivo of arquivos) rmSync(arquivo.path, { force: true });
}
```

- [ ] **Step 4: Adicionar rotas de imagem em `qrcodes.js`**

Em `server/routes/qrcodes.js`, arquivo completo:

```js
import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { repoQrcodes } from '../repos/qrcodes.js';
import { repoClientes } from '../repos/clientes.js';
import { criarUpload } from '../http/upload.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

const CATEGORIAS_QR = ['adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro'];
const STATUS_QR = ['ativo', 'arquivado'];
const EXTENSOES_QR = { 'image/png': '.png', 'application/pdf': '.pdf' };

export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: CATEGORIAS_QR, obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  destino_atual: { tipo: 'texto', obrigatorio: true },
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

  function montar(id) {
    return { ...qrcodes.obter(id), historico: qrcodes.historico(id) };
  }

  function apagarArquivo(nomeArquivo) {
    if (nomeArquivo) rmSync(path.join(dataDir, 'uploads', nomeArquivo), { force: true });
  }

  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });

  r.post('/qrcodes', (req, res) => {
    const dados = validar(req.body, REGRAS_QRCODE);
    exigirCliente(dados.cliente_id);
    const criado = qrcodes.criar(dados);
    res.status(201).json(montar(criado.id));
  });

  r.get('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!qrcodes.obter(id)) throw naoEncontrado('QR code');
    res.json(montar(id));
  });

  r.put('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_QRCODE, { parcial: true });
    if (dados.cliente_id !== undefined) exigirCliente(dados.cliente_id);
    const atualizado = qrcodes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('QR code');
    res.json(montar(id));
  });

  r.post('/qrcodes/:id/imagem', upload.single('imagem'), (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    if (!req.file) throw new ErroHttp(400, 'Nenhum arquivo enviado');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.atualizar(id, { imagem_arquivo: req.file.filename });
    res.json(montar(id));
  });

  r.delete('/qrcodes/:id/imagem', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.atualizar(id, { imagem_arquivo: null });
    res.json(montar(id));
  });

  return r;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/qrcodes.test.js`
Esperado: PASS (17 testes).

- [ ] **Step 6: Rodar a suíte completa (regressão do upload do portfólio)**

Rodar: `npx vitest run server/routes/portfolio.test.js`
Esperado: PASS — a generalização de `criarUpload` não quebra o upload de imagens do portfólio.

- [ ] **Step 7: Commit**

```bash
git add server/http/upload.js server/routes/qrcodes.js server/routes/qrcodes.test.js
git commit -m "feat: upload de PNG/PDF por QR code"
```

---

### Task 4: Exclusão de QR code + bloqueio de exclusão de cliente com QR vinculado

**Files:**
- Modify: `server/routes/qrcodes.js`
- Modify: `server/repos/clientes.js`
- Modify: `server/routes/clientes.js`
- Modify: `server/routes/qrcodes.test.js`
- Modify: `server/routes/clientes.test.js`

**Interfaces:**
- Consumes: `apagarArquivo`, `montar` e `rotasQrcodes({ db, dataDir })` da Task 3; `repoClientes(db)` existente.
- Produces: `DELETE /api/qrcodes/:id`; `repoClientes(db).contarQrcodes(id)` (`number`), consumido só dentro de `server/routes/clientes.js`.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar em `server/routes/qrcodes.test.js`, dentro do `describe`, depois do teste "remove o arquivo":

```js
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
```

Adicionar em `server/routes/clientes.test.js`, dentro do `describe`, depois do teste "não exclui cliente com projetos...":

```js
  it('não exclui cliente com QR codes (409)', async () => {
    const comQr = await criarCliente({ nome: 'Com QR' });
    await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: comQr.id, nome: 'QR', categoria: 'adesivo', destino_atual: 'https://x.com' })
      .expect(201);
    const res = await ctx.http.delete(`/api/clientes/${comQr.id}`).expect(409);
    expect(res.body.erro).toMatch(/QR codes/);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/qrcodes.test.js server/routes/clientes.test.js`
Esperado: FAIL — `DELETE /api/qrcodes/:id` não existe (404 no lugar de 204); o teste de clientes falha porque a exclusão não é bloqueada (ou estoura a constraint de FK).

- [ ] **Step 3: Adicionar `DELETE /qrcodes/:id`**

Em `server/routes/qrcodes.js`, adicionar a rota logo depois de `DELETE /qrcodes/:id/imagem`:

```js
  r.delete('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.remover(id);
    res.status(204).end();
  });
```

(Adicionar antes do `return r;` final.)

- [ ] **Step 4: Adicionar `contarQrcodes` em `repoClientes`**

Em `server/repos/clientes.js`, adicionar o método logo depois de `contarProjetos`:

```js
    contarQrcodes(id) {
      return db.prepare('SELECT COUNT(*) AS n FROM qrcodes WHERE cliente_id = ?').get(id).n;
    },
```

- [ ] **Step 5: Bloquear exclusão em `server/routes/clientes.js`**

Em `server/routes/clientes.js`, no `r.delete('/:id', ...)`, adicionar a checagem logo depois da de projetos:

```js
  r.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (clientes.contarProjetos(id) > 0) {
      throw new ErroHttp(409, 'Este cliente tem projetos. Exclua ou mova os projetos antes de excluir o cliente.');
    }
    if (clientes.contarQrcodes(id) > 0) {
      throw new ErroHttp(409, 'Este cliente tem QR codes. Exclua-os antes de excluir o cliente.');
    }
    if (!clientes.remover(id)) throw naoEncontrado('Cliente');
    res.status(204).end();
  });
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/qrcodes.test.js server/routes/clientes.test.js`
Esperado: PASS (19 testes em `qrcodes.test.js`, 7 em `clientes.test.js`).

- [ ] **Step 7: Commit**

```bash
git add server/routes/qrcodes.js server/repos/clientes.js server/routes/clientes.js server/routes/qrcodes.test.js server/routes/clientes.test.js
git commit -m "feat: exclusão de QR code e bloqueio de exclusão de cliente com QR vinculado"
```

---

### Task 5: `GET /api/clientes/:id` inclui os QR codes do cliente

**Files:**
- Modify: `server/routes/clientes.js`
- Modify: `server/routes/clientes.test.js`

**Interfaces:**
- Consumes: `repoQrcodes(db).listar({ cliente_id })` da Task 1.
- Produces: `GET /api/clientes/:id` responde com campo adicional `qrcodes` (`array`), consumido pelo frontend na Task 11.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar em `server/routes/clientes.test.js`, dentro do `describe`, depois do teste "detalhe traz projetos e total faturado...":

```js
  it('detalhe traz os qrcodes do cliente', async () => {
    const cliente = await criarCliente();
    await ctx.http
      .post('/api/qrcodes')
      .send({ cliente_id: cliente.id, nome: 'QR balcão', categoria: 'adesivo', destino_atual: 'https://x.com' })
      .expect(201);
    const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
    expect(res.body.qrcodes.map((q) => q.nome)).toEqual(['QR balcão']);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/clientes.test.js -t "traz os qrcodes"`
Esperado: FAIL — `res.body.qrcodes` é `undefined`.

- [ ] **Step 3: Implementar**

Em `server/routes/clientes.js`, adicionar o import e instanciar o repo, e incluir o campo na resposta do detalhe:

```js
import { repoQrcodes } from '../repos/qrcodes.js';
```

```js
export function rotasClientes({ db }) {
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const qrcodes = repoQrcodes(db);
  const r = Router();
```

```js
  r.get('/:id', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json({
      ...cliente,
      projetos: projetos.listarComCliente({ cliente_id: cliente.id }),
      qrcodes: qrcodes.listar({ cliente_id: cliente.id }),
      total_faturado_centavos: clientes.totalFaturado(cliente.id),
    });
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/clientes.test.js`
Esperado: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add server/routes/clientes.js server/routes/clientes.test.js
git commit -m "feat: detalhe do cliente traz os QR codes vinculados"
```

---

### Task 6: Rótulos de categoria e status do QR code

**Files:**
- Modify: `web/src/lib/rotulos.js`
- Modify: `web/src/lib/rotulos.test.js`

**Interfaces:**
- Produces: `CATEGORIAS_QR` (`string[]`), `ROTULO_CATEGORIA_QR` (`Record<string,string>`), `STATUS_QR` (`string[]`), `ROTULO_STATUS_QR` (`Record<string,string>`), exportados de `web/src/lib/rotulos.js` — consumidos pelas Tasks 7-9.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar em `web/src/lib/rotulos.test.js`:

```js
import { CATEGORIAS_QR, ROTULO_CATEGORIA_QR, STATUS_QR, ROTULO_STATUS_QR } from './rotulos.js';

describe('rótulos de QR code', () => {
  it('toda categoria tem rótulo', () => {
    expect(CATEGORIAS_QR).toEqual(['adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro']);
    for (const c of CATEGORIAS_QR) expect(ROTULO_CATEGORIA_QR[c]).toBeTruthy();
  });

  it('status ativo e arquivado, nessa ordem', () => {
    expect(STATUS_QR).toEqual(['ativo', 'arquivado']);
    expect(ROTULO_STATUS_QR.ativo).toBe('Ativo');
    expect(ROTULO_STATUS_QR.arquivado).toBe('Arquivado');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/lib/rotulos.test.js`
Esperado: FAIL — `CATEGORIAS_QR` não é exportado por `rotulos.js`.

- [ ] **Step 3: Implementar**

No fim de `web/src/lib/rotulos.js`, adicionar:

```js
export const ROTULO_CATEGORIA_QR = { adesivo: 'Adesivo', cardapio: 'Cardápio', panfleto: 'Panfleto', embalagem: 'Embalagem', outro: 'Outro' };
export const CATEGORIAS_QR = Object.keys(ROTULO_CATEGORIA_QR);
export const ROTULO_STATUS_QR = { ativo: 'Ativo', arquivado: 'Arquivado' };
export const STATUS_QR = Object.keys(ROTULO_STATUS_QR);
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/lib/rotulos.test.js`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/rotulos.js web/src/lib/rotulos.test.js
git commit -m "feat: rótulos de categoria e status do QR code"
```

---

### Task 7: `FormQRCode` + página `QRCodes` (lista e criação) + navegação

**Files:**
- Create: `web/src/components/FormQRCode.jsx`
- Create: `web/src/pages/QRCodes.jsx`
- Create: `web/src/pages/QRCodes.test.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `CATEGORIAS_QR`, `ROTULO_CATEGORIA_QR`, `STATUS_QR`, `ROTULO_STATUS_QR` (Task 6); `GET/POST /api/qrcodes`, `GET /api/clientes` (Tasks 1-2).
- Produces: `FormQRCode({ inicial, rotuloBotao, onSalvar })`, consumido também pela Task 8. Rota `/qrcodes` registrada em `App.jsx`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `web/src/pages/QRCodes.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRCodes } from './QRCodes.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Ana' };
const qr = {
  id: 5, cliente_id: 1, nome: 'QR balcão', categoria: 'adesivo', descricao_local: null,
  destino_atual: 'https://canva.com/design/abc', imagem_arquivo: null, status: 'ativo',
};

describe('QRCodes', () => {
  it('lista os QR codes', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes?': [qr] });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    expect(await screen.findByRole('link', { name: 'QR balcão' })).toHaveAttribute('href', '/qrcodes/5');
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Adesivo')).toBeInTheDocument();
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
    await user.type(screen.getByLabelText('Destino atual'), 'https://canva.com/design/abc');
    await user.click(screen.getByRole('button', { name: 'Criar QR Code' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      cliente_id: 1, nome: 'QR balcão', categoria: 'adesivo', destino_atual: 'https://canva.com/design/abc',
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/pages/QRCodes.test.jsx`
Esperado: FAIL — `Cannot find module './QRCodes.jsx'`.

- [ ] **Step 3: Criar `FormQRCode.jsx`**

Criar `web/src/components/FormQRCode.jsx`:

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
    nome: inicial.nome ?? '',
    categoria: inicial.categoria ?? CATEGORIAS_QR[0],
    descricao_local: inicial.descricao_local ?? '',
    destino_atual: inicial.destino_atual ?? '',
    status: inicial.status ?? 'ativo',
  });
  const { erros, erro, enviando, executar } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    const corpo = { ...valores, cliente_id: valores.cliente_id ? Number(valores.cliente_id) : null };
    if (!editando) delete corpo.status;
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
        <select {...campo('cliente_id')}>
          <option value="">Selecione…</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Categoria" nome="categoria" erros={erros}>
        <select {...campo('categoria')}>
          {CATEGORIAS_QR.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA_QR[c]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Local de aplicação" nome="descricao_local" erros={erros}>
        <textarea rows={2} {...campo('descricao_local')} />
      </Campo>
      <Campo rotulo="Destino atual" nome="destino_atual" erros={erros} type="url" {...campo('destino_atual')} />
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

- [ ] **Step 4: Criar `QRCodes.jsx`**

Criar `web/src/pages/QRCodes.jsx`:

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormQRCode } from '../components/FormQRCode.jsx';
import { ROTULO_CATEGORIA_QR, ROTULO_STATUS_QR, STATUS_QR } from '../lib/rotulos.js';

export function QRCodes() {
  const [clienteId, setClienteId] = useState('');
  const [status, setStatus] = useState('');
  const [criando, setCriando] = useState(false);
  const navegar = useNavigate();
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const query = new URLSearchParams({
    ...(clienteId && { cliente_id: clienteId }),
    ...(status && { status }),
  }).toString();
  const { dados: qrcodes, erro } = useCarregar(() => api(`/qrcodes?${query}`), [query]);

  async function criar(dados) {
    const qrcode = await api('/qrcodes', { method: 'POST', body: dados });
    navegar(`/qrcodes/${qrcode.id}`);
  }

  function nomeCliente(clienteId) {
    return (clientes ?? []).find((c) => c.id === clienteId)?.nome ?? '—';
  }

  return (
    <section>
      <header className="pagina__topo">
        <h1>QR Codes</h1>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ QR Code</button>
      </header>
      <div className="form--linha">
        <select aria-label="Filtrar por cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_QR.map((s) => <option key={s} value={s}>{ROTULO_STATUS_QR[s]}</option>)}
        </select>
      </div>
      <Aviso erro={erro} />
      {qrcodes && (qrcodes.length ? (
        <table className="tabela">
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
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum QR code encontrado.</p>)}
      {criando && (
        <Modal titulo="Novo QR Code" onFechar={() => setCriando(false)}>
          <FormQRCode rotuloBotao="Criar QR Code" onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Registrar a rota e o item de navegação**

Em `web/src/App.jsx`, adicionar o import:

```js
import { QRCodes } from './pages/QRCodes.jsx';
```

Adicionar ao array `NAVEGACAO` (depois de `Clientes`):

```js
  { para: '/qrcodes', rotulo: 'QR Codes' },
```

Adicionar à lista de `Routes` (depois de `/clientes/:id`):

```jsx
          <Route path="/qrcodes" element={<QRCodes />} />
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/pages/QRCodes.test.jsx`
Esperado: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/FormQRCode.jsx web/src/pages/QRCodes.jsx web/src/pages/QRCodes.test.jsx web/src/App.jsx
git commit -m "feat: lista e criação de QR codes"
```

---

### Task 8: Página `QRCodeDetalhe` — dados, edição e exclusão

**Files:**
- Create: `web/src/pages/QRCodeDetalhe.jsx`
- Create: `web/src/pages/QRCodeDetalhe.test.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `FormQRCode` (Task 7); `GET/PUT/DELETE /api/qrcodes/:id` (Tasks 1-2, 4).
- Produces: componente `QRCodeDetalhe`, montado em `/qrcodes/:id`; estado local `qrcode` (o objeto retornado por `GET /qrcodes/:id`, incluindo `historico`), reutilizado e estendido pelas Tasks 9 e 10.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `web/src/pages/QRCodeDetalhe.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRCodeDetalhe } from './QRCodeDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Ana' };
const qr = {
  id: 5, cliente_id: 1, nome: 'QR balcão', categoria: 'adesivo', descricao_local: 'Porta de entrada',
  destino_atual: 'https://canva.com/design/abc', imagem_arquivo: null, status: 'ativo', atualizado_em: 'T1',
  historico: [],
};

describe('QRCodeDetalhe', () => {
  it('mostra os dados', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': qr });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    expect(await screen.findByDisplayValue('QR balcão')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://canva.com/design/abc')).toBeInTheDocument();
  });

  it('edita o destino', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': qr,
      'PUT /qrcodes/5': { ...qr, destino_atual: 'https://canva.com/design/novo' },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    const user = userEvent.setup();
    const campo = await screen.findByLabelText('Destino atual');
    await user.clear(campo);
    await user.type(campo, 'https://canva.com/design/novo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByDisplayValue('https://canva.com/design/novo');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ destino_atual: 'https://canva.com/design/novo' });
  });

  it('exclui com confirmação e volta pra lista', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': qr, 'DELETE /qrcodes/5': resposta(204, null) });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/pages/QRCodeDetalhe.test.jsx`
Esperado: FAIL — `Cannot find module './QRCodeDetalhe.jsx'`.

- [ ] **Step 3: Implementar**

Criar `web/src/pages/QRCodeDetalhe.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { FormQRCode } from '../components/FormQRCode.jsx';

export function QRCodeDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [qrcode, setQrcode] = useState(null);
  const [erroCarga, setErroCarga] = useState(null);
  const exclusao = useEnvio();

  useEffect(() => {
    api(`/qrcodes/${id}`).then(setQrcode, setErroCarga);
  }, [id]);

  if (erroCarga) return <Aviso erro={erroCarga} />;
  if (!qrcode) return <p>Carregando…</p>;

  async function salvar(dados) {
    setQrcode(await api(`/qrcodes/${id}`, { method: 'PUT', body: dados }));
  }

  function excluir() {
    if (!window.confirm(`Excluir o QR code ${qrcode.nome}?`)) return;
    exclusao.executar(async () => {
      await api(`/qrcodes/${id}`, { method: 'DELETE' });
      navegar('/qrcodes');
    });
  }

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to="/qrcodes">QR Codes</Link></p>
          <h1>{qrcode.nome}</h1>
        </div>
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </header>
      <Aviso erro={exclusao.erro} />
      <div className="grade-2">
        <div className="cartao">
          <h2>Dados</h2>
          <FormQRCode key={qrcode.atualizado_em} inicial={qrcode} onSalvar={salvar} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Registrar a rota**

Em `web/src/App.jsx`, adicionar o import:

```js
import { QRCodeDetalhe } from './pages/QRCodeDetalhe.jsx';
```

Adicionar à lista de `Routes` (depois de `/qrcodes`):

```jsx
          <Route path="/qrcodes/:id" element={<QRCodeDetalhe />} />
```

- [ ] **Step 5: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/pages/QRCodeDetalhe.test.jsx`
Esperado: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/QRCodeDetalhe.jsx web/src/pages/QRCodeDetalhe.test.jsx web/src/App.jsx
git commit -m "feat: tela de detalhe do QR code (dados, edição e exclusão)"
```

---

### Task 9: Cartão "Imagem" — upload, preview e remoção

**Files:**
- Modify: `web/src/pages/QRCodeDetalhe.jsx`
- Modify: `web/src/pages/QRCodeDetalhe.test.jsx`

**Interfaces:**
- Consumes: estado `qrcode`/`setQrcode` da Task 8; `POST/DELETE /api/qrcodes/:id/imagem` (Task 3).

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar em `web/src/pages/QRCodeDetalhe.test.jsx`: primeiro trocar o import de `@testing-library/react` para incluir `fireEvent`:

```js
import { fireEvent, screen } from '@testing-library/react';
```

E adicionar dentro do `describe`, depois do teste "exclui com confirmação...":

```jsx
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
    await screen.findByRole('button', { name: 'Adicionar arquivo' });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/pages/QRCodeDetalhe.test.jsx`
Esperado: FAIL — não existe input com label "Adicionar arquivo".

- [ ] **Step 3: Implementar**

Em `web/src/pages/QRCodeDetalhe.jsx`, adicionar `imagem = useEnvio()` e as funções `enviarImagem`/`removerImagem`, e o cartão "Imagem". Arquivo completo:

```jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { FormQRCode } from '../components/FormQRCode.jsx';

export function QRCodeDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [qrcode, setQrcode] = useState(null);
  const [erroCarga, setErroCarga] = useState(null);
  const exclusao = useEnvio();
  const imagem = useEnvio();

  useEffect(() => {
    api(`/qrcodes/${id}`).then(setQrcode, setErroCarga);
  }, [id]);

  if (erroCarga) return <Aviso erro={erroCarga} />;
  if (!qrcode) return <p>Carregando…</p>;

  async function salvar(dados) {
    setQrcode(await api(`/qrcodes/${id}`, { method: 'PUT', body: dados }));
  }

  function excluir() {
    if (!window.confirm(`Excluir o QR code ${qrcode.nome}?`)) return;
    exclusao.executar(async () => {
      await api(`/qrcodes/${id}`, { method: 'DELETE' });
      navegar('/qrcodes');
    });
  }

  function enviarImagem(e) {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    const formulario = new FormData();
    formulario.append('imagem', arquivo);
    imagem.executar(async () => setQrcode(await api(`/qrcodes/${id}/imagem`, { method: 'POST', body: formulario })));
  }

  function removerImagem() {
    imagem.executar(async () => setQrcode(await api(`/qrcodes/${id}/imagem`, { method: 'DELETE' })));
  }

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to="/qrcodes">QR Codes</Link></p>
          <h1>{qrcode.nome}</h1>
        </div>
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </header>
      <Aviso erro={exclusao.erro} />
      <div className="grade-2">
        <div className="cartao">
          <h2>Dados</h2>
          <FormQRCode key={qrcode.atualizado_em} inicial={qrcode} onSalvar={salvar} />
        </div>
        <div className="cartao">
          <h2>Imagem</h2>
          <p className="vazio">PNG ou PDF, até 10 MB.</p>
          <label className="btn">
            {qrcode.imagem_arquivo ? 'Trocar arquivo' : 'Adicionar arquivo'}
            <input type="file" accept="image/png,application/pdf" hidden aria-label="Adicionar arquivo" onChange={enviarImagem} />
          </label>
          <Aviso erro={imagem.erro} />
          {qrcode.imagem_arquivo && qrcode.imagem_arquivo.endsWith('.pdf') && (
            <iframe title="Arquivo do QR code" src={`/uploads/${qrcode.imagem_arquivo}`} />
          )}
          {qrcode.imagem_arquivo && !qrcode.imagem_arquivo.endsWith('.pdf') && (
            <img src={`/uploads/${qrcode.imagem_arquivo}`} alt="Arquivo do QR code" />
          )}
          {qrcode.imagem_arquivo && (
            <div><button type="button" className="btn btn--pequeno btn--perigo" onClick={removerImagem}>Remover arquivo</button></div>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/pages/QRCodeDetalhe.test.jsx`
Esperado: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/QRCodeDetalhe.jsx web/src/pages/QRCodeDetalhe.test.jsx
git commit -m "feat: upload, preview e remoção do arquivo do QR code"
```

---

### Task 10: Cartão "Histórico de redirecionamento"

**Files:**
- Modify: `web/src/pages/QRCodeDetalhe.jsx`
- Modify: `web/src/pages/QRCodeDetalhe.test.jsx`

**Interfaces:**
- Consumes: `qrcode.historico` (array retornado por `GET/PUT /api/qrcodes/:id`, Task 2).

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar em `web/src/pages/QRCodeDetalhe.test.jsx`, dentro do `describe`:

```jsx
  it('mostra o histórico de redirecionamento', async () => {
    const comHistorico = {
      ...qr,
      historico: [
        { id: 1, destino_anterior: 'https://canva.com/design/velho', destino_novo: 'https://canva.com/design/abc', alterado_em: '2026-09-20T10:00:00.000Z' },
      ],
    };
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': comHistorico });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    expect(await screen.findByText('https://canva.com/design/velho')).toBeInTheDocument();
    expect(screen.getByText('https://canva.com/design/abc')).toBeInTheDocument();
  });

  it('sem histórico mostra mensagem', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': qr });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    expect(await screen.findByText('Nenhuma alteração de destino ainda.')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/pages/QRCodeDetalhe.test.jsx`
Esperado: FAIL — o texto "Nenhuma alteração de destino ainda." não existe na tela.

- [ ] **Step 3: Implementar**

Em `web/src/pages/QRCodeDetalhe.jsx`, adicionar o terceiro cartão dentro de `<div className="grade-2">`, depois do cartão "Imagem":

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

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/pages/QRCodeDetalhe.test.jsx`
Esperado: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/QRCodeDetalhe.jsx web/src/pages/QRCodeDetalhe.test.jsx
git commit -m "feat: histórico de redirecionamento no detalhe do QR code"
```

---

### Task 11: Cartão "QR Codes" no detalhe do cliente

**Files:**
- Modify: `web/src/pages/ClienteDetalhe.jsx`
- Modify: `web/src/pages/ClienteDetalhe.test.jsx`

**Interfaces:**
- Consumes: campo `cliente.qrcodes` (array retornado por `GET /api/clientes/:id`, Task 5).

- [ ] **Step 1: Escrever o teste (falhando)**

Em `web/src/pages/ClienteDetalhe.test.jsx`, atualizar o fixture `cliente` para incluir `qrcodes`, e adicionar um teste. Arquivo completo:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from './ClienteDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const cliente = {
  id: 1, nome: 'Ana', empresa: null, email: null, telefone: null, instagram: null, origem: null, notas: null,
  atualizado_em: 'T', total_faturado_centavos: 150050,
  projetos: [{ id: 4, titulo: 'Site', etapa: 'andamento' }],
  qrcodes: [{ id: 5, nome: 'QR balcão' }],
};

describe('ClienteDetalhe', () => {
  it('mostra projetos e total faturado', async () => {
    mockApi({ 'GET /clientes/1': cliente });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByRole('link', { name: 'Site' })).toHaveAttribute('href', '/projetos/4');
    expect(screen.getByText(/1\.500,50/)).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });

  it('mostra os QR codes do cliente', async () => {
    mockApi({ 'GET /clientes/1': cliente });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByRole('link', { name: 'QR balcão' })).toHaveAttribute('href', '/qrcodes/5');
  });

  it('mostra mensagem quando não há QR codes', async () => {
    mockApi({ 'GET /clientes/1': { ...cliente, qrcodes: [] } });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByText('Nenhum QR ainda.')).toBeInTheDocument();
  });

  it('mostra a mensagem quando o servidor recusa a exclusão', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({
      'GET /clientes/1': cliente,
      'DELETE /clientes/1': resposta(409, { erro: 'Este cliente tem projetos.' }),
    });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Este cliente tem projetos.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/pages/ClienteDetalhe.test.jsx`
Esperado: FAIL — não existe link "QR balcão" nem o texto "Nenhum QR ainda.".

- [ ] **Step 3: Implementar**

Em `web/src/pages/ClienteDetalhe.jsx`, adicionar um terceiro `<div className="cartao">` dentro de `<div className="grade-2">`, depois do cartão "Projetos":

```jsx
        <div className="cartao">
          <h2>QR Codes</h2>
          {cliente.qrcodes.length ? (
            <ul className="lista">
              {cliente.qrcodes.map((q) => (
                <li key={q.id}><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></li>
              ))}
            </ul>
          ) : <p className="vazio">Nenhum QR ainda.</p>}
        </div>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/pages/ClienteDetalhe.test.jsx`
Esperado: PASS (4 testes).

- [ ] **Step 5: Rodar a suíte inteira**

Rodar: `npm test`
Esperado: PASS — todos os testes do backend e do frontend, incluindo os das Tasks 1-10.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/ClienteDetalhe.jsx web/src/pages/ClienteDetalhe.test.jsx
git commit -m "feat: mostra os QR codes do cliente no detalhe do cliente"
```
