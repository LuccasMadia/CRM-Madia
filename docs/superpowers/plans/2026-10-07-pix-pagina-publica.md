# Página pública do Pix (QR do Canva) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar, por cliente, uma página pública no repositório do Portfólio (`/pix/:id`) que mostra o QR Pix e o copia-e-cola — essa URL é o que vai no campo "URL" do QR dinâmico do Canva, que não aceita o código Pix direto.

**Architecture:** CRM-Madia grava/atualiza uma entrada em `src/data/pix.json` no repo do Portfólio e comita+envia (reaproveitando a lógica de commit/push já usada pela publicação de projetos). Uma nova rota e um botão "Publicar Pix" disparam isso por cliente. No repo do Portfólio, uma página nova lê esse JSON estaticamente e renderiza o QR (client-side, via `qrcode.react`) + o copia-e-cola.

**Tech Stack:** Mesmo stack dos dois repositórios já existentes — CRM-Madia: Node/Express/`node:sqlite`, Vitest+Supertest; Portfólio: Vite + React 19 + React Router, Vitest + Testing Library. Nova dependência (só no Portfólio): `qrcode.react@^4.2.0` (suporta React 19).

## Global Constraints

- CRM-Madia: sem dependência nova (tudo em Node puro + libs já presentes).
- Portfólio: única dependência nova é `qrcode.react`; não mexer no fluxo de publicação de projetos existente (`portfolio/build.js`, `write.js`, rota `/portfolio/publicar`) nem nos testes dele.
- `commitarPortfolio` deve continuar com o mesmo comportamento e as mesmas mensagens após a refatoração — os testes existentes de `server/portfolio/git.test.js` não podem mudar.
- Caminho do repo do Portfólio já vem de `portfolio_repo_path` (tabela `config`), já configurado pelo Lucca — não criar config nova.
- Seguir os padrões já existentes nos dois repositórios (ver tasks).

---

### Task 1: `server/portfolio/pix.js` — ler/gravar `src/data/pix.json`

**Files:**
- Create: `server/portfolio/pix.js`
- Create: `server/portfolio/pix.test.js`

**Interfaces:**
- Produces: `export const CAMINHO_PIX_JSON = 'src/data/pix.json'` (consumida pela Task 2).
- Produces: `export function lerPixAtual(repo: string): Record<string, {nome: string, codigo: string}>`.
- Produces: `export function gravarPix(repo: string, { id, nome, codigo }: { id: number|string, nome: string, codigo: string }): Record<string, {...}>` (consumida pela Task 3).

- [ ] **Step 1: Escrever os testes (falhando)**

```js
// server/portfolio/pix.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lerPixAtual, gravarPix, CAMINHO_PIX_JSON } from './pix.js';

let repo;
beforeEach(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), 'crm-pix-'));
});

describe('lerPixAtual', () => {
  it('retorna objeto vazio quando o arquivo não existe', () => {
    expect(lerPixAtual(repo)).toEqual({});
  });
});

describe('gravarPix', () => {
  it('cria o arquivo e as pastas quando não existem', () => {
    gravarPix(repo, { id: 42, nome: 'Popy', codigo: '000201...6304ABCD' });
    const arquivo = path.join(repo, CAMINHO_PIX_JSON);
    expect(existsSync(arquivo)).toBe(true);
    expect(JSON.parse(readFileSync(arquivo, 'utf8'))).toEqual({ 42: { nome: 'Popy', codigo: '000201...6304ABCD' } });
  });

  it('faz merge: grava uma segunda entrada sem apagar a primeira', () => {
    gravarPix(repo, { id: 1, nome: 'A', codigo: 'codA' });
    gravarPix(repo, { id: 2, nome: 'B', codigo: 'codB' });
    expect(lerPixAtual(repo)).toEqual({ 1: { nome: 'A', codigo: 'codA' }, 2: { nome: 'B', codigo: 'codB' } });
  });

  it('sobrescreve só a entrada do mesmo id', () => {
    gravarPix(repo, { id: 1, nome: 'A', codigo: 'codA' });
    gravarPix(repo, { id: 1, nome: 'A novo nome', codigo: 'codA2' });
    expect(lerPixAtual(repo)).toEqual({ 1: { nome: 'A novo nome', codigo: 'codA2' } });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run server/portfolio/pix.test.js`
Expected: FAIL — `Cannot find module './pix.js'`.

- [ ] **Step 3: Implementar**

```js
// server/portfolio/pix.js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CAMINHO_PIX_JSON = 'src/data/pix.json';

export function lerPixAtual(repo) {
  const arquivo = path.join(repo, CAMINHO_PIX_JSON);
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {};
}

export function gravarPix(repo, { id, nome, codigo }) {
  const atual = lerPixAtual(repo);
  atual[String(id)] = { nome, codigo };
  const arquivo = path.join(repo, CAMINHO_PIX_JSON);
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, `${JSON.stringify(atual, null, 2)}\n`);
  return atual;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run server/portfolio/pix.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add server/portfolio/pix.js server/portfolio/pix.test.js
git commit -m "feat: ler/gravar src/data/pix.json no repo do Portfólio"
```

---

### Task 2: `server/portfolio/git.js` — generalizar commit/push + `commitarPix`

**Files:**
- Modify: `server/portfolio/git.js`
- Modify: `server/portfolio/git.test.js`

**Interfaces:**
- Consumes: `CAMINHO_PIX_JSON` de `./pix.js` (Task 1).
- Produces: `export function commitarPix(repo: string, { push?: boolean }): { commitado: boolean, saida: string }` (consumida pela Task 3).
- `commitarPortfolio` mantém a mesma assinatura e comportamento de antes (nenhum consumidor existente muda).

- [ ] **Step 1: Escrever os testes novos de `commitarPix` (falhando) — adicionar ao final de `server/portfolio/git.test.js`, sem tocar nos testes existentes de `commitarPortfolio`**

```js
// adicionar em server/portfolio/git.test.js (mesmo arquivo, usa o beforeEach já existente que cria repo+remoto)
import { commitarPix } from './git.js'; // adicionar ao import já existente no topo do arquivo

function escreverSaidaPix() {
  mkdirSync(path.join(repo, 'src/data'), { recursive: true });
  writeFileSync(path.join(repo, 'src/data/pix.json'), '{}\n');
}

describe('commitarPix', () => {
  it('commita só src/data/pix.json e envia', () => {
    escreverSaidaPix();
    writeFileSync(path.join(repo, 'outro.txt'), 'não commitar');
    git(repo, 'add', 'outro.txt');

    const resultado = commitarPix(repo);
    expect(resultado.commitado).toBe(true);
    expect(git(repo, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe('src/data/pix.json');
    expect(git(remoto, 'log', '-1', '--format=%s', 'main').trim()).toBe('chore(pix): atualiza link Pix via CRM');
  });

  it('não cria commit quando nada mudou', () => {
    escreverSaidaPix();
    commitarPix(repo);
    expect(commitarPix(repo)).toEqual({ commitado: false, saida: 'Nada para commitar: o Pix já está atualizado.' });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha (só os 2 testes novos; os de `commitarPortfolio` continuam passando)**

Run: `npx vitest run server/portfolio/git.test.js`
Expected: FAIL nos 2 testes de `commitarPix` (`commitarPix is not a function` / import quebrado); os testes de `commitarPortfolio` continuam PASS.

- [ ] **Step 3: Refatorar `git.js` — extrair `commitarCaminhos` e adicionar `commitarPix`**

```js
// server/portfolio/git.js — arquivo completo
import { execFileSync } from 'node:child_process';
import { ErroHttp } from '../http/erros.js';
import { CAMINHO_JSON, PASTA_IMAGENS } from './write.js';
import { CAMINHO_PIX_JSON } from './pix.js';

const CAMINHOS_PORTFOLIO = [CAMINHO_JSON, PASTA_IMAGENS];
const MENSAGEM_PORTFOLIO = 'chore(portfolio): atualiza projetos via CRM';
const MENSAGEM_PIX = 'chore(pix): atualiza link Pix via CRM';

function git(repo, args) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (erro) {
    const detalhe = (erro.stderr || erro.stdout || erro.message).toString().trim();
    throw new ErroHttp(502, `git ${args[0]} falhou:\n${detalhe}`);
  }
}

function commitsNaoEnviados(repo) {
  try {
    return Number(execFileSync('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  } catch {
    return 0; // branch sem upstream configurado: nada a comparar
  }
}

function commitarCaminhos(repo, { caminhos, mensagem, semMudancas, push = true }) {
  git(repo, ['add', '-A', '--', ...caminhos]);
  const pendentes = git(repo, ['diff', '--cached', '--name-only', '--', ...caminhos]).trim();
  if (!pendentes) {
    // Um push anterior pode ter falhado depois do commit: envia o que ficou para trás.
    if (push && commitsNaoEnviados(repo) > 0) {
      return { commitado: false, saida: `Commit pendente enviado.\n${git(repo, ['push'])}` };
    }
    return { commitado: false, saida: semMudancas };
  }
  // O pathspec no commit garante que só os caminhos do CRM entram, mesmo com outros arquivos no stage.
  let saida = git(repo, ['commit', '-m', mensagem, '--', ...caminhos]);
  if (push) saida += git(repo, ['push']);
  return { commitado: true, saida };
}

export function commitarPortfolio(repo, { push = true } = {}) {
  return commitarCaminhos(repo, {
    caminhos: CAMINHOS_PORTFOLIO,
    mensagem: MENSAGEM_PORTFOLIO,
    semMudancas: 'Nada para commitar: o portfólio já está atualizado.',
    push,
  });
}

export function commitarPix(repo, { push = true } = {}) {
  return commitarCaminhos(repo, {
    caminhos: [CAMINHO_PIX_JSON],
    mensagem: MENSAGEM_PIX,
    semMudancas: 'Nada para commitar: o Pix já está atualizado.',
    push,
  });
}
```

- [ ] **Step 4: Rodar o arquivo inteiro e confirmar que tudo passa (os testes antigos de `commitarPortfolio` + os novos de `commitarPix`)**

Run: `npx vitest run server/portfolio/git.test.js`
Expected: PASS em todos (7 testes: 4 de `commitarPortfolio` + 2 de `commitarPix`, conferir total exato ao rodar).

- [ ] **Step 5: Rodar a suíte completa do backend pra garantir que nada mais importa `git.js` de um jeito que quebrou**

Run: `npx vitest run server`
Expected: PASS em tudo.

- [ ] **Step 6: Commit**

```bash
git add server/portfolio/git.js server/portfolio/git.test.js
git commit -m "feat: generalizar commit/push do portfólio e adicionar commitarPix"
```

---

### Task 3: `server/routes/clientes.js` — rota `POST /:id/publicar-pix`

**Files:**
- Modify: `server/routes/clientes.js`
- Modify: `server/routes/clientes.test.js`

**Interfaces:**
- Consumes: `gravarPix` (Task 1), `commitarPix` (Task 2), `obterConfig` de `../repos/config.js`, `validarRepo` de `../portfolio/validate.js` (já existe, usada por `routes/publicacao.js`).
- Produces: nenhuma interface nova consumida por outra task — ponta do backend.

- [ ] **Step 1: Escrever os testes da rota (falhando)**

```js
// adicionar em server/routes/clientes.test.js
// topo do arquivo, junto aos imports existentes:
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// helper novo, mesmo padrão de server/portfolio/git.test.js
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

// dentro do describe('/api/clientes', ...), no final:
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

    const pix = JSON.parse(readFileSync(path.join(repo, 'src/data/pix.json'), 'utf8'));
    expect(pix[String(cliente.id)].nome).toBe('Doces da Ana');
    expect(pix[String(cliente.id)].codigo).toContain('ana@doces.com');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run server/routes/clientes.test.js`
Expected: FAIL nos 3 testes novos — rota `/publicar-pix` não existe (404).

- [ ] **Step 3: Implementar a rota**

```js
// server/routes/clientes.js
// adicionar aos imports no topo:
import { obterConfig } from '../repos/config.js';
import { validarRepo } from '../portfolio/validate.js';
import { gravarPix } from '../portfolio/pix.js';
import { commitarPix } from '../portfolio/git.js';

const CHAVE_REPO_PORTFOLIO = 'portfolio_repo_path';

// adicionar a rota, por exemplo depois do PUT /:id:
r.post('/:id/publicar-pix', (req, res) => {
  const cliente = clientes.obter(lerId(req.params.id));
  if (!cliente) throw naoEncontrado('Cliente');
  if (!cliente.chave_pix) throw new ErroHttp(400, 'Cadastre a chave Pix antes de publicar');
  const repo = obterConfig(db, CHAVE_REPO_PORTFOLIO);
  const erros = validarRepo(repo);
  if (erros.length) throw new ErroHttp(400, erros.join('\n'));
  const codigo = gerarCodigoPix({ chave: cliente.chave_pix, nomeRecebedor: cliente.empresa || cliente.nome, cidade: cliente.cidade });
  gravarPix(repo, { id: cliente.id, nome: cliente.empresa || cliente.nome, codigo });
  res.json(commitarPix(repo));
});
```

`rotasClientes({ db })` já recebe `db` — a rota tem acesso direto. `ErroHttp`, `naoEncontrado`, `lerId`, `gerarCodigoPix` já estão importados no arquivo (da Task 2 da feature anterior).

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run server/routes/clientes.test.js`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `npx vitest run server`
Expected: PASS em tudo.

- [ ] **Step 6: Commit**

```bash
git add server/routes/clientes.js server/routes/clientes.test.js
git commit -m "feat: rota POST /clientes/:id/publicar-pix"
```

---

### Task 4: `web/src/pages/ClienteDetalhe.jsx` — botão "Publicar Pix"

**Files:**
- Modify: `web/src/pages/ClienteDetalhe.jsx`
- Modify: `web/src/pages/ClienteDetalhe.test.jsx`

**Interfaces:**
- Consumes: `POST /clientes/:id/publicar-pix` → `{ commitado: boolean, saida: string }` (Task 3).
- Produces: nenhuma — ponta do CRM.

- [ ] **Step 1: Escrever os testes (falhando)**

```jsx
// adicionar em web/src/pages/ClienteDetalhe.test.jsx, dentro do describe('ClienteDetalhe', ...)
it('publica o pix e mostra a mensagem de sucesso', async () => {
  mockApi({
    'GET /clientes/1': { ...cliente, pix_copia_cola: '00020126...CODIGO...6304ABCD' },
    'POST /clientes/1/publicar-pix': { commitado: true, saida: 'ok' },
  });
  renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
  await screen.findByText('00020126...CODIGO...6304ABCD');

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Publicar Pix' }));
  expect(await screen.findByText(/Publicado/)).toBeInTheDocument();
});

it('mostra o erro quando a publicação do pix falha', async () => {
  mockApi({
    'GET /clientes/1': { ...cliente, pix_copia_cola: '00020126...CODIGO...6304ABCD' },
    'POST /clientes/1/publicar-pix': resposta(400, { erro: 'Configure o caminho do repositório do portfólio' }),
  });
  renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
  await screen.findByText('00020126...CODIGO...6304ABCD');

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Publicar Pix' }));
  expect(await screen.findByText('Configure o caminho do repositório do portfólio')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run web/src/pages/ClienteDetalhe.test.jsx`
Expected: FAIL nos 2 testes novos — botão "Publicar Pix" não existe.

- [ ] **Step 3: Implementar o botão no `CartaoPix`**

```jsx
// web/src/pages/ClienteDetalhe.jsx
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../lib/rotulos.js';

function CartaoPix({ id, codigo }) {
  const [copiado, setCopiado] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const publicacao = useEnvio();

  async function copiar() {
    await navigator.clipboard.writeText(codigo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function publicar() {
    setMensagem(null);
    publicacao.executar(async () => {
      await api(`/clientes/${id}/publicar-pix`, { method: 'POST' });
      setMensagem(`Publicado! Cole a URL /pix/${id} no campo "URL" do QR do Canva.`);
    });
  }

  if (!codigo) return <p className="vazio">Preencha a chave Pix no formulário para gerar o código.</p>;
  return (
    <>
      <textarea readOnly rows={4} value={codigo} />
      <div>
        <button type="button" className="btn" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar'}</button>{' '}
        <button type="button" className="btn" onClick={publicar} disabled={publicacao.enviando}>Publicar Pix</button>
      </div>
      <Aviso erro={publicacao.erro} />
      {mensagem && <p>{mensagem}</p>}
    </>
  );
}
```

E no corpo de `ClienteDetalhe`, trocar `<CartaoPix codigo={cliente.pix_copia_cola} />` por `<CartaoPix id={cliente.id} codigo={cliente.pix_copia_cola} />`.

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run web/src/pages/ClienteDetalhe.test.jsx`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Rodar a suíte completa do CRM**

Run: `npm test`
Expected: PASS em tudo (backend + frontend).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/ClienteDetalhe.jsx web/src/pages/ClienteDetalhe.test.jsx
git commit -m "feat: botão Publicar Pix na ficha do cliente"
```

---

### Task 5: Portfólio — página pública `/pix/:id`

**Repo:** `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia` (repositório separado do CRM-Madia).

**Files:**
- Modify: `package.json` (nova dependência)
- Create: `src/data/pix.json` (placeholder `{}` — ver Step 1.5)
- Create: `src/pages/PixPage.jsx`
- Create: `src/pages/PixPage.css`
- Create: `src/pages/PixPage.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `src/data/pix.json` (gerado pelo CRM via Task 3; no repo de teste local, o arquivo pode não existir ainda).
- Produces: rota `/pix/:id` acessível publicamente — consumida pelo campo "URL" do QR do Canva (fora do código).

- [ ] **Step 1: Instalar a dependência**

Run (na pasta do Portfólio): `npm install qrcode.react@^4.2.0`
Expected: `package.json` e `package-lock.json` atualizados, sem erro.

- [ ] **Step 1.5: Criar o placeholder `src/data/pix.json`**

`PixPage.jsx` (Step 4) importa esse arquivo estaticamente — sem ele, `npm run dev`/`npm run build` quebram antes mesmo da primeira publicação feita pelo CRM. Esse arquivo fica commitado no repo como placeholder; a primeira vez que o Lucca clicar em "Publicar Pix" no CRM, o `gravarPix` (Task 1 do CRM) sobrescreve ele com as entradas reais via commit automático.

```json
{}
```

Salvar em `src/data/pix.json`.

- [ ] **Step 2: Escrever o teste da página (falhando)**

```jsx
// src/pages/PixPage.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render } from '@testing-library/react';
import { PixPage } from './PixPage';

vi.mock('../data/pix.json', () => ({
  default: { 42: { nome: 'Popy', codigo: '00020126...CODIGO...6304ABCD' } },
}));

function renderizarEm(id) {
  return render(
    <MemoryRouter initialEntries={[`/pix/${id}`]}>
      <Routes>
        <Route path="/pix/:id" element={<PixPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PixPage', () => {
  it('mostra o nome, o QR e o código quando o id existe', () => {
    renderizarEm('42');
    expect(screen.getByText('Popy')).toBeInTheDocument();
    expect(screen.getByText('00020126...CODIGO...6304ABCD')).toBeInTheDocument();
  });

  it('copia o código ao clicar em Copiar', async () => {
    renderizarEm('42');
    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(escrever).toHaveBeenCalledWith('00020126...CODIGO...6304ABCD');
  });

  it('mostra mensagem de não encontrado quando o id não existe', () => {
    renderizarEm('999');
    expect(screen.getByText('Código Pix não encontrado.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/pages/PixPage.test.jsx`
Expected: FAIL — `Cannot find module './PixPage'`.

- [ ] **Step 4: Implementar a página**

```jsx
// src/pages/PixPage.jsx
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import pixData from '../data/pix.json';
import './PixPage.css';

export function PixPage() {
  const { id } = useParams();
  const entrada = pixData[id];

  if (!entrada) {
    return (
      <main className="pix-page pix-page--vazia">
        <p>Código Pix não encontrado.</p>
      </main>
    );
  }

  async function copiar() {
    await navigator.clipboard.writeText(entrada.codigo);
  }

  return (
    <main className="pix-page">
      <h1>{entrada.nome}</h1>
      <p className="pix-page__instrucao">Abra o Pix no app do seu banco e escaneie o QR ou cole o código.</p>
      <div className="pix-page__qr">
        <QRCodeSVG value={entrada.codigo} size={240} />
      </div>
      <code className="pix-page__codigo">{entrada.codigo}</code>
      <button type="button" className="btn btn--primary" onClick={copiar}>Copiar</button>
    </main>
  );
}
```

```css
/* src/pages/PixPage.css */
.pix-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1.5rem;
  text-align: center;
}

.pix-page--vazia {
  color: var(--text-muted);
}

.pix-page__instrucao {
  color: var(--text-muted);
  max-width: 320px;
}

.pix-page__qr {
  background: #fff;
  padding: 1rem;
  border-radius: 12px;
}

.pix-page__codigo {
  display: block;
  max-width: 320px;
  word-break: break-all;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

- [ ] **Step 5: Adicionar a rota em `App.jsx`**

```jsx
// src/App.jsx — arquivo completo
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { ProjectsPage } from './pages/ProjectsPage';
import { PixPage } from './pages/PixPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projetos" element={<ProjectsPage />} />
        <Route path="/pix/:id" element={<PixPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 6: Rodar o teste da página e confirmar que passa**

Run: `npx vitest run src/pages/PixPage.test.jsx`
Expected: PASS (3 testes).

- [ ] **Step 7: Rodar a suíte completa do Portfólio**

Run: `npm test`
Expected: PASS em tudo (inclui `App.test.jsx`, que continua passando — a rota nova não interfere na `/`).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/data/pix.json src/pages/PixPage.jsx src/pages/PixPage.css src/pages/PixPage.test.jsx src/App.jsx
git commit -m "feat: página pública /pix/:id com QR e código Pix"
```

Nota: o `src/data/pix.json` commitado aqui é só o placeholder `{}`. A partir da primeira vez que o Lucca clicar em "Publicar Pix" no CRM (Task 3), o CRM sobrescreve esse arquivo com as entradas reais e comita/envia por conta própria — não é preciso tocar nele manualmente de novo.
