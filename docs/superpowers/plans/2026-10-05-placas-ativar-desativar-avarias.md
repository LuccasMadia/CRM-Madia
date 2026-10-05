# Placas — Ativar/Desativar + Avarias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft "ativo/inativo" toggle to Placas materiais/modelos (so retired items stop cluttering launch forms but keep their history), and add an Avarias tab to log damaged/broken placas with an editable one-off material snapshot and a loss (prejuízo) total.

**Architecture:** Both features extend the existing `placas_*` subsystem (`docs/superpowers/specs/2026-10-03-placas-avaliacao-design.md`) without changing its shape: same migration-per-file SQLite setup, same `criarRepo` CRUD helper, same pure-function domain layer in `server/domain/placas.js`, same `Aba*`/`Form*` React pattern per entity.

**Tech Stack:** Node `node:sqlite`, Express, Vitest + Supertest (server), React + Testing Library (web). No new dependencies.

## Global Constraints

- Money in `*_centavos` (INTEGER). Dates as `YYYY-MM-DD` TEXT. `criado_em`/`atualizado_em` ISO TEXT, set by `criarRepo`.
- Migrations are plain `.sql` files in `server/db/migrations/`, applied in filename order, each wrapped in its own transaction by `migrate()` — write them so the whole file succeeds or none of it does.
- Deleting a material/modelo with linked history stays blocked (unchanged); deactivating never requires an empty history.
- Every new/changed behavior needs a test next to the file it lives in (`*.test.js`/`*.test.jsx`), following the existing Vitest conventions already in the repo (`server/domain/placas.test.js`, `server/routes/placas.test.js`, `web/src/pages/Placas.test.jsx`).

---

## Task 1: Migration — coluna `ativo` em materiais e modelos

**Files:**
- Create: `server/db/migrations/009_placas_ativo.sql`

**Interfaces:**
- Produces: `placas_materiais.ativo` and `placas_modelos.ativo`, both `INTEGER NOT NULL DEFAULT 1`, consumed by Task 2.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE placas_materiais ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE placas_modelos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 2: Verify it applies cleanly**

Run: `npx vitest run server/routes/placas.test.js`
Expected: all existing tests still PASS (migration runs automatically via `openDb(':memory:')` in `server/test/contexto.js`; existing assertions use `toMatchObject`/exact field lists that don't choke on the new `ativo` column — confirm no failures).

- [ ] **Step 3: Commit**

```bash
git add server/db/migrations/009_placas_ativo.sql
git commit -m "feat: coluna ativo em placas_materiais e placas_modelos"
```

---

## Task 2: Backend — campo `ativo` + endpoints ativar/desativar

**Files:**
- Modify: `server/repos/placas.js` (`CAMPOS_MATERIAL`, `CAMPOS_MODELO`)
- Modify: `server/routes/placas.js`
- Test: `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `server/repos/crud.js` → `criarRepo(db, tabela, campos).atualizar(id, dados)` (existing, unchanged signature).
- Produces: `POST /placas/materiais/:id/desativar`, `POST /placas/materiais/:id/ativar`, `POST /placas/modelos/:id/desativar`, `POST /placas/modelos/:id/ativar` — each returns the updated resource (same shape as the existing `GET`/`PUT` for that entity) or `404`.

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/placas.test.js`, right after the `describe('/api/placas/materiais exclusão bloqueada por lote', ...)` block (before `async function criarModelo...`):

```js
describe('/api/placas/materiais ativar e desativar', () => {
  it('desativa e reativa um material', async () => {
    const material = await criarMaterial();
    const desativado = (await ctx.http.post(`/api/placas/materiais/${material.id}/desativar`).expect(200)).body;
    expect(desativado.ativo).toBe(0);
    const listagem = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(listagem.body[0].ativo).toBe(0);
    const reativado = (await ctx.http.post(`/api/placas/materiais/${material.id}/ativar`).expect(200)).body;
    expect(reativado.ativo).toBe(1);
  });

  it('responde 404 ao desativar material inexistente', async () => {
    await ctx.http.post('/api/placas/materiais/999/desativar').expect(404);
  });
});
```

And at the end of the file (after the last `describe('/api/placas/resumo', ...)` block), append:

```js
describe('/api/placas/modelos ativar e desativar', () => {
  it('desativa e reativa um modelo', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const desativado = (await ctx.http.post(`/api/placas/modelos/${modelo.id}/desativar`).expect(200)).body;
    expect(desativado.ativo).toBe(0);
    const reativado = (await ctx.http.post(`/api/placas/modelos/${modelo.id}/ativar`).expect(200)).body;
    expect(reativado.ativo).toBe(1);
  });

  it('responde 404 ao desativar modelo inexistente', async () => {
    await ctx.http.post('/api/placas/modelos/999/desativar').expect(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/placas.test.js`
Expected: FAIL with 404s (routes don't exist yet) on the new `ativar`/`desativar` tests.

- [ ] **Step 3: Add `ativo` to the repo field lists**

In `server/repos/placas.js`, change:

```js
export const CAMPOS_MATERIAL = ['nome'];
```
to:
```js
export const CAMPOS_MATERIAL = ['nome', 'ativo'];
```

and change:
```js
export const CAMPOS_MODELO = ['nome', 'preco_venda_centavos'];
```
to:
```js
export const CAMPOS_MODELO = ['nome', 'preco_venda_centavos', 'ativo'];
```

- [ ] **Step 4: Add the four routes**

In `server/routes/placas.js`, right after the existing `r.delete('/placas/materiais/:id', ...)` block, add:

```js
  r.post('/placas/materiais/:id/desativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = materiais.atualizar(id, { ativo: 0 });
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });

  r.post('/placas/materiais/:id/ativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = materiais.atualizar(id, { ativo: 1 });
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });
```

And right after the existing `r.delete('/placas/modelos/:id', ...)` block, add:

```js
  r.post('/placas/modelos/:id/desativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = modelos.atualizar(id, { ativo: 0 });
    if (!atualizado) throw naoEncontrado('Modelo');
    res.json(montarModelo(atualizado));
  });

  r.post('/placas/modelos/:id/ativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = modelos.atualizar(id, { ativo: 1 });
    if (!atualizado) throw naoEncontrado('Modelo');
    res.json(montarModelo(atualizado));
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/routes/placas.test.js`
Expected: PASS, all tests including the new ones.

- [ ] **Step 6: Commit**

```bash
git add server/repos/placas.js server/routes/placas.js server/routes/placas.test.js
git commit -m "feat: endpoints de ativar/desativar material e modelo de placas"
```

---

## Task 3: Frontend — helper `apenasAtivos` para os selects de lançamento

**Files:**
- Create: `web/src/lib/ativos.js`
- Test: `web/src/lib/ativos.test.js`

**Interfaces:**
- Produces: `apenasAtivos(lista, valorSelecionado) => array` — filters a list down to items where `item.ativo` is truthy, always keeping the item whose `String(item.id) === valorSelecionado` (so an already-selected, now-inactive item doesn't vanish from an edit form). `lista` may be `null`/`undefined`. Consumed by Task 4 and by `FormPlacaAvaria` in Task 9.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { apenasAtivos } from './ativos.js';

describe('apenasAtivos', () => {
  it('mantém só os itens ativos', () => {
    const lista = [{ id: 1, ativo: 1 }, { id: 2, ativo: 0 }];
    expect(apenasAtivos(lista, '').map((i) => i.id)).toEqual([1]);
  });

  it('mantém o item inativo já selecionado, para não perder a referência ao editar', () => {
    const lista = [{ id: 1, ativo: 1 }, { id: 2, ativo: 0 }];
    expect(apenasAtivos(lista, '2').map((i) => i.id)).toEqual([1, 2]);
  });

  it('lida com lista nula', () => {
    expect(apenasAtivos(null, '')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/ativos.test.js`
Expected: FAIL with "Cannot find module './ativos.js'" or similar.

- [ ] **Step 3: Write the implementation**

```js
export function apenasAtivos(lista, valorSelecionado) {
  return (lista ?? []).filter((item) => item.ativo || String(item.id) === valorSelecionado);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/ativos.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ativos.js web/src/lib/ativos.test.js
git commit -m "feat: helper apenasAtivos para filtrar selects de material/modelo"
```

---

## Task 4: Frontend — aplicar `apenasAtivos` nos formulários de lançamento

**Files:**
- Modify: `web/src/components/FormPlacaLote.jsx`
- Modify: `web/src/components/FormPlacaModelo.jsx`
- Modify: `web/src/components/FormPlacaVenda.jsx`
- Test: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `apenasAtivos` from Task 3.

- [ ] **Step 1: Write the failing test**

Add to `web/src/pages/Placas.test.jsx`, right after the `it('lança lote na aba Lotes', ...)` test (before `it('agrupa lotes com o mesmo nome_lote...')`):

```js
  it('esconde materiais inativos do select de novo lote', async () => {
    const ativo = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, estoque_atual: 0, custo_unitario_atual: null };
    const inativo = { id: 2, nome: 'Placa Antiga', ativo: 0, estoque_atual: 0, custo_unitario_atual: null };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] } },
      'GET /placas/materiais': [ativo, inativo],
      'GET /placas/lotes': [],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    await user.click(await screen.findByRole('button', { name: '+ Lote' }));
    const select = await screen.findByLabelText('Material');
    const opcoes = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes).toEqual(['Selecione…', 'Placa 10x10 PVC']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "esconde materiais inativos"`
Expected: FAIL — `opcoes` includes `'Placa Antiga'` because the filter isn't applied yet.

- [ ] **Step 3: Apply the filter in the three forms**

In `web/src/components/FormPlacaLote.jsx`, add the import:
```js
import { apenasAtivos } from '../lib/ativos.js';
```
and change:
```js
          {(materiais ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
```
to:
```js
          {apenasAtivos(materiais, valores.material_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
```

In `web/src/components/FormPlacaModelo.jsx`, add the same import, and change:
```js
              <option value="">Selecione…</option>
              {(materiais ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
```
to:
```js
              <option value="">Selecione…</option>
              {apenasAtivos(materiais, item.material_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
```

In `web/src/components/FormPlacaVenda.jsx`, add the same import, and change:
```js
          {(modelos ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
```
to:
```js
          {apenasAtivos(modelos, valores.modelo_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "esconde materiais inativos"`
Expected: PASS.

- [ ] **Step 5: Run the full Placas test file to check for regressions**

Run: `npx vitest run web/src/pages/Placas.test.jsx`
Expected: PASS (all existing tests still pass — none of them exercise inactive items, and `apenasAtivos` keeps every item whose `ativo` is `undefined` truthy... **check this**: mocked materiais in older tests don't set `ativo` at all, so `item.ativo` is `undefined` → falsy → they'd be filtered out! Fix by confirming in step 3 that `item.ativo` defaults correctly, see note below.)

> **Note:** older tests' mock fixtures (e.g. `{ id: 1, nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: null }`) don't include `ativo`, so `item.ativo` is `undefined`. Since real API responses always include `ativo` (it has a `DEFAULT 1` in SQLite and is in `CAMPOS_MATERIAL`/`CAMPOS_MODELO`), this is a test-fixture gap, not a product bug — but it means old tests using `selectOptions`/`findByLabelText('Material')` etc. would start failing. Fix it by adding `ativo: 1` to the existing material/modelo fixtures touched by material/modelo `<select>` interactions in `Placas.test.jsx`: in `it('lança lote na aba Lotes', ...)` add `ativo: 1` to the `material` object; in `it('cria modelo com um item de receita na aba Modelos', ...)` add `ativo: 1` to the `material` object; in `it('lança venda e mostra aviso de estoque negativo', ...)` add `ativo: 1` to the `modelo` object. Re-run step 5 after this fix.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/FormPlacaLote.jsx web/src/components/FormPlacaModelo.jsx web/src/components/FormPlacaVenda.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: ocultar materiais e modelos inativos dos selects de lançamento"
```

---

## Task 5: Frontend — separar ativos/inativos em AbaMateriais e AbaModelos

**Files:**
- Modify: `web/src/pages/placas/AbaMateriais.jsx`
- Modify: `web/src/pages/placas/AbaModelos.jsx`
- Modify: `web/src/styles.css`
- Test: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `api(caminho, { method })` from `web/src/api/client.js` (existing), the `ativo` field now present on every material/modelo from Task 2.

- [ ] **Step 1: Write the failing test**

Add to `web/src/pages/Placas.test.jsx`, right after the test added in Task 4 (`'esconde materiais inativos do select de novo lote'`):

```js
  it('separa materiais ativos e inativos, com botão de desativar e reativar', async () => {
    const ativo = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, estoque_atual: 0, custo_unitario_atual: null };
    const inativo = { id: 2, nome: 'Placa Antiga', ativo: 0, estoque_atual: 0, custo_unitario_atual: null };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] } },
      'GET /placas/materiais': [ativo, inativo],
      'POST /placas/materiais/2/ativar': { ...inativo, ativo: 1 },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Materiais' }));
    expect(await screen.findByText('Inativos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reativar' }));
    const post = chamadas.find((c) => c.caminho === '/placas/materiais/2/ativar');
    expect(post.metodo).toBe('POST');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "separa materiais ativos e inativos"`
Expected: FAIL — no "Inativos" divider, no "Reativar" button yet.

- [ ] **Step 3: Add CSS for the divider and muted row**

In `web/src/styles.css`, right after the `.item-atrasado { color: var(--perigo); font-weight: 600; }` line, add:

```css
.tabela__linha--inativa { opacity: 0.55; }
.tabela__divisoria td { padding: 4px 12px; font-size: 0.75rem; color: var(--texto-suave); border-bottom: 1px solid var(--borda); }
```

- [ ] **Step 4: Rewrite `AbaMateriais.jsx`**

Replace the full file with:

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaMaterial } from '../../components/FormPlacaMaterial.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';

export function AbaMateriais() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: materiais, erro, recarregar } = useCarregar(() => api('/placas/materiais'), []);

  async function criar(dados) {
    await api('/placas/materiais', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/materiais/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(material) {
    if (!window.confirm(`Excluir o material ${material.nome}?`)) return;
    await api(`/placas/materiais/${material.id}`, { method: 'DELETE' });
    recarregar();
  }

  async function desativar(material) {
    await api(`/placas/materiais/${material.id}/desativar`, { method: 'POST' });
    recarregar();
  }

  async function ativar(material) {
    await api(`/placas/materiais/${material.id}/ativar`, { method: 'POST' });
    recarregar();
  }

  function linhaMaterial(m) {
    return (
      <tr key={m.id} className={m.ativo ? undefined : 'tabela__linha--inativa'}>
        <td>{m.nome}</td>
        <td className="num">
          {m.estoque_atual < 0 ? <span className="etiqueta etiqueta--atrasada">{m.estoque_atual}</span> : m.estoque_atual}
        </td>
        <td className="num">{m.custo_unitario_atual === null ? '—' : formatarDinheiro(m.custo_unitario_atual)}</td>
        <td>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(m)}>Editar</button>{' '}
          {m.ativo ? (
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => desativar(m)}>Desativar</button>
          ) : (
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => ativar(m)}>Reativar</button>
          )}{' '}
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button>
        </td>
      </tr>
    );
  }

  const ativos = (materiais ?? []).filter((m) => m.ativo);
  const inativos = (materiais ?? []).filter((m) => !m.ativo);

  return (
    <section>
      <header className="pagina__topo">
        <h2>Materiais</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Material</button>
      </header>
      <Aviso erro={erro} />
      {materiais && (materiais.length ? (
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="num">Estoque atual</th><th className="num">Custo unitário atual</th><th></th></tr></thead>
          <tbody>
            {ativos.map(linhaMaterial)}
            {inativos.length > 0 && <tr className="tabela__divisoria"><td colSpan={4}>Inativos</td></tr>}
            {inativos.map(linhaMaterial)}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum material cadastrado.</p>)}
      {criando && (
        <Modal titulo="Novo material" onFechar={() => setCriando(false)}>
          <FormPlacaMaterial rotuloBotao="Criar material" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar material" onFechar={() => setEditando(null)}>
          <FormPlacaMaterial inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Rewrite `AbaModelos.jsx`**

Replace the full file with:

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaModelo } from '../../components/FormPlacaModelo.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';

export function AbaModelos() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: modelos, erro, recarregar } = useCarregar(() => api('/placas/modelos'), []);

  async function criar(dados) {
    await api('/placas/modelos', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/modelos/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(modelo) {
    if (!window.confirm(`Excluir o modelo ${modelo.nome}?`)) return;
    await api(`/placas/modelos/${modelo.id}`, { method: 'DELETE' });
    recarregar();
  }

  async function desativar(modelo) {
    await api(`/placas/modelos/${modelo.id}/desativar`, { method: 'POST' });
    recarregar();
  }

  async function ativar(modelo) {
    await api(`/placas/modelos/${modelo.id}/ativar`, { method: 'POST' });
    recarregar();
  }

  function linhaModelo(m) {
    return (
      <tr key={m.id} className={m.ativo ? undefined : 'tabela__linha--inativa'}>
        <td>{m.nome}</td>
        <td className="num">{formatarDinheiro(m.preco_venda_centavos)}</td>
        <td className="num">{m.custo_previsto_centavos === null ? '—' : formatarDinheiro(m.custo_previsto_centavos)}</td>
        <td className="num">{m.lucro_previsto_centavos === null ? '—' : formatarDinheiro(m.lucro_previsto_centavos)}</td>
        <td>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(m)}>Editar</button>{' '}
          {m.ativo ? (
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => desativar(m)}>Desativar</button>
          ) : (
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => ativar(m)}>Reativar</button>
          )}{' '}
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button>
        </td>
      </tr>
    );
  }

  const ativos = (modelos ?? []).filter((m) => m.ativo);
  const inativos = (modelos ?? []).filter((m) => !m.ativo);

  return (
    <section>
      <header className="pagina__topo">
        <h2>Modelos</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Modelo</button>
      </header>
      <Aviso erro={erro} />
      {modelos && (modelos.length ? (
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="num">Preço de venda</th><th className="num">Custo previsto</th><th className="num">Lucro previsto</th><th></th></tr></thead>
          <tbody>
            {ativos.map(linhaModelo)}
            {inativos.length > 0 && <tr className="tabela__divisoria"><td colSpan={5}>Inativos</td></tr>}
            {inativos.map(linhaModelo)}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum modelo cadastrado.</p>)}
      {criando && (
        <Modal titulo="Novo modelo" onFechar={() => setCriando(false)}>
          <FormPlacaModelo rotuloBotao="Criar modelo" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar modelo" onFechar={() => setEditando(null)}>
          <FormPlacaModelo inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "separa materiais ativos e inativos"`
Expected: PASS.

- [ ] **Step 7: Run the full Placas test file to check for regressions**

Run: `npx vitest run web/src/pages/Placas.test.jsx`
Expected: PASS. (The `'cria modelo com um item de receita na aba Modelos'` test's `POST /placas/modelos` mock response doesn't include `ativo` — `undefined` is falsy, so that freshly-created modelo would render in the "Inativos" section of a *subsequent* fetch, but this test never re-fetches the list after creating, it only checks the POST body, so it's unaffected. No fixture changes needed here.)

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/placas/AbaMateriais.jsx web/src/pages/placas/AbaModelos.jsx web/src/styles.css web/src/pages/Placas.test.jsx
git commit -m "feat: separar materiais e modelos inativos na listagem, com desativar/reativar"
```

---

## Task 6: Migration — tabelas de avarias

**Files:**
- Create: `server/db/migrations/010_placas_avarias.sql`

**Interfaces:**
- Produces: `placas_avarias` (`id, modelo_id, quantidade, custo_unitario_centavos, observacao, data_avaria, criado_em, atualizado_em`) and `placas_avarias_itens` (`id, avaria_id, material_id, quantidade`), consumed by Task 8 (repos) and Task 7 (domain, via test fixtures only — domain functions take plain arrays, not DB rows).

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE placas_avarias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  custo_unitario_centavos INTEGER NOT NULL,
  observacao TEXT,
  data_avaria TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE placas_avarias_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaria_id INTEGER NOT NULL REFERENCES placas_avarias(id),
  material_id INTEGER NOT NULL REFERENCES placas_materiais(id),
  quantidade INTEGER NOT NULL
);
```

- [ ] **Step 2: Verify it applies cleanly**

Run: `npx vitest run server/routes/placas.test.js`
Expected: PASS (migration applies in-memory without errors; no route uses the new tables yet).

- [ ] **Step 3: Commit**

```bash
git add server/db/migrations/010_placas_avarias.sql
git commit -m "feat: tabelas placas_avarias e placas_avarias_itens"
```

---

## Task 7: Domínio — funções puras de avarias (custo, consumo, prejuízo)

**Files:**
- Modify: `server/domain/placas.js`
- Test: `server/domain/placas.test.js`

**Interfaces:**
- Produces:
  - `custoItensAvaria(itens, lotes) => number|null` — sums `item.quantidade * custoAtualMaterial(item.material_id, lotes)`; `null` if `itens` is empty or any material has no lote.
  - `quantidadeConsumidaAvariaMaterial(materialId, avarias, itensAvaria) => number`.
  - `estoqueMaterial(materialId, lotes, vendas, itensModelo, avarias = [], itensAvaria = []) => number` (changed signature, backward compatible via defaults).
  - `materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo, avarias = [], itensAvaria = []) => array` (changed signature, backward compatible via defaults).
  - `resumoPrejuizoAvarias(avarias, modelos) => { total_centavos, por_modelo: [{ modelo_id, modelo_nome, quantidade, total_centavos }] }`.
- Consumed by: Task 9 (routes).

- [ ] **Step 1: Write the failing tests**

Add to `server/domain/placas.test.js`, right after the existing `describe('custoReceitaModelo', ...)` block:

```js
describe('custoItensAvaria', () => {
  it('soma o custo atual de cada item, igual à receita de um modelo', () => {
    const itens = [
      { material_id: PLACA, quantidade: 1 },
      { material_id: ADESIVO_10x10, quantidade: 1 },
      { material_id: TAG_NFC, quantidade: 1 },
    ];
    expect(custoItensAvaria(itens, lotes)).toBe(376);
  });

  it('retorna null se algum material não tem lote', () => {
    expect(custoItensAvaria([{ material_id: 999, quantidade: 1 }], lotes)).toBeNull();
  });

  it('retorna null para lista vazia', () => {
    expect(custoItensAvaria([], lotes)).toBeNull();
  });
});
```

Add, right after the existing `describe('estoqueMaterial', ...)` block:

```js
describe('quantidadeConsumidaAvariaMaterial', () => {
  it('soma item.quantidade * avaria.quantidade por avaria', () => {
    const avarias = [{ id: 1, quantidade: 2 }];
    const itensAvaria = [{ avaria_id: 1, material_id: PLACA, quantidade: 1 }];
    expect(quantidadeConsumidaAvariaMaterial(PLACA, avarias, itensAvaria)).toBe(2);
  });

  it('ignora itens de outras avarias', () => {
    const avarias = [{ id: 1, quantidade: 2 }, { id: 2, quantidade: 5 }];
    const itensAvaria = [
      { avaria_id: 1, material_id: PLACA, quantidade: 1 },
      { avaria_id: 2, material_id: ADESIVO_10x10, quantidade: 1 },
    ];
    expect(quantidadeConsumidaAvariaMaterial(PLACA, avarias, itensAvaria)).toBe(2);
  });
});

describe('estoqueMaterial com avarias', () => {
  it('subtrai também o consumo de avarias', () => {
    const avarias = [{ id: 1, quantidade: 1 }];
    const itensAvaria = [{ avaria_id: 1, material_id: PLACA, quantidade: 1 }];
    expect(estoqueMaterial(PLACA, lotes, [], [], avarias, itensAvaria)).toBe(10 - 1);
  });
});
```

Add, at the end of the file:

```js
describe('resumoPrejuizoAvarias', () => {
  it('agrega custo total e por modelo', () => {
    const avariasLista = [
      { modelo_id: MODELO_10x10, quantidade: 2, custo_unitario_centavos: 376 },
      { modelo_id: MODELO_10x10, quantidade: 1, custo_unitario_centavos: 400 },
      { modelo_id: MODELO_10x15, quantidade: 1, custo_unitario_centavos: 2055 },
    ];
    const modelosLista = [
      { id: MODELO_10x10, nome: 'Placa 10x10 PVC' },
      { id: MODELO_10x15, nome: 'Placa 10x15 Acrílico' },
    ];
    const resumo = resumoPrejuizoAvarias(avariasLista, modelosLista);
    expect(resumo.total_centavos).toBe(376 * 2 + 400 + 2055);
    const do10x10 = resumo.por_modelo.find((r) => r.modelo_id === MODELO_10x10);
    expect(do10x10).toMatchObject({ quantidade: 3, total_centavos: 376 * 2 + 400, modelo_nome: 'Placa 10x10 PVC' });
  });
});
```

Update the import line at the top of the file to include the new functions:

```js
import {
  custoUnitarioLote, custoAtualMaterial, estoqueMaterial, custoReceitaModelo,
  lucroPrevisto, lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
  custoItensAvaria, quantidadeConsumidaAvariaMaterial, resumoPrejuizoAvarias,
} from './placas.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/domain/placas.test.js`
Expected: FAIL — `custoItensAvaria`, `quantidadeConsumidaAvariaMaterial`, `resumoPrejuizoAvarias` are not exported yet.

- [ ] **Step 3: Implement the domain functions**

In `server/domain/placas.js`, replace:

```js
export function custoReceitaModelo(modeloId, itensModelo, lotes) {
  const itens = itensModelo.filter((i) => i.modelo_id === modeloId);
  if (!itens.length) return null;
  let total = 0;
  for (const item of itens) {
    const custo = custoAtualMaterial(item.material_id, lotes);
    if (custo === null) return null;
    total += custo * item.quantidade;
  }
  return total;
}
```

with:

```js
export function custoItensAvaria(itens, lotes) {
  if (!itens.length) return null;
  let total = 0;
  for (const item of itens) {
    const custo = custoAtualMaterial(item.material_id, lotes);
    if (custo === null) return null;
    total += custo * item.quantidade;
  }
  return total;
}

export function custoReceitaModelo(modeloId, itensModelo, lotes) {
  const itens = itensModelo.filter((i) => i.modelo_id === modeloId);
  return custoItensAvaria(itens, lotes);
}
```

Then, right after `estoqueMaterial`, change it and add the new avaria-consumption function:

```js
export function quantidadeConsumidaAvariaMaterial(materialId, avarias, itensAvaria) {
  return avarias.reduce((soma, avaria) => {
    const porUnidade = itensAvaria
      .filter((i) => i.avaria_id === avaria.id && i.material_id === materialId)
      .reduce((s, i) => s + i.quantidade, 0);
    return soma + porUnidade * avaria.quantidade;
  }, 0);
}

export function estoqueMaterial(materialId, lotes, vendas, itensModelo, avarias = [], itensAvaria = []) {
  return totalCompradoMaterial(materialId, lotes)
    - quantidadeConsumidaMaterial(materialId, vendas, itensModelo)
    - quantidadeConsumidaAvariaMaterial(materialId, avarias, itensAvaria);
}
```

(Remove the old single-return-line `estoqueMaterial` definition — it's being replaced by the version above with the two extra parameters.)

Finally, change `materiaisComEstoqueNegativo` and add `resumoPrejuizoAvarias` at the end of the file:

```js
export function materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo, avarias = [], itensAvaria = []) {
  return materiais
    .map((m) => ({ ...m, estoque_atual: estoqueMaterial(m.id, lotes, vendas, itensModelo, avarias, itensAvaria) }))
    .filter((m) => m.estoque_atual < 0);
}

export function resumoPrejuizoAvarias(avarias, modelos) {
  const porModelo = new Map();
  for (const avaria of avarias) {
    const atual = porModelo.get(avaria.modelo_id) ?? { modelo_id: avaria.modelo_id, quantidade: 0, total_centavos: 0 };
    atual.quantidade += avaria.quantidade;
    atual.total_centavos += avaria.custo_unitario_centavos * avaria.quantidade;
    porModelo.set(avaria.modelo_id, atual);
  }
  const porModeloComNome = [...porModelo.values()].map((r) => ({
    ...r,
    modelo_nome: modelos.find((m) => m.id === r.modelo_id)?.nome ?? '—',
  }));
  return {
    total_centavos: porModeloComNome.reduce((soma, r) => soma + r.total_centavos, 0),
    por_modelo: porModeloComNome,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/domain/placas.test.js`
Expected: PASS, including the pre-existing `custoReceitaModelo`, `estoqueMaterial` and `materiaisComEstoqueNegativo` tests (they call the functions with the same old arguments, which still work thanks to the new parameters' defaults).

- [ ] **Step 5: Commit**

```bash
git add server/domain/placas.js server/domain/placas.test.js
git commit -m "feat: funções de domínio para custo e consumo de avarias"
```

---

## Task 8: Backend — repos de avarias

**Files:**
- Modify: `server/repos/placas.js`

**Interfaces:**
- Produces: `repoPlacasAvarias(db)` → `{ obter, listar, criar, atualizar, remover }` (listed by `data_avaria DESC, id DESC`); `repoPlacasAvariasItens(db)` → same plus `listar({ avaria_id })` filter and `removerPorAvaria(avariaId)`.
- Consumed by: Task 9 (routes).

- [ ] **Step 1: Add the repo functions**

At the end of `server/repos/placas.js`, add:

```js
export const CAMPOS_AVARIA = ['modelo_id', 'quantidade', 'custo_unitario_centavos', 'observacao', 'data_avaria'];
export function repoPlacasAvarias(db) {
  const base = criarRepo(db, 'placas_avarias', CAMPOS_AVARIA);
  return { ...base, listar: () => base.listar({}, 'data_avaria DESC, id DESC') };
}

export const CAMPOS_ITEM_AVARIA = ['avaria_id', 'material_id', 'quantidade'];
export function repoPlacasAvariasItens(db) {
  const base = criarRepo(db, 'placas_avarias_itens', CAMPOS_ITEM_AVARIA);
  return {
    ...base,
    listar({ avaria_id } = {}) {
      const filtro = {};
      if (avaria_id) filtro.avaria_id = Number(avaria_id);
      return base.listar(filtro, 'id');
    },
    removerPorAvaria(avariaId) {
      db.prepare('DELETE FROM placas_avarias_itens WHERE avaria_id = ?').run(avariaId);
    },
  };
}
```

This mirrors `repoPlacasVendas`/`repoPlacasModelosItens` exactly — no new test file needed on its own; it's exercised end-to-end by Task 9's route tests.

- [ ] **Step 2: Sanity check it loads**

Run: `npx vitest run server/routes/placas.test.js`
Expected: PASS (new exports don't change any existing behavior yet).

- [ ] **Step 3: Commit**

```bash
git add server/repos/placas.js
git commit -m "feat: repos de placas_avarias e placas_avarias_itens"
```

---

## Task 9: Backend — rotas CRUD de avarias + prejuízo no resumo/materiais

**Files:**
- Modify: `server/routes/placas.js`
- Test: `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `repoPlacasAvarias`, `repoPlacasAvariasItens` (Task 8); `custoItensAvaria`, `materiaisComEstoqueNegativo`, `resumoPrejuizoAvarias` (Task 7); `validarItens` (existing closure in `rotasPlacas`).
- Produces:
  - `GET /placas/avarias` → `[{ ...avaria, itens, custo_total_centavos, modelo_nome }]`.
  - `POST /placas/avarias` → body `{ modelo_id, quantidade?, observacao?, data_avaria, itens? }` → `{ avaria: {...}, avisos_estoque: [...] }`. `itens` omitted ⇒ copies the modelo's current recipe.
  - `PUT /placas/avarias/:id` → partial update, recalculates `custo_unitario_centavos` when `itens` is sent.
  - `DELETE /placas/avarias/:id`.
  - `GET /placas/materiais` and `GET /placas/resumo` now account for avaria consumption in `estoque_atual`; `GET /placas/resumo` gains `prejuizo_avarias`.

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/placas.test.js`, right after the `describe('/api/placas/vendas', ...)` block (before `describe('/api/placas/resumo', ...)`):

```js
async function criarAvaria(modeloId, overrides = {}) {
  return (await ctx.http.post('/api/placas/avarias').send({
    modelo_id: modeloId, data_avaria: '2026-09-23', ...overrides,
  }).expect(201)).body;
}

describe('/api/placas/avarias', () => {
  it('lança avaria usando a receita atual do modelo e calcula o custo snapshot', async () => {
    const modelo = await montarModeloCompleto();
    const res = await criarAvaria(modelo.id);
    expect(res.avaria).toMatchObject({ modelo_id: modelo.id, quantidade: 1, custo_unitario_centavos: 1245, custo_total_centavos: 1245 });
    expect(res.avaria.itens).toHaveLength(1);
    expect(res.avisos_estoque).toEqual([]);
  });

  it('aceita receita customizada só para esse lançamento, sem alterar a receita do modelo', async () => {
    const placa = await criarMaterial({ nome: 'Placa 10x10 PVC' });
    await criarLote(placa.id, { quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0 });
    const extra = await criarMaterial({ nome: 'Verniz extra' });
    await criarLote(extra.id, { quantidade: 10, valor_kit_centavos: 1000, valor_frete_centavos: 0 });
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }], { preco_venda_centavos: 8000 });

    const res = await criarAvaria(modelo.id, { itens: [{ material_id: extra.id, quantidade: 2 }] });
    expect(res.avaria.itens).toEqual([expect.objectContaining({ material_id: extra.id, quantidade: 2 })]);
    expect(res.avaria.custo_unitario_centavos).toBe(200);

    const modeloDepois = await ctx.http.get('/api/placas/modelos').expect(200);
    expect(modeloDepois.body[0].itens).toEqual([expect.objectContaining({ material_id: placa.id, quantidade: 1 })]);
  });

  it('recusa quando nenhum material da avaria tem lote comprado', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const res = await ctx.http.post('/api/placas/avarias').send({ modelo_id: modelo.id, data_avaria: '2026-09-23' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'itens', mensagem: 'Algum material ainda não tem lote comprado' }]);
  });

  it('avisa sem bloquear quando o estoque fica negativo', async () => {
    const modelo = await montarModeloCompleto();
    const res = await criarAvaria(modelo.id, { quantidade: 3 });
    expect(res.avisos_estoque).toHaveLength(1);
    expect(res.avisos_estoque[0]).toMatchObject({ estoque_atual: -1 });
  });

  it('considera o consumo de avarias no estoque do material', async () => {
    const modelo = await montarModeloCompleto();
    await criarAvaria(modelo.id);
    const materiaisRes = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(materiaisRes.body[0].estoque_atual).toBe(1);
  });

  it('lista avarias com nome do modelo e custo total', async () => {
    const modelo = await montarModeloCompleto();
    await criarAvaria(modelo.id);
    const res = await ctx.http.get('/api/placas/avarias').expect(200);
    expect(res.body[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', custo_total_centavos: 1245 });
  });

  it('edita quantidade e observação', async () => {
    const modelo = await montarModeloCompleto();
    const criada = (await criarAvaria(modelo.id)).avaria;
    const res = await ctx.http.put(`/api/placas/avarias/${criada.id}`).send({ observacao: 'Quebrou no transporte' }).expect(200);
    expect(res.body.observacao).toBe('Quebrou no transporte');
  });

  it('edita a receita recalculando o custo', async () => {
    const modelo = await montarModeloCompleto();
    const extra = await criarMaterial({ nome: 'Verniz extra' });
    await criarLote(extra.id, { quantidade: 10, valor_kit_centavos: 500, valor_frete_centavos: 0 });
    const criada = (await criarAvaria(modelo.id)).avaria;
    const res = await ctx.http.put(`/api/placas/avarias/${criada.id}`).send({
      itens: [{ material_id: extra.id, quantidade: 1 }],
    }).expect(200);
    expect(res.body.custo_unitario_centavos).toBe(50);
    expect(res.body.itens).toEqual([expect.objectContaining({ material_id: extra.id, quantidade: 1 })]);
  });

  it('exclui avaria', async () => {
    const modelo = await montarModeloCompleto();
    const criada = (await criarAvaria(modelo.id)).avaria;
    await ctx.http.delete(`/api/placas/avarias/${criada.id}`).expect(204);
    const res = await ctx.http.get('/api/placas/avarias').expect(200);
    expect(res.body).toEqual([]);
  });

  it('responde 404 ao editar ou excluir avaria inexistente', async () => {
    await ctx.http.put('/api/placas/avarias/999').send({ observacao: 'x' }).expect(404);
    await ctx.http.delete('/api/placas/avarias/999').expect(404);
  });
});
```

Add, inside the existing `describe('/api/placas/resumo', ...)` block (after its one existing `it`):

```js
  it('inclui prejuízo com avarias agregado por modelo', async () => {
    const modelo = await montarModeloCompleto();
    await criarAvaria(modelo.id);
    const res = await ctx.http.get('/api/placas/resumo').expect(200);
    expect(res.body.prejuizo_avarias.total_centavos).toBe(1245);
    expect(res.body.prejuizo_avarias.por_modelo[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', quantidade: 1, total_centavos: 1245 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/placas.test.js`
Expected: FAIL — `/api/placas/avarias` routes don't exist (404s), and `prejuizo_avarias` is `undefined`.

- [ ] **Step 3: Wire up the new repos and domain imports**

In `server/routes/placas.js`, change the imports:

```js
import { repoPlacasMateriais, repoPlacasLotes, repoPlacasModelos, repoPlacasModelosItens, repoPlacasVendas } from '../repos/placas.js';
```
to:
```js
import {
  repoPlacasMateriais, repoPlacasLotes, repoPlacasModelos, repoPlacasModelosItens, repoPlacasVendas,
  repoPlacasAvarias, repoPlacasAvariasItens,
} from '../repos/placas.js';
```

and:
```js
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
} from '../domain/placas.js';
```
to:
```js
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
  custoItensAvaria, resumoPrejuizoAvarias,
} from '../domain/placas.js';
```

Right after `const clientes = repoClientes(db);`, add:
```js
  const avarias = repoPlacasAvarias(db);
  const itensAvaria = repoPlacasAvariasItens(db);
```

Add the validation rules, right after `REGRAS_VENDA`:
```js
const REGRAS_AVARIA = {
  modelo_id: { tipo: 'inteiro', obrigatorio: true },
  quantidade: { tipo: 'inteiro', min: 1 },
  observacao: { tipo: 'texto' },
  data_avaria: { tipo: 'data', obrigatorio: true },
};
```

- [ ] **Step 4: Update `comCalculo` to count avaria consumption**

Change:
```js
  function comCalculo(material) {
    const lotesTodos = lotes.listar();
    const vendasTodas = vendas.listar();
    const todosItens = itensModelo.listar();
    return {
      ...material,
      estoque_atual: estoqueMaterial(material.id, lotesTodos, vendasTodas, todosItens),
      custo_unitario_atual: custoAtualMaterial(material.id, lotesTodos),
    };
  }
```
to:
```js
  function comCalculo(material) {
    const lotesTodos = lotes.listar();
    const vendasTodas = vendas.listar();
    const todosItens = itensModelo.listar();
    const avariasTodas = avarias.listar();
    const todosItensAvaria = itensAvaria.listar();
    return {
      ...material,
      estoque_atual: estoqueMaterial(material.id, lotesTodos, vendasTodas, todosItens, avariasTodas, todosItensAvaria),
      custo_unitario_atual: custoAtualMaterial(material.id, lotesTodos),
    };
  }
```

- [ ] **Step 5: Add `montarAvaria` and the five routes**

Right after `montarModelo`, add:
```js
  function montarAvaria(avaria) {
    return {
      ...avaria,
      itens: itensAvaria.listar({ avaria_id: avaria.id }),
      custo_total_centavos: avaria.custo_unitario_centavos * avaria.quantidade,
    };
  }
```

Right after the `r.get('/placas/vendas', ...)`/`r.post('/placas/vendas', ...)`/`r.put`/`r.delete` block and before `r.get('/placas/resumo', ...)`, add:

```js
  r.get('/placas/avarias', (req, res) => {
    const modelosTodos = modelos.listar();
    res.json(avarias.listar().map((a) => ({
      ...montarAvaria(a),
      modelo_nome: modelosTodos.find((m) => m.id === a.modelo_id)?.nome ?? '—',
    })));
  });

  r.post('/placas/avarias', (req, res) => {
    const dados = validar(req.body, REGRAS_AVARIA);
    const modelo = modelos.obter(dados.modelo_id);
    if (!modelo) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo não encontrado' }]);

    const itensBrutos = req.body.itens !== undefined
      ? req.body.itens
      : itensModelo.listar({ modelo_id: modelo.id }).map((i) => ({ material_id: i.material_id, quantidade: i.quantidade }));
    const itens = validarItens(itensBrutos);
    if (!itens.length) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Informe ao menos um material consumido' }]);

    const lotesTodos = lotes.listar();
    const custoUnitario = custoItensAvaria(itens, lotesTodos);
    if (custoUnitario === null) {
      throw new ErroValidacao([{ campo: 'itens', mensagem: 'Algum material ainda não tem lote comprado' }]);
    }

    const quantidade = dados.quantidade ?? 1;
    const criada = emTransacao(db, () => {
      const avaria = avarias.criar({ ...dados, quantidade, custo_unitario_centavos: custoUnitario });
      for (const item of itens) itensAvaria.criar({ ...item, avaria_id: avaria.id });
      return avaria;
    });

    const vendasTodas = vendas.listar();
    const todosItensModelo = itensModelo.listar();
    const avariasTodas = avarias.listar();
    const todosItensAvaria = itensAvaria.listar();
    const materiaisAfetados = itens.map((i) => materiais.obter(i.material_id));
    const avisosEstoque = materiaisComEstoqueNegativo(
      materiaisAfetados, lotesTodos, vendasTodas, todosItensModelo, avariasTodas, todosItensAvaria,
    ).map((m) => ({ material_id: m.id, nome: m.nome, estoque_atual: m.estoque_atual }));

    res.status(201).json({ avaria: montarAvaria(criada), avisos_estoque: avisosEstoque });
  });

  r.put('/placas/avarias/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!avarias.obter(id)) throw naoEncontrado('Avaria');
    const dados = validar(req.body, REGRAS_AVARIA, { parcial: true });
    const itens = req.body.itens !== undefined ? validarItens(req.body.itens) : null;
    if (itens) {
      if (!itens.length) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Informe ao menos um material consumido' }]);
      const custoUnitario = custoItensAvaria(itens, lotes.listar());
      if (custoUnitario === null) {
        throw new ErroValidacao([{ campo: 'itens', mensagem: 'Algum material ainda não tem lote comprado' }]);
      }
      dados.custo_unitario_centavos = custoUnitario;
    }
    emTransacao(db, () => {
      if (Object.keys(dados).length) avarias.atualizar(id, dados);
      if (itens) {
        itensAvaria.removerPorAvaria(id);
        for (const item of itens) itensAvaria.criar({ ...item, avaria_id: id });
      }
    });
    res.json(montarAvaria(avarias.obter(id)));
  });

  r.delete('/placas/avarias/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!avarias.obter(id)) throw naoEncontrado('Avaria');
    emTransacao(db, () => {
      itensAvaria.removerPorAvaria(id);
      avarias.remover(id);
    });
    res.status(204).end();
  });

```

- [ ] **Step 6: Update `/placas/resumo` to include avaria consumption and `prejuizo_avarias`**

Change:
```js
  r.get('/placas/resumo', (req, res) => {
    const materiaisTodos = materiais.listar();
    const modelosTodos = modelos.listar();
    const lotesTodos = lotes.listar();
    const vendasTodas = vendas.listar();
    const todosItens = itensModelo.listar();

    const lucroPrevistoPorModelo = modelosTodos.map((m) => {
      const custoReceita = custoReceitaModelo(m.id, todosItens, lotesTodos);
      return {
        modelo_id: m.id,
        modelo_nome: m.nome,
        preco_venda_centavos: m.preco_venda_centavos,
        custo_previsto_centavos: custoReceita,
        lucro_previsto_centavos: lucroPrevisto(m, custoReceita),
      };
    });

    const materiaisComEstoque = materiaisTodos.map((m) => ({
      material_id: m.id,
      nome: m.nome,
      estoque_atual: estoqueMaterial(m.id, lotesTodos, vendasTodas, todosItens),
    }));

    res.json({
      lucro_previsto_por_modelo: lucroPrevistoPorModelo,
      lucro_real_por_modelo: resumoLucroReal(vendasTodas).map((rl) => ({
        ...rl,
        modelo_nome: modelosTodos.find((m) => m.id === rl.modelo_id)?.nome ?? '—',
      })),
      materiais: materiaisComEstoque,
    });
  });
```
to:
```js
  r.get('/placas/resumo', (req, res) => {
    const materiaisTodos = materiais.listar();
    const modelosTodos = modelos.listar();
    const lotesTodos = lotes.listar();
    const vendasTodas = vendas.listar();
    const todosItens = itensModelo.listar();
    const avariasTodas = avarias.listar();
    const todosItensAvaria = itensAvaria.listar();

    const lucroPrevistoPorModelo = modelosTodos.map((m) => {
      const custoReceita = custoReceitaModelo(m.id, todosItens, lotesTodos);
      return {
        modelo_id: m.id,
        modelo_nome: m.nome,
        preco_venda_centavos: m.preco_venda_centavos,
        custo_previsto_centavos: custoReceita,
        lucro_previsto_centavos: lucroPrevisto(m, custoReceita),
      };
    });

    const materiaisComEstoque = materiaisTodos.map((m) => ({
      material_id: m.id,
      nome: m.nome,
      estoque_atual: estoqueMaterial(m.id, lotesTodos, vendasTodas, todosItens, avariasTodas, todosItensAvaria),
    }));

    res.json({
      lucro_previsto_por_modelo: lucroPrevistoPorModelo,
      lucro_real_por_modelo: resumoLucroReal(vendasTodas).map((rl) => ({
        ...rl,
        modelo_nome: modelosTodos.find((m) => m.id === rl.modelo_id)?.nome ?? '—',
      })),
      materiais: materiaisComEstoque,
      prejuizo_avarias: resumoPrejuizoAvarias(avariasTodas, modelosTodos),
    });
  });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run server/routes/placas.test.js`
Expected: PASS, all tests including the new avaria ones.

- [ ] **Step 8: Commit**

```bash
git add server/routes/placas.js server/routes/placas.test.js
git commit -m "feat: rotas de avarias e prejuízo agregado no resumo"
```

---

## Task 10: Frontend — `FormPlacaAvaria`

**Files:**
- Create: `web/src/components/FormPlacaAvaria.jsx`
- Test: `web/src/components/FormPlacaAvaria.test.jsx`

**Interfaces:**
- Consumes: `api`, `useCarregar`, `useFormulario`, `useEnvio`, `Campo`, `Aviso`, `apenasAtivos` (Task 3), `hojeISO` — all existing.
- Produces: `FormPlacaAvaria({ inicial, rotuloBotao, onSalvar })`, calling `onSalvar({ modelo_id, quantidade, observacao, data_avaria, itens: [{ material_id, quantidade }] })`. Consumed by Task 11 (`AbaAvarias`).

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormPlacaAvaria } from './FormPlacaAvaria.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('FormPlacaAvaria', () => {
  it('pré-carrega os itens com a receita do modelo selecionado, e troca a receita ao trocar de modelo', async () => {
    const modeloA = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, itens: [{ material_id: 1, quantidade: 1 }] };
    const modeloB = { id: 2, nome: 'Placa 10x15 Acrílico', ativo: 1, itens: [{ material_id: 2, quantidade: 1 }] };
    mockApi({
      'GET /placas/modelos': [modeloA, modeloB],
      'GET /placas/materiais': [
        { id: 1, nome: 'Placa 10x10 PVC', ativo: 1 },
        { id: 2, nome: 'Placa 10x15 Acrílico', ativo: 1 },
      ],
    });
    renderizar(<FormPlacaAvaria onSalvar={() => {}} />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Modelo'), '1');
    expect(await screen.findByLabelText('Material do item 1')).toHaveValue('1');

    await user.click(screen.getByRole('button', { name: '+ Item da receita' }));
    expect(screen.getByLabelText('Material do item 2')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Modelo'), '2');
    expect(await screen.findByLabelText('Material do item 1')).toHaveValue('2');
    expect(screen.queryByLabelText('Material do item 2')).not.toBeInTheDocument();
  });

  it('envia os itens editados e os campos do lançamento', async () => {
    const modelo = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, itens: [{ material_id: 1, quantidade: 1 }] };
    mockApi({
      'GET /placas/modelos': [modelo],
      'GET /placas/materiais': [{ id: 1, nome: 'Placa 10x10 PVC', ativo: 1 }],
    });
    const enviados = [];
    renderizar(<FormPlacaAvaria onSalvar={(dados) => enviados.push(dados)} rotuloBotao="Lançar avaria" />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Modelo'), '1');
    await user.clear(screen.getByLabelText('Quantidade avariada'));
    await user.type(screen.getByLabelText('Quantidade avariada'), '2');
    await user.type(screen.getByLabelText('Observação (opcional)'), 'Quebrou no transporte');
    await user.click(screen.getByRole('button', { name: 'Lançar avaria' }));

    expect(enviados).toEqual([{
      modelo_id: 1,
      quantidade: 2,
      observacao: 'Quebrou no transporte',
      data_avaria: expect.any(String),
      itens: [{ material_id: 1, quantidade: 1 }],
    }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/components/FormPlacaAvaria.test.jsx`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```jsx
import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { apenasAtivos } from '../lib/ativos.js';
import { hojeISO } from '../lib/datas.js';

export function FormPlacaAvaria({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo, setValores } = useFormulario({
    modelo_id: inicial.modelo_id ? String(inicial.modelo_id) : '',
    quantidade: String(inicial.quantidade ?? 1),
    observacao: inicial.observacao ?? '',
    data_avaria: inicial.data_avaria ?? hojeISO(),
  });
  const [itens, setItens] = useState(
    (inicial.itens ?? []).map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) })),
  );
  const { erros, erro, enviando, executar } = useEnvio();

  function selecionarModelo(e) {
    const modeloId = e.target.value;
    const modelo = (modelos ?? []).find((m) => String(m.id) === modeloId);
    setValores((v) => ({ ...v, modelo_id: modeloId }));
    setItens((modelo?.itens ?? []).map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) })));
  }

  function adicionarItem() {
    setItens((atual) => [...atual, { material_id: '', quantidade: '1' }]);
  }

  function removerItem(indice) {
    setItens((atual) => atual.filter((_, i) => i !== indice));
  }

  function alterarItem(indice, campoItem, valor) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campoItem]: valor } : item)));
  }

  function enviar(e) {
    e.preventDefault();
    executar(() => onSalvar({
      modelo_id: valores.modelo_id ? Number(valores.modelo_id) : null,
      quantidade: valores.quantidade ? Number(valores.quantidade) : 1,
      observacao: valores.observacao || null,
      data_avaria: valores.data_avaria,
      itens: itens.map((i) => ({ material_id: Number(i.material_id), quantidade: Number(i.quantidade) })),
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Modelo" nome="modelo_id" erros={erros}>
        <select value={valores.modelo_id} onChange={selecionarModelo}>
          <option value="">Selecione…</option>
          {apenasAtivos(modelos, valores.modelo_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <fieldset>
        <legend>Materiais consumidos nesta avaria</legend>
        {itens.map((item, indice) => (
          <div className="form--linha" key={indice}>
            <select
              aria-label={`Material do item ${indice + 1}`}
              value={item.material_id}
              onChange={(e) => alterarItem(indice, 'material_id', e.target.value)}
            >
              <option value="">Selecione…</option>
              {apenasAtivos(materiais, item.material_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <input
              aria-label={`Quantidade do item ${indice + 1}`}
              type="number"
              min="1"
              value={item.quantidade}
              onChange={(e) => alterarItem(indice, 'quantidade', e.target.value)}
            />
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => removerItem(indice)}>Remover</button>
          </div>
        ))}
        <button type="button" className="btn btn--fantasma" onClick={adicionarItem}>+ Item da receita</button>
      </fieldset>
      <Campo rotulo="Quantidade avariada" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Observação (opcional)" nome="observacao" erros={erros} {...campo('observacao')} />
      <Campo rotulo="Data" nome="data_avaria" erros={erros} type="date" {...campo('data_avaria')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/components/FormPlacaAvaria.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/FormPlacaAvaria.jsx web/src/components/FormPlacaAvaria.test.jsx
git commit -m "feat: formulário de lançamento de avaria com receita editável"
```

---

## Task 11: Frontend — aba Avarias

**Files:**
- Create: `web/src/pages/placas/AbaAvarias.jsx`
- Modify: `web/src/pages/Placas.jsx`
- Test: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `FormPlacaAvaria` (Task 10), `api`, `useCarregar`, `Aviso`, `Modal`, `formatarDinheiro`, `formatarData` — all existing.

- [ ] **Step 1: Write the failing test**

Add to `web/src/pages/Placas.test.jsx`, right after the test added in Task 5 (`'separa materiais ativos e inativos...'`):

```js
  it('lança avaria com a receita do modelo pré-carregada, na aba Avarias', async () => {
    const modelo = {
      id: 1, nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, ativo: 1,
      itens: [{ id: 1, modelo_id: 1, material_id: 1, quantidade: 1 }],
    };
    const material = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, estoque_atual: 2, custo_unitario_atual: 1245 };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] } },
      'GET /placas/avarias': [],
      'GET /placas/modelos': [modelo],
      'GET /placas/materiais': [material],
      'POST /placas/avarias': {
        avaria: {
          id: 1, modelo_id: 1, quantidade: 1, custo_unitario_centavos: 1245, custo_total_centavos: 1245,
          observacao: null, data_avaria: '2026-10-05', itens: [{ material_id: 1, quantidade: 1 }],
        },
        avisos_estoque: [],
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Avarias' }));
    await user.click(await screen.findByRole('button', { name: '+ Avaria' }));
    await user.selectOptions(await screen.findByLabelText('Modelo'), '1');
    expect(await screen.findByLabelText('Material do item 1')).toHaveValue('1');
    await user.click(screen.getByRole('button', { name: 'Lançar avaria' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/placas/avarias');
    expect(post.corpo).toEqual({
      modelo_id: 1, quantidade: 1, observacao: null, data_avaria: expect.any(String),
      itens: [{ material_id: 1, quantidade: 1 }],
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "lança avaria"`
Expected: FAIL — no "Avarias" tab exists yet.

- [ ] **Step 3: Create `AbaAvarias.jsx`**

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaAvaria } from '../../components/FormPlacaAvaria.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export function AbaAvarias() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const { dados: avarias, erro, recarregar } = useCarregar(() => api('/placas/avarias'), []);

  async function criar(dados) {
    const res = await api('/placas/avarias', { method: 'POST', body: dados });
    setCriando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/avarias/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(avaria) {
    if (!window.confirm(`Excluir esta avaria de ${avaria.modelo_nome}?`)) return;
    await api(`/placas/avarias/${avaria.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Avarias</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Avaria</button>
      </header>
      <Aviso erro={erro} />
      {avisosEstoque.length > 0 && (
        <p className="aviso aviso--erro" role="alert">
          Estoque negativo após esta avaria: {avisosEstoque.map((a) => `${a.nome} (${a.estoque_atual})`).join(', ')}
        </p>
      )}
      {avarias && (avarias.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Modelo</th><th className="num">Qtd.</th><th className="num">Custo perdido</th><th>Observação</th><th></th></tr>
          </thead>
          <tbody>
            {avarias.map((a) => (
              <tr key={a.id}>
                <td>{formatarData(a.data_avaria)}</td>
                <td>{a.modelo_nome}</td>
                <td className="num">{a.quantidade}</td>
                <td className="num">{formatarDinheiro(a.custo_total_centavos)}</td>
                <td>{a.observacao ?? '—'}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(a)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(a)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhuma avaria lançada ainda.</p>)}
      {criando && (
        <Modal titulo="Nova avaria" onFechar={() => setCriando(false)}>
          <FormPlacaAvaria rotuloBotao="Lançar avaria" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar avaria" onFechar={() => setEditando(null)}>
          <FormPlacaAvaria inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Wire the tab into `Placas.jsx`**

Replace the full file with:

```jsx
import { useState } from 'react';
import { AbaResumo } from './placas/AbaResumo.jsx';
import { AbaMateriais } from './placas/AbaMateriais.jsx';
import { AbaLotes } from './placas/AbaLotes.jsx';
import { AbaModelos } from './placas/AbaModelos.jsx';
import { AbaVendas } from './placas/AbaVendas.jsx';
import { AbaAvarias } from './placas/AbaAvarias.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
  ['materiais', 'Materiais'],
  ['lotes', 'Lotes'],
  ['modelos', 'Modelos'],
  ['vendas', 'Vendas'],
  ['avarias', 'Avarias'],
];

export function Placas() {
  const [aba, setAba] = useState('resumo');
  return (
    <section>
      <header className="pagina__topo">
        <h1>Placas de avaliação</h1>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave} onClick={() => setAba(chave)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'resumo' && <AbaResumo />}
        {aba === 'materiais' && <AbaMateriais />}
        {aba === 'lotes' && <AbaLotes />}
        {aba === 'modelos' && <AbaModelos />}
        {aba === 'vendas' && <AbaVendas />}
        {aba === 'avarias' && <AbaAvarias />}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "lança avaria"`
Expected: PASS.

- [ ] **Step 6: Run the full Placas test file to check for regressions**

Run: `npx vitest run web/src/pages/Placas.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/placas/AbaAvarias.jsx web/src/pages/Placas.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: aba Avarias para registrar quebra de placas montadas"
```

---

## Task 12: Frontend — card "Prejuízo com avarias" no Resumo

**Files:**
- Modify: `web/src/pages/placas/AbaResumo.jsx`
- Test: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `resumo.prejuizo_avarias` from `GET /placas/resumo` (Task 9): `{ total_centavos, por_modelo: [{ modelo_id, modelo_nome, quantidade, total_centavos }] }`.

- [ ] **Step 1: Backfill existing `GET /placas/resumo` mocks**

In `web/src/pages/Placas.test.jsx`, every other `GET /placas/resumo` mock in the file (added before this task) is missing `prejuizo_avarias`, which `AbaResumo.jsx` is about to start reading. The seven that use the exact literal `{ lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] }` can be fixed in one shot — use the Edit tool with `replace_all: true`:

old_string:
```
'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
```
new_string:
```
'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] } },
```

(The tests added in Tasks 4, 5 and 11 already include `prejuizo_avarias` from the start, so `replace_all` won't touch them — they don't match this exact old string.)

The first test in the file, `it('mostra o resumo de lucro previsto, lucro real e estoque', ...)`, has a different, multi-field `GET /placas/resumo` mock — handle it separately in Step 2.

- [ ] **Step 2: Write the failing test for the new card**

In `web/src/pages/Placas.test.jsx`, change the first test's mock and assertions:

```js
  it('mostra o resumo de lucro previsto, lucro real, estoque e prejuízo com avarias', async () => {
    mockApi({
      'GET /placas/resumo': {
        lucro_previsto_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, custo_previsto_centavos: 376, lucro_previsto_centavos: 7624 },
        ],
        lucro_real_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', quantidade: 2, lucro_total_centavos: 15000, lucro_medio_centavos: 7500 },
        ],
        materiais: [{ material_id: 1, nome: 'Placa 10x10 PVC', estoque_atual: -1 }],
        prejuizo_avarias: {
          total_centavos: 1245,
          por_modelo: [{ modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', quantidade: 1, total_centavos: 1245 }],
        },
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    expect(await screen.findByRole('heading', { name: 'Placas de avaliação' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*76,24/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*75,00/)).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('Prejuízo com avarias')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*12,45/)).toBeInTheDocument();
  });
```

(This replaces the original version of that test — same `it` name slot, updated body.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "prejuízo com avarias"`
Expected: FAIL — no "Prejuízo com avarias" text yet.

- [ ] **Step 4: Add the card to `AbaResumo.jsx`**

In `web/src/pages/placas/AbaResumo.jsx`, right after the closing `</section>` of the "Estoque de materiais" `<section className="cartao">` block (and before the final `</>`), add:

```jsx
          <section className="cartao">
            <h2>Prejuízo com avarias</h2>
            <p><strong>Total perdido:</strong> {formatarDinheiro(resumo.prejuizo_avarias.total_centavos)}</p>
            {resumo.prejuizo_avarias.por_modelo.length ? (
              <table className="tabela">
                <thead><tr><th>Modelo</th><th className="num">Quantidade avariada</th><th className="num">Custo perdido</th></tr></thead>
                <tbody>
                  {resumo.prejuizo_avarias.por_modelo.map((m) => (
                    <tr key={m.modelo_id}>
                      <td>{m.modelo_nome}</td>
                      <td className="num">{m.quantidade}</td>
                      <td className="num">{formatarDinheiro(m.total_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhuma avaria lançada ainda.</p>}
          </section>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run web/src/pages/Placas.test.jsx -t "prejuízo com avarias"`
Expected: PASS.

- [ ] **Step 6: Run the full project test suite**

Run: `npm test`
Expected: PASS — every server and web test, including all of `Placas.test.jsx`, `placas.test.js` (domain and routes), `FormPlacaAvaria.test.jsx`, and `ativos.test.js`.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/placas/AbaResumo.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: card de prejuízo com avarias no resumo de placas"
```

---

## Self-Review Notes

- **Spec coverage:** soft `ativo` toggle (Tasks 1–5), ativos-first-then-divider listing (Task 5), hiding inactive items from launch selects while preserving the currently-selected one (Tasks 3–4, 10), avarias with default-from-recipe-but-freely-editable snapshot (Tasks 6–10), avaria stock consumption (Task 7, 9), avaria cost/loss snapshot and resumo aggregation (Task 7, 9, 12). All "Fora de escopo" items from the spec (no bulk select, no inactive filter toggle, no avaria report/graph, no re-warning stock on edit, no preset avaria reasons) are simply not built — nothing in the plan contradicts them.
- **Placeholder scan:** no TODO/TBD; every step has literal code or an exact shell command.
- **Type/signature consistency:** `estoqueMaterial`/`materiaisComEstoqueNegativo` keep their original 4 params as a prefix and add 2 optional ones, so every pre-existing call site in `server/routes/placas.js` (not touched until Task 9) keeps compiling; Task 9 updates the two call sites that need the new args (`comCalculo`, `/placas/resumo`) and the one that needs them for the new avaria flow (`materiaisComEstoqueNegativo` inside `POST /placas/avarias`). `apenasAtivos(lista, valorSelecionado)` has one consistent signature across Tasks 4 and 10.
