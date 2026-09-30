# Verificação automática de QR desatualizado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decodificar o conteúdo do QR a partir do PNG enviado, comparar com `destino_atual` e mostrar um selo de status ("desatualizado", "ok", etc) no detalhe e na listagem de QR Codes.

**Architecture:** Uma função pura de domínio (`server/domain/qrLeitura.js`) decodifica o PNG (via `pngjs` + `jsqr`) e calcula um status de 5 valores a partir de `imagem_arquivo` / `imagem_destino_lido` / `destino_atual`. O texto lido é persistido em uma nova coluna (`imagem_destino_lido`) no momento do upload, e o status é recalculado (nunca armazenado) toda vez que a rota monta a resposta — assim ele reflete mudanças em `destino_atual` sem precisar reler a imagem. O frontend só exibe o `imagem_status` que a API já manda pronto.

**Tech Stack:** Express + `node:sqlite`, React 19, Vitest/Testing Library — mesmo stack do restante do projeto. Novas libs: `jsqr` + `pngjs` (produção), `qrcode` (dev, só para gerar fixtures de teste).

Spec completa: [[2026-09-29-qrcode-leitura-status-design]].

## Global Constraints

- Só PNG é decodificado. PDF nunca é tratado como erro — vira o estado `nao_verificado`.
- `imagem_destino_lido` nunca vem do cliente (não entra em `REGRAS_QRCODE`); só é escrito pelas rotas de upload/remoção de imagem.
- Não existe re-checagem automática por mudança em `destino_atual`, nem botão manual de "reconferir" — o status é sempre recalculado a partir dos dados já salvos.
- `jsqr` e `pngjs` são dependências de produção; `qrcode` é devDependency, usada só em testes.

---

## Task 1: Módulo de domínio `qrLeitura` (decodificação + cálculo de status)

**Files:**
- Create: `server/domain/qrLeitura.js`
- Test: `server/domain/qrLeitura.test.js`
- Modify: `package.json` (dependências)

**Interfaces:**
- Produces: `lerQrPng(buffer: Buffer): string | null` — decodifica um PNG e retorna o texto do QR, ou `null` se não conseguir ler.
- Produces: `statusImagem({ imagem_arquivo, imagem_destino_lido, destino_atual }): 'sem_imagem' | 'nao_verificado' | 'ilegivel' | 'ok' | 'desatualizado'` — função pura, sem I/O.

- [ ] **Step 1: Instalar as dependências**

Run: `npm install jsqr pngjs`
Run: `npm install -D qrcode`

Expected: `package.json` ganha `jsqr` e `pngjs` em `dependencies`, e `qrcode` em `devDependencies`.

- [ ] **Step 2: Escrever o teste falhando**

Criar `server/domain/qrLeitura.test.js`:

```js
import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { lerQrPng, statusImagem } from './qrLeitura.js';

describe('lerQrPng', () => {
  it('lê o texto de um QR code PNG válido', async () => {
    const buffer = await QRCode.toBuffer('https://canva.com/design/abc', { type: 'png' });
    expect(lerQrPng(buffer)).toBe('https://canva.com/design/abc');
  });

  it('retorna null para um buffer inválido', () => {
    expect(lerQrPng(Buffer.from('lixo'))).toBeNull();
  });
});

describe('statusImagem', () => {
  it('sem_imagem quando não há arquivo', () => {
    expect(statusImagem({ imagem_arquivo: null, imagem_destino_lido: null, destino_atual: 'https://x.com' })).toBe('sem_imagem');
  });

  it('nao_verificado para PDF', () => {
    expect(statusImagem({ imagem_arquivo: 'a.pdf', imagem_destino_lido: null, destino_atual: 'https://x.com' })).toBe('nao_verificado');
  });

  it('ilegivel quando o PNG não foi decodificado', () => {
    expect(statusImagem({ imagem_arquivo: 'a.png', imagem_destino_lido: null, destino_atual: 'https://x.com' })).toBe('ilegivel');
  });

  it('ok quando o texto lido bate com o destino atual', () => {
    expect(statusImagem({ imagem_arquivo: 'a.png', imagem_destino_lido: 'https://x.com', destino_atual: 'https://x.com' })).toBe('ok');
  });

  it('desatualizado quando o texto lido diverge do destino atual', () => {
    expect(
      statusImagem({ imagem_arquivo: 'a.png', imagem_destino_lido: 'https://x.com/velho', destino_atual: 'https://x.com/novo' }),
    ).toBe('desatualizado');
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run server/domain/qrLeitura.test.js`
Expected: FAIL — `Cannot find module './qrLeitura.js'` (arquivo ainda não existe).

- [ ] **Step 4: Implementar `qrLeitura.js`**

Criar `server/domain/qrLeitura.js`:

```js
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

export function lerQrPng(buffer) {
  try {
    const png = PNG.sync.read(buffer);
    const resultado = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    return resultado?.data || null;
  } catch {
    return null;
  }
}

export function statusImagem({ imagem_arquivo, imagem_destino_lido, destino_atual }) {
  if (!imagem_arquivo) return 'sem_imagem';
  if (imagem_arquivo.endsWith('.pdf')) return 'nao_verificado';
  if (!imagem_destino_lido) return 'ilegivel';
  return imagem_destino_lido.trim() === destino_atual.trim() ? 'ok' : 'desatualizado';
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run server/domain/qrLeitura.test.js`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/domain/qrLeitura.js server/domain/qrLeitura.test.js
git commit -m "feat: decodifica QR de PNG e calcula status de divergência com o destino"
```

---

## Task 2: Migração da coluna + persistência no upload/remoção de imagem

**Files:**
- Create: `server/db/migrations/007_qrcodes_leitura.sql`
- Modify: `server/repos/qrcodes.js`
- Modify: `server/routes/qrcodes.js`
- Modify: `server/routes/qrcodes.test.js`

**Interfaces:**
- Consumes: `lerQrPng(buffer)`, `statusImagem(qrcode)` de `server/domain/qrLeitura.js` (Task 1).
- Produces: toda resposta de `GET /api/qrcodes`, `GET /api/qrcodes/:id`, `POST /api/qrcodes/:id/imagem` e `DELETE /api/qrcodes/:id/imagem` passa a incluir o campo `imagem_status`.

- [ ] **Step 1: Escrever os testes falhando**

Adicionar ao final do `describe('/api/qrcodes', ...)` em `server/routes/qrcodes.test.js`, antes do `});` de fechamento (linha 200), e adicionar `import QRCode from 'qrcode';` no topo do arquivo junto aos outros imports:

```js
import QRCode from 'qrcode';
```

```js
  it('upload de PNG com QR válido e destino igual marca imagem_status ok', async () => {
    const qr = await criarQrcode({ destino_atual: 'https://canva.com/design/abc' });
    const png = await QRCode.toBuffer('https://canva.com/design/abc', { type: 'png' });
    const res = await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', png, { filename: 'qr.png', contentType: 'image/png' })
      .expect(200);
    expect(res.body.imagem_status).toBe('ok');
  });

  it('upload de PNG com QR divergente marca imagem_status desatualizado', async () => {
    const qr = await criarQrcode({ destino_atual: 'https://canva.com/design/abc' });
    const png = await QRCode.toBuffer('https://canva.com/design/outro', { type: 'png' });
    const res = await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', png, { filename: 'qr.png', contentType: 'image/png' })
      .expect(200);
    expect(res.body.imagem_status).toBe('desatualizado');
  });

  it('upload de PNG ilegível marca imagem_status ilegivel', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', Buffer.from('conteudo-png'), { filename: 'qr.png', contentType: 'image/png' })
      .expect(200);
    expect(res.body.imagem_status).toBe('ilegivel');
  });

  it('upload de PDF marca imagem_status nao_verificado', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', Buffer.from('conteudo-pdf'), { filename: 'qr.pdf', contentType: 'application/pdf' })
      .expect(200);
    expect(res.body.imagem_status).toBe('nao_verificado');
  });

  it('sem imagem, imagem_status é sem_imagem', async () => {
    const qr = await criarQrcode();
    const res = await ctx.http.get(`/api/qrcodes/${qr.id}`).expect(200);
    expect(res.body.imagem_status).toBe('sem_imagem');
  });

  it('remover imagem volta imagem_status pra sem_imagem', async () => {
    const qr = await criarQrcode();
    const png = await QRCode.toBuffer(qr.destino_atual, { type: 'png' });
    await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', png, { filename: 'qr.png', contentType: 'image/png' })
      .expect(200);
    const res = await ctx.http.delete(`/api/qrcodes/${qr.id}/imagem`).expect(200);
    expect(res.body.imagem_status).toBe('sem_imagem');
  });

  it('listagem também traz imagem_status por item', async () => {
    const qr = await criarQrcode();
    const png = await QRCode.toBuffer(qr.destino_atual, { type: 'png' });
    await ctx.http
      .post(`/api/qrcodes/${qr.id}/imagem`)
      .attach('imagem', png, { filename: 'qr.png', contentType: 'image/png' })
      .expect(200);
    const res = await ctx.http.get('/api/qrcodes').expect(200);
    expect(res.body[0].imagem_status).toBe('ok');
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run server/routes/qrcodes.test.js`
Expected: FAIL nos 7 testes novos — `res.body.imagem_status` é `undefined`.

- [ ] **Step 3: Criar a migração**

Criar `server/db/migrations/007_qrcodes_leitura.sql`:

```sql
ALTER TABLE qrcodes ADD COLUMN imagem_destino_lido TEXT;
```

- [ ] **Step 4: Adicionar o campo ao repo**

Em `server/repos/qrcodes.js`, trocar a linha 3:

```js
export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'destino_atual', 'imagem_arquivo', 'status'];
```

por:

```js
export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'destino_atual', 'imagem_arquivo', 'imagem_destino_lido', 'status'];
```

- [ ] **Step 5: Ler e persistir a leitura do QR nas rotas**

Em `server/routes/qrcodes.js`:

Trocar o import do topo:

```js
import { rmSync } from 'node:fs';
```

por:

```js
import { rmSync, readFileSync } from 'node:fs';
```

Adicionar, junto aos outros imports:

```js
import { lerQrPng, statusImagem } from '../domain/qrLeitura.js';
```

Trocar `montar`:

```js
  function montar(id) {
    return { ...qrcodes.obter(id), historico: qrcodes.historico(id) };
  }
```

por:

```js
  function montar(id) {
    const qrcode = qrcodes.obter(id);
    return { ...qrcode, imagem_status: statusImagem(qrcode), historico: qrcodes.historico(id) };
  }
```

Trocar a rota de listagem:

```js
  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });
```

por:

```js
  r.get('/qrcodes', (req, res) => {
    const lista = qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status });
    res.json(lista.map((q) => ({ ...q, imagem_status: statusImagem(q) })));
  });
```

Trocar a rota de upload:

```js
  r.post('/qrcodes/:id/imagem', upload.single('imagem'), (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    if (!req.file) throw new ErroHttp(400, 'Nenhum arquivo enviado');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.atualizar(id, { imagem_arquivo: req.file.filename });
    res.json(montar(id));
  });
```

por:

```js
  r.post('/qrcodes/:id/imagem', upload.single('imagem'), (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    if (!req.file) throw new ErroHttp(400, 'Nenhum arquivo enviado');
    apagarArquivo(qrcode.imagem_arquivo);
    const imagemDestinoLido = req.file.mimetype === 'image/png' ? lerQrPng(readFileSync(req.file.path)) : null;
    qrcodes.atualizar(id, { imagem_arquivo: req.file.filename, imagem_destino_lido: imagemDestinoLido });
    res.json(montar(id));
  });
```

Trocar a rota de remoção de imagem:

```js
  r.delete('/qrcodes/:id/imagem', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.atualizar(id, { imagem_arquivo: null });
    res.json(montar(id));
  });
```

por:

```js
  r.delete('/qrcodes/:id/imagem', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.atualizar(id, { imagem_arquivo: null, imagem_destino_lido: null });
    res.json(montar(id));
  });
```

- [ ] **Step 6: Rodar todos os testes de `qrcodes.test.js` e confirmar que passam**

Run: `npx vitest run server/routes/qrcodes.test.js`
Expected: PASS (todos os testes, os antigos e os 7 novos).

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/007_qrcodes_leitura.sql server/repos/qrcodes.js server/routes/qrcodes.js server/routes/qrcodes.test.js
git commit -m "feat: persiste e expõe imagem_status nas rotas de QR code"
```

---

## Task 3: Rótulos e estilo do selo (frontend)

**Files:**
- Modify: `web/src/lib/rotulos.js`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: os 4 valores não-`sem_imagem` de `imagem_status` (Task 2): `ok`, `desatualizado`, `ilegivel`, `nao_verificado`.
- Produces: `ROTULO_STATUS_IMAGEM_QR` (objeto `{ ok, desatualizado, ilegivel, nao_verificado }`), consumido pelas Tasks 4 e 5. Classes CSS `.etiqueta--ok` e `.etiqueta--desatualizado`.

- [ ] **Step 1: Adicionar o mapa de rótulos**

Em `web/src/lib/rotulos.js`, adicionar ao final do arquivo:

```js
export const ROTULO_STATUS_IMAGEM_QR = {
  ok: 'Confere com o destino',
  desatualizado: 'Desatualizado',
  ilegivel: 'Não foi possível ler',
  nao_verificado: 'Não verificado (PDF)',
};
```

- [ ] **Step 2: Estender os modificadores de `.etiqueta`**

Em `web/src/styles.css`, trocar as linhas 88–89:

```css
.etiqueta--entregue, .etiqueta--paga, .etiqueta--publicado { color: var(--ok); border-color: var(--ok); }
.etiqueta--atrasada, .etiqueta--perdido { color: var(--perigo); border-color: var(--perigo); }
```

por:

```css
.etiqueta--entregue, .etiqueta--paga, .etiqueta--publicado, .etiqueta--ok { color: var(--ok); border-color: var(--ok); }
.etiqueta--atrasada, .etiqueta--perdido, .etiqueta--desatualizado { color: var(--perigo); border-color: var(--perigo); }
```

- [ ] **Step 3: Rodar a suíte web pra garantir que nada quebrou**

Run: `npx vitest run --project web`
Expected: PASS (nenhum teste existente depende dessas linhas, é só checar que não há erro de sintaxe).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/rotulos.js web/src/styles.css
git commit -m "feat: rótulos e estilo do selo de status da imagem do QR code"
```

---

## Task 4: Selo no detalhe do QR code

**Files:**
- Modify: `web/src/pages/QRCodeDetalhe.jsx`
- Modify: `web/src/pages/QRCodeDetalhe.test.jsx`

**Interfaces:**
- Consumes: `ROTULO_STATUS_IMAGEM_QR` de `web/src/lib/rotulos.js` (Task 3); `qrcode.imagem_status` vindo da API (Task 2).

- [ ] **Step 1: Escrever os testes falhando**

Em `web/src/pages/QRCodeDetalhe.test.jsx`, adicionar dois `it` dentro do `describe('QRCodeDetalhe', ...)`, por exemplo logo após o teste `'upload de PNG mostra preview de imagem'`:

```js
  it('mostra selo de status da imagem quando desatualizada', async () => {
    const comStatus = { ...qr, imagem_arquivo: 'abc.png', imagem_status: 'desatualizado' };
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': comStatus });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    expect(await screen.findByText('Desatualizado')).toBeInTheDocument();
  });

  it('não mostra selo quando não há imagem', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': { ...qr, imagem_status: 'sem_imagem' } });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    await screen.findByDisplayValue('QR balcão');
    expect(screen.queryByText('Desatualizado')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run web/src/pages/QRCodeDetalhe.test.jsx`
Expected: FAIL no teste `'mostra selo de status da imagem quando desatualizada'` — texto "Desatualizado" não encontrado.

- [ ] **Step 3: Implementar o selo**

Em `web/src/pages/QRCodeDetalhe.jsx`, adicionar o import no topo:

```js
import { ROTULO_STATUS_IMAGEM_QR } from '../lib/rotulos.js';
```

Trocar:

```jsx
          <Aviso erro={imagem.erro} />
          {qrcode.imagem_arquivo && qrcode.imagem_arquivo.endsWith('.pdf') && (
```

por:

```jsx
          <Aviso erro={imagem.erro} />
          {qrcode.imagem_status && qrcode.imagem_status !== 'sem_imagem' && (
            <p><span className={`etiqueta etiqueta--${qrcode.imagem_status}`}>{ROTULO_STATUS_IMAGEM_QR[qrcode.imagem_status]}</span></p>
          )}
          {qrcode.imagem_arquivo && qrcode.imagem_arquivo.endsWith('.pdf') && (
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run web/src/pages/QRCodeDetalhe.test.jsx`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/QRCodeDetalhe.jsx web/src/pages/QRCodeDetalhe.test.jsx
git commit -m "feat: mostra selo de status da imagem no detalhe do QR code"
```

---

## Task 5: Coluna de status na listagem de QR Codes

**Files:**
- Modify: `web/src/pages/QRCodes.jsx`
- Modify: `web/src/pages/QRCodes.test.jsx`

**Interfaces:**
- Consumes: `ROTULO_STATUS_IMAGEM_QR` de `web/src/lib/rotulos.js` (Task 3); `q.imagem_status` vindo da API (Task 2).

- [ ] **Step 1: Escrever o teste falhando**

Em `web/src/pages/QRCodes.test.jsx`, adicionar dentro do `describe('QRCodes', ...)`, por exemplo logo após o teste `'lista os QR codes'`:

```js
  it('mostra selo de status da imagem na listagem', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes?': [{ ...qr, imagem_status: 'desatualizado' }] });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    const tabela = within(await screen.findByRole('table'));
    expect(tabela.getByText('Desatualizado')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run web/src/pages/QRCodes.test.jsx`
Expected: FAIL — texto "Desatualizado" não encontrado na tabela.

- [ ] **Step 3: Implementar a coluna**

Em `web/src/pages/QRCodes.jsx`, trocar o import:

```js
import { ROTULO_CATEGORIA_QR, ROTULO_STATUS_QR, STATUS_QR } from '../lib/rotulos.js';
```

por:

```js
import { ROTULO_CATEGORIA_QR, ROTULO_STATUS_QR, ROTULO_STATUS_IMAGEM_QR, STATUS_QR } from '../lib/rotulos.js';
```

Trocar o cabeçalho da tabela:

```jsx
          <thead><tr><th>Nome</th><th>Cliente</th><th>Categoria</th><th>Destino atual</th><th>Status</th></tr></thead>
```

por:

```jsx
          <thead><tr><th>Nome</th><th>Cliente</th><th>Categoria</th><th>Destino atual</th><th>Imagem</th><th>Status</th></tr></thead>
```

Trocar a linha da tabela:

```jsx
              <tr key={q.id}>
                <td><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></td>
                <td>{nomeCliente(q.cliente_id)}</td>
                <td>{ROTULO_CATEGORIA_QR[q.categoria]}</td>
                <td>{q.destino_atual}</td>
                <td>{ROTULO_STATUS_QR[q.status]}</td>
              </tr>
```

por:

```jsx
              <tr key={q.id}>
                <td><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></td>
                <td>{nomeCliente(q.cliente_id)}</td>
                <td>{ROTULO_CATEGORIA_QR[q.categoria]}</td>
                <td>{q.destino_atual}</td>
                <td>
                  {q.imagem_status && q.imagem_status !== 'sem_imagem' ? (
                    <span className={`etiqueta etiqueta--${q.imagem_status}`}>{ROTULO_STATUS_IMAGEM_QR[q.imagem_status]}</span>
                  ) : '—'}
                </td>
                <td>{ROTULO_STATUS_QR[q.status]}</td>
              </tr>
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run web/src/pages/QRCodes.test.jsx`
Expected: PASS (todos os testes do arquivo, incluindo o novo).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npx vitest run`
Expected: PASS em tudo (server + web).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/QRCodes.jsx web/src/pages/QRCodes.test.jsx
git commit -m "feat: mostra coluna de status da imagem na listagem de QR codes"
```
