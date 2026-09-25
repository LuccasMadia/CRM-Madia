# Marcação de postagem no Instagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Luccas mark, per project, whether it has had an Instagram post (`postou_instagram`, a simple boolean — no date, no link), edit it from the project's "Visão geral" tab, and see/filter it from the Projetos list.

**Architecture:** Same shape as the existing `mensalidade_ativa` field: a new column on `projetos`, accepted/returned by the existing `POST /projetos` / `PUT /projetos/:id` handlers, with no cross-field validation (unlike mensalidade, this field doesn't depend on any other field). `GET /projetos` gains a `?postou_instagram=1|0` filter alongside the existing `?etapa=` and `?cliente_id=`. Two small frontend additions: a checkbox in `AbaGeral.jsx` and a column + filter in `Projetos.jsx`.

**Tech Stack:** Express 5, `node:sqlite`, Vite + React 19, Vitest + Testing Library + supertest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-25-instagram-postado-design.md`
- `postou_instagram` is a plain boolean column, default `0`. No date, no link, no cross-field validation.
- Migration files follow the existing `NNN_nome.sql` naming (`001_inicial.sql`, `002_mensalidade.sql` exist) — this work adds `003_instagram.sql`.
- Test commands run via `npx vitest run <path>` (root `vitest.config.js` already routes `server/**/*.test.js` and `web/**/*.test.{js,jsx}` to their respective environments).

---

### Task 1: Migração — coluna `postou_instagram`

**Files:**
- Create: `server/db/migrations/003_instagram.sql`

**Interfaces:**
- Produces: `projetos.postou_instagram` (INTEGER 0/1, default 0).

- [ ] **Step 1: Write the migration**

Create `server/db/migrations/003_instagram.sql`:

```sql
ALTER TABLE projetos ADD COLUMN postou_instagram INTEGER NOT NULL DEFAULT 0 CHECK (postou_instagram IN (0, 1));
```

- [ ] **Step 2: Run the existing migration/connection suite to verify it applies cleanly**

Run: `npx vitest run server/db/connection.test.js`
Expected: PASS — `openDb(':memory:')` runs `001_inicial.sql`, `002_mensalidade.sql` and `003_instagram.sql` without SQL errors, and `schema_migrations` records all three filenames (covered by the existing "não reaplica migrações já registradas" test).

- [ ] **Step 3: Commit**

```bash
git add server/db/migrations/003_instagram.sql
git commit -m "feat: coluna postou_instagram em projetos"
```

---

### Task 2: Backend — aceitar e filtrar por `postou_instagram`

**Files:**
- Modify: `server/repos/projetos.js:3-27`
- Modify: `server/routes/projetos.js:10-21,45-47`
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: `003_instagram.sql` column from Task 1.
- Produces: `PUT /projetos/:id` and `POST /projetos` accept/return `postou_instagram` (bool); `GET /projetos?postou_instagram=1` and `?postou_instagram=0` filter the list.

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/projetos.test.js`, inside `describe('/api/projetos', ...)`, before the closing `});`:

```js
  it('aceita e retorna postou_instagram', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    expect(projeto.postou_instagram).toBe(0);
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ postou_instagram: true }).expect(200);
    expect(res.body.postou_instagram).toBe(1);
  });

  it('lista filtrando por postou_instagram', async () => {
    const a = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'B' });
    await ctx.http.put(`/api/projetos/${a.id}`).send({ postou_instagram: true }).expect(200);
    const res = await ctx.http.get('/api/projetos?postou_instagram=1').expect(200);
    expect(res.body.map((p) => p.titulo)).toEqual(['A']);
    const res2 = await ctx.http.get('/api/projetos?postou_instagram=0').expect(200);
    expect(res2.body.map((p) => p.titulo)).toEqual(['B']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/projetos.test.js`
Expected: FAIL — `projeto.postou_instagram` is `undefined` instead of `0` (field not in `CAMPOS_PROJETO`/`REGRAS_PROJETO` yet), and the filter test gets both titles back for both query values (filter not implemented yet)

- [ ] **Step 3: Implement**

In `server/repos/projetos.js`, replace `CAMPOS_PROJETO` (lines 3–6):

```js
export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
  'postou_instagram',
];
```

Replace `listarComCliente` (lines 16–27):

```js
    listarComCliente({ etapa, cliente_id, postou_instagram } = {}) {
      const condicoes = [];
      const args = [];
      if (etapa) {
        condicoes.push('p.etapa = ?');
        args.push(etapa);
      }
      if (cliente_id) {
        condicoes.push('p.cliente_id = ?');
        args.push(Number(cliente_id));
      }
      if (postou_instagram) {
        condicoes.push('p.postou_instagram = ?');
        args.push(Number(postou_instagram));
      }
      const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
      return db
        .prepare(`${SELECT_COM_CLIENTE}${where} ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id`)
        .all(...args)
        .map(linha);
    },
```

In `server/routes/projetos.js`, replace `REGRAS_PROJETO` (lines 10–21):

```js
const REGRAS_PROJETO = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  descricao: { tipo: 'texto' },
  etapa: { tipo: 'enum', valores: ETAPAS, padrao: 'contato' },
  valor_total_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  data_inicio: { tipo: 'data' },
  prazo_entrega: { tipo: 'data' },
  data_entrega: { tipo: 'data' },
  notas: { tipo: 'texto' },
  mensalidade_ativa: { tipo: 'bool', padrao: 0 },
  mensalidade_valor_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  mensalidade_dia_vencimento: { tipo: 'inteiro', min: 1, max: 31 },
  postou_instagram: { tipo: 'bool', padrao: 0 },
};
```

Replace the `r.get('/', ...)` handler (lines 45–47):

```js
  r.get('/', (req, res) => {
    res.json(projetos.listarComCliente({
      etapa: req.query.etapa,
      cliente_id: req.query.cliente_id,
      postou_instagram: req.query.postou_instagram,
    }));
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/projetos.test.js`
Expected: PASS (all tests in the file, including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add server/repos/projetos.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: aceita e filtra projetos por postou_instagram"
```

---

### Task 3: Frontend — checkbox na Aba Geral

**Files:**
- Modify: `web/src/pages/projeto/AbaGeral.jsx:14-27,91-109`
- Test: `web/src/pages/projeto/Projeto.test.jsx`

**Interfaces:**
- Consumes: `PUT /projetos/:id` accepting `postou_instagram` (bool) from Task 2.
- Produces: no new exports — internal UI addition to `AbaGeral`.

- [ ] **Step 1: Write the failing test**

Add to `web/src/pages/projeto/Projeto.test.jsx`, inside `describe('Projeto', ...)`, after the `it('esconde os campos de mensalidade quando desmarcada', ...)` block:

```js
  it('marca postou no instagram', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5': projetoExemplo,
      'GET /clientes': [{ id: 1, nome: 'Ana' }],
      'PUT /projetos/5': { ...projetoExemplo, postou_instagram: 1, atualizado_em: 'T2' },
    });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Postou no Instagram'));
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo).toMatchObject({ postou_instagram: true });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/pages/projeto/Projeto.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Postou no Instagram`

- [ ] **Step 3: Implement**

In `web/src/pages/projeto/AbaGeral.jsx`, add `postou_instagram` to the initial `useFormulario` values (lines 14–27):

```js
  const { valores, campo, setValores } = useFormulario({
    titulo: projeto.titulo,
    cliente_id: String(projeto.cliente_id),
    etapa: projeto.etapa,
    valor: centavosParaTexto(projeto.valor_total_centavos),
    data_inicio: projeto.data_inicio ?? '',
    prazo_entrega: projeto.prazo_entrega ?? '',
    data_entrega: projeto.data_entrega ?? '',
    descricao: projeto.descricao ?? '',
    notas: projeto.notas ?? '',
    mensalidade_ativa: Boolean(projeto.mensalidade_ativa),
    mensalidade_valor: centavosParaTexto(projeto.mensalidade_valor_centavos),
    mensalidade_dia_vencimento: projeto.mensalidade_dia_vencimento ? String(projeto.mensalidade_dia_vencimento) : '',
    postou_instagram: Boolean(projeto.postou_instagram),
  });
```

No change is needed in `salvar()`: `postou_instagram` isn't destructured out of `valores` (unlike `valor`/`mensalidade_valor`), so it flows through `...resto` into the `PUT` body already as a boolean, the same way `titulo`/`etapa`/`descricao` do.

Add the checkbox to the JSX, right after the mensalidade conditional block and before `<Aviso erro={erro} />` (lines 104–110):

```jsx
      {valores.mensalidade_ativa && (
        <>
          <Campo rotulo="Valor da mensalidade (R$)" nome="mensalidade_valor_centavos" erros={erros} inputMode="decimal" {...campo('mensalidade_valor')} />
          <Campo rotulo="Dia de vencimento" nome="mensalidade_dia_vencimento" erros={erros} type="number" min="1" max="31" {...campo('mensalidade_dia_vencimento')} />
        </>
      )}
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.postou_instagram)}
            onChange={(e) => setValores((v) => ({ ...v, postou_instagram: e.target.checked }))}
          />{' '}
          Postou no Instagram
        </label>
      </div>
      <Aviso erro={erro} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/pages/projeto/Projeto.test.jsx`
Expected: PASS (all tests in the file, including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/projeto/AbaGeral.jsx web/src/pages/projeto/Projeto.test.jsx
git commit -m "feat: marca postou no instagram na aba geral do projeto"
```

---

### Task 4: Frontend — coluna e filtro na Aba Projetos

**Files:**
- Modify: `web/src/pages/Projetos.jsx`
- Test: `web/src/pages/Projetos.test.jsx`

**Interfaces:**
- Consumes: `GET /projetos?postou_instagram=1|0` from Task 2; `postou_instagram` field on each item returned by `GET /projetos`.
- Produces: no new exports — internal UI addition to `Projetos`.

- [ ] **Step 1: Write the failing tests**

In `web/src/pages/Projetos.test.jsx`, update the `antigo` and `recente` fixtures to include `postou_instagram` (add the field to both object literals):

```js
const antigo = {
  id: 1, cliente_id: 10, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'andamento',
  valor_total_centavos: 250000, atualizado_em: '2026-09-01T10:00:00.000Z', postou_instagram: 0,
};
const recente = {
  id: 2, cliente_id: 11, titulo: 'Loja Bruno', cliente_nome: 'Bruno', etapa: 'contato',
  valor_total_centavos: 500000, atualizado_em: '2026-09-20T10:00:00.000Z', postou_instagram: 1,
};
```

In the `it('lista projetos ativos mais recentes primeiro e oculta perdidos', ...)` test, add these two assertions right after the existing `expect(within(linhas[2]).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');` line (before `expect(screen.queryByText('App Carla'))...`):

```js
    expect(within(linhas[1]).getByText('Sim')).toBeInTheDocument();
    expect(within(linhas[2]).getByText('Não')).toBeInTheDocument();
```

Add a new test at the end of the `describe('Projetos', ...)` block, after `it('mostra estado vazio', ...)`:

```js
  it('filtra por instagram', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': [antigo, recente],
      'GET /projetos?postou_instagram=1': [recente],
      'GET /clientes': [],
    });
    abrir();
    await screen.findByText('Site Ana');
    await userEvent.setup().selectOptions(screen.getByLabelText('Instagram'), '1');
    await screen.findByText('Loja Bruno');
    expect(screen.queryByText('Site Ana')).not.toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?postou_instagram=1');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/pages/Projetos.test.jsx`
Expected: FAIL — `getByText('Sim')`/`getByText('Não')` not found (no Instagram column yet), and `Unable to find a label with the text of: Instagram` in the new test

- [ ] **Step 3: Implement**

In `web/src/pages/Projetos.jsx`, add `instagram` filter state and include it in the query:

```js
export function Projetos() {
  const [etapa, setEtapa] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [instagram, setInstagram] = useState('');
  const consulta = new URLSearchParams(
    Object.entries({ etapa, cliente_id: clienteId, postou_instagram: instagram }).filter(([, v]) => v),
  ).toString();
```

Add the new select to the filters header, right after the "Cliente" `label.campo` block and before the closing `</div>` of `form--linha`:

```jsx
          <label className="campo">
            <span>Cliente</span>
            <select aria-label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Instagram</span>
            <select aria-label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)}>
              <option value="">Todos</option>
              <option value="1">Postaram</option>
              <option value="0">Não postaram</option>
            </select>
          </label>
```

Add the "Instagram" column between "Etapa" and "Valor total" in both the header and the body row:

```jsx
        <table className="tabela">
          <thead>
            <tr><th>Cliente</th><th>Título</th><th>Etapa</th><th>Instagram</th><th className="num">Valor total</th></tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link></td>
                <td><Link to={`/projetos/${p.id}`}>{p.titulo}</Link></td>
                <td><span className={`etiqueta etiqueta--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span></td>
                <td>{p.postou_instagram ? 'Sim' : 'Não'}</td>
                <td className="num">{formatarDinheiro(p.valor_total_centavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/pages/Projetos.test.jsx`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test in both the `server` and `web` projects

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Projetos.jsx web/src/pages/Projetos.test.jsx
git commit -m "feat: coluna e filtro de instagram na aba de projetos"
```
