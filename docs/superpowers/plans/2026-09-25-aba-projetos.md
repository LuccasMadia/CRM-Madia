# Aba dedicada de Projetos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, read-only "Projetos" tab that lists every project in a table (client, title, stage, total value), with filters by stage and client, ordered by most-recently-updated first, hiding "Perdido" projects unless explicitly selected.

**Architecture:** A new frontend-only page (`web/src/pages/Projetos.jsx`) reusing the existing `GET /projetos` endpoint (already supports `?etapa=` and `?cliente_id=` query params and already returns `cliente_nome`, `valor_total_centavos`, `etapa`, `atualizado_em`). No backend changes. The page filters out `etapa === 'perdido'` client-side when no stage filter is active, and sorts client-side by `atualizado_em` descending, since the endpoint's default order (by `prazo_entrega`, used by the Funil kanban) doesn't fit this view. Wired into the existing sidebar nav and router in `web/src/App.jsx`.

**Tech Stack:** Vite + React 19, react-router, Vitest + Testing Library + userEvent. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-25-aba-projetos-design.md`
- No backend changes — `GET /projetos` already supports everything needed.
- No creation UI on this page — creating a project stays exclusive to the Funil's "+ Oportunidade" flow.
- Columns are exactly: Cliente (link to `/clientes/:cliente_id`), Título (link to `/projetos/:id`), Etapa (tag), Valor total. No financial or deadline columns in this iteration.
- Default stage filter ("Ativos") excludes `etapa === 'perdido'`; selecting a specific stage (including "Perdido") shows only that stage, unfiltered further.
- Sort is always by `atualizado_em` descending, applied after any filtering.
- Test commands run via `npx vitest run <path>` (root `vitest.config.js` already routes `web/**/*.test.{js,jsx}` to the browser-like environment).

---

### Task 1: `Projetos` page — table, filters, sorting

**Files:**
- Create: `web/src/pages/Projetos.jsx`
- Test: `web/src/pages/Projetos.test.jsx`

**Interfaces:**
- Consumes: `GET /projetos` and `GET /projetos?etapa=<etapa>` and `GET /projetos?cliente_id=<id>` (existing, `server/routes/projetos.js`), each item shaped like `{ id, cliente_id, cliente_nome, titulo, etapa, valor_total_centavos, atualizado_em, ... }`; `GET /clientes` (existing, returns `[{ id, nome, ... }]`); `api(caminho)` from `web/src/api/client.js`; `useCarregar(carregar, deps)` from `web/src/hooks/useCarregar.js`; `Aviso` from `web/src/components/Aviso.jsx`; `formatarDinheiro(centavos)` from `web/src/lib/dinheiro.js`; `ETAPAS`, `ROTULO_ETAPA` from `web/src/lib/rotulos.js`.
- Produces: `export function Projetos()` — a React component with no props, rendered at route `/projetos` in Task 2.

- [ ] **Step 1: Write the failing tests**

Create `web/src/pages/Projetos.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Projetos } from './Projetos.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const antigo = {
  id: 1, cliente_id: 10, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'andamento',
  valor_total_centavos: 250000, atualizado_em: '2026-09-01T10:00:00.000Z',
};
const recente = {
  id: 2, cliente_id: 11, titulo: 'Loja Bruno', cliente_nome: 'Bruno', etapa: 'contato',
  valor_total_centavos: 500000, atualizado_em: '2026-09-20T10:00:00.000Z',
};
const perdido = {
  id: 3, cliente_id: 12, titulo: 'App Carla', cliente_nome: 'Carla', etapa: 'perdido',
  valor_total_centavos: 0, atualizado_em: '2026-09-10T10:00:00.000Z',
};

const abrir = () => renderizar(<Projetos />, { rota: '/projetos', padrao: '/projetos' });

describe('Projetos', () => {
  it('lista projetos ativos mais recentes primeiro e oculta perdidos', async () => {
    mockApi({ 'GET /projetos': [antigo, recente, perdido], 'GET /clientes': [] });
    abrir();
    const linhas = await screen.findAllByRole('row');
    expect(within(linhas[1]).getByRole('link', { name: 'Loja Bruno' })).toHaveAttribute('href', '/projetos/2');
    expect(within(linhas[2]).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(screen.queryByText('App Carla')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/10');
    expect(screen.getByText(/5\.000,00/)).toBeInTheDocument();
  });

  it('filtra por etapa mostrando perdidos quando selecionado explicitamente', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': [antigo, recente, perdido],
      'GET /projetos?etapa=perdido': [perdido],
      'GET /clientes': [],
    });
    abrir();
    await screen.findByText('Site Ana');
    await userEvent.setup().selectOptions(screen.getByLabelText('Etapa'), 'perdido');
    await screen.findByText('App Carla');
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?etapa=perdido');
  });

  it('filtra por cliente', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': [antigo, recente],
      'GET /projetos?cliente_id=10': [antigo],
      'GET /clientes': [{ id: 10, nome: 'Ana' }],
    });
    abrir();
    await screen.findByText('Loja Bruno');
    await userEvent.setup().selectOptions(screen.getByLabelText('Cliente'), '10');
    await screen.findByText('Site Ana');
    expect(screen.queryByText('Loja Bruno')).not.toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?cliente_id=10');
  });

  it('mostra estado vazio', async () => {
    mockApi({ 'GET /projetos': [], 'GET /clientes': [] });
    abrir();
    expect(await screen.findByText('Nenhum projeto encontrado.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/pages/Projetos.test.jsx`
Expected: FAIL — `Failed to resolve import "./Projetos.jsx"` (the component doesn't exist yet)

- [ ] **Step 3: Implement the `Projetos` page**

Create `web/src/pages/Projetos.jsx`:

```jsx
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { ETAPAS, ROTULO_ETAPA } from '../lib/rotulos.js';

export function Projetos() {
  const [etapa, setEtapa] = useState('');
  const [clienteId, setClienteId] = useState('');
  const consulta = new URLSearchParams(
    Object.entries({ etapa, cliente_id: clienteId }).filter(([, v]) => v),
  ).toString();

  const { dados: projetos, erro } = useCarregar(() => api(`/projetos${consulta ? `?${consulta}` : ''}`), [consulta]);
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);

  const lista = (projetos ?? [])
    .filter((p) => etapa || p.etapa !== 'perdido')
    .slice()
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));

  return (
    <section>
      <header className="pagina__topo">
        <h1>Projetos</h1>
        <div className="form--linha">
          <label className="campo">
            <span>Etapa</span>
            <select aria-label="Etapa" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
              <option value="">Ativos</option>
              {ETAPAS.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Cliente</span>
            <select aria-label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        </div>
      </header>
      <Aviso erro={erro} />
      {projetos && (lista.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Cliente</th><th>Título</th><th>Etapa</th><th className="num">Valor total</th></tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link></td>
                <td><Link to={`/projetos/${p.id}`}>{p.titulo}</Link></td>
                <td><span className={`etiqueta etiqueta--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span></td>
                <td className="num">{formatarDinheiro(p.valor_total_centavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum projeto encontrado.</p>)}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/pages/Projetos.test.jsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Projetos.jsx web/src/pages/Projetos.test.jsx
git commit -m "feat: aba de projetos com filtros por etapa e cliente"
```

---

### Task 2: Wire "Projetos" into navigation and routing

**Files:**
- Modify: `web/src/App.jsx:1-18` (imports and `NAVEGACAO` array), `web/src/App.jsx:34-44` (`Routes`)

**Interfaces:**
- Consumes: `Projetos` from `web/src/pages/Projetos.jsx` (Task 1).
- Produces: route `/projetos` rendering `<Projetos />`; sidebar nav item "Projetos" between "Funil" and "Clientes".

- [ ] **Step 1: Add the import and nav entry**

In `web/src/App.jsx`, add the import after the `Funil` import (line 3):

```jsx
import { Funil } from './pages/Funil.jsx';
import { Projetos } from './pages/Projetos.jsx';
```

Update `NAVEGACAO` (lines 11–18) to insert "Projetos" between "Funil" and "Clientes":

```jsx
const NAVEGACAO = [
  { para: '/', rotulo: 'Início' },
  { para: '/funil', rotulo: 'Funil' },
  { para: '/projetos', rotulo: 'Projetos' },
  { para: '/clientes', rotulo: 'Clientes' },
  { para: '/conteudo', rotulo: 'Conteúdo' },
  { para: '/financeiro', rotulo: 'Financeiro' },
  { para: '/configuracoes', rotulo: 'Configurações' },
];
```

- [ ] **Step 2: Add the route**

In `web/src/App.jsx`, add the route right after `/funil` (line 36):

```jsx
          <Route path="/" element={<Inicio />} />
          <Route path="/funil" element={<Funil />} />
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/clientes" element={<Clientes />} />
```

Note: this new route must come before `<Route path="/projetos/:id" element={<Projeto />} />` in the file — react-router matches static segments before dynamic ones regardless of declaration order, so placing it here (above `/clientes`, before the existing `/projetos/:id` line further down) is safe either way, but keep it grouped with the other top-level nav routes for readability.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test in both the `server` and `web` projects (this task adds no new tests; it verifies the routing change doesn't break `Funil.test.jsx`'s `/projetos/:id` link assertions or any other existing test)

- [ ] **Step 4: Commit**

```bash
git add web/src/App.jsx
git commit -m "feat: adiciona aba Projetos na navegacao"
```
