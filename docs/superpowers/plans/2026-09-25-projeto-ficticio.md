# Projeto fictício (só portfólio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Adicionar um campo `ficticio` em projetos para marcar peças criadas só para portfólio (sem cliente real), excluindo-as do Funil, do Painel e do Financeiro, sem afetar a lista de Projetos nem o detalhe do projeto.

**Architecture:** Coluna booleana nova via migration, propagada pelo `repoProjetos`/`REGRAS_PROJETO` (mesmo padrão de `postou_instagram`), filtrada nas queries SQL de `painel.js` e `parcelas.js`, e exposta como checkbox em `AbaGeral.jsx` (edição) e `FormOportunidade.jsx` (criação). `Funil.jsx` passa a pedir `GET /projetos?ficticio=0`.

**Tech Stack:** Node.js (`node:sqlite`), Express, Vitest + Supertest (`criarContexto`) no backend; React 19, Vitest + Testing Library no frontend.

## Global Constraints

- Nenhuma mudança na lista de Projetos (`Projetos.jsx`) ou no detalhe do projeto — continuam mostrando tudo, sem filtro por `ficticio` (spec: "Não muda").
- `etapa` continua existindo e editável normalmente — nenhuma regra nova força um valor de `etapa` para projetos fictícios (spec: "Não muda").
- Parcelas do próprio projeto fictício (`GET /projetos/:id/parcelas`) não são filtradas — só as visões agregadas (Funil, Painel, `GET /parcelas`, `GET /financeiro/mensal`) (spec: "Escopo").

---

### Task 1: Migration + coluna `ficticio` persistida e filtrável em `/projetos`

**Files:**
- Create: `server/db/migrations/004_ficticio.sql`
- Modify: `server/repos/projetos.js` (`CAMPOS_PROJETO`, `listarComCliente`)
- Modify: `server/routes/projetos.js` (`REGRAS_PROJETO`, `r.get('/')`)
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: coluna `projetos.ficticio` (INTEGER 0/1); `GET /projetos?ficticio=0|1` filtra por ela; `POST /projetos` e `PUT /projetos/:id` aceitam `ficticio: boolean` no corpo. Usado por `Funil.jsx` (Task 5) e pelas queries de `painel.js`/`parcelas.js` (Tasks 2 e 3).

- [x] **Step 1: Escrever os testes (falhando)**

Adicionar ao final do `describe('/api/projetos', ...)` em `server/routes/projetos.test.js`, antes do `});` final:

```js
  it('aceita e retorna ficticio', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    expect(projeto.ficticio).toBe(0);
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ ficticio: true }).expect(200);
    expect(res.body.ficticio).toBe(1);
  });

  it('lista filtrando por ficticio', async () => {
    const a = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'B' });
    await ctx.http.put(`/api/projetos/${a.id}`).send({ ficticio: true }).expect(200);
    const res = await ctx.http.get('/api/projetos?ficticio=1').expect(200);
    expect(res.body.map((p) => p.titulo)).toEqual(['A']);
    const res2 = await ctx.http.get('/api/projetos?ficticio=0').expect(200);
    expect(res2.body.map((p) => p.titulo)).toEqual(['B']);
  });
```

- [x] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run server/routes/projetos.test.js`
Expected: FAIL nos dois testes novos — `ficticio` não existe na coluna/validação ainda (`expect(projeto.ficticio).toBe(0)` recebe `undefined`).

- [x] **Step 3: Criar a migration**

Criar `server/db/migrations/004_ficticio.sql`:

```sql
ALTER TABLE projetos ADD COLUMN ficticio INTEGER NOT NULL DEFAULT 0 CHECK (ficticio IN (0, 1));
```

- [x] **Step 4: Propagar o campo no repo**

Em `server/repos/projetos.js`, atualizar `CAMPOS_PROJETO`:

```js
export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
  'postou_instagram', 'ficticio',
];
```

E `listarComCliente`:

```js
    listarComCliente({ etapa, cliente_id, postou_instagram, ficticio } = {}) {
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
      if (ficticio) {
        condicoes.push('p.ficticio = ?');
        args.push(Number(ficticio));
      }
      const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
      return db
        .prepare(`${SELECT_COM_CLIENTE}${where} ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id`)
        .all(...args)
        .map(linha);
    },
```

- [x] **Step 5: Validar e filtrar na rota**

Em `server/routes/projetos.js`, atualizar `REGRAS_PROJETO`:

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
  ficticio: { tipo: 'bool', padrao: 0 },
};
```

E `r.get('/')`:

```js
  r.get('/', (req, res) => {
    res.json(projetos.listarComCliente({
      etapa: req.query.etapa,
      cliente_id: req.query.cliente_id,
      postou_instagram: req.query.postou_instagram,
      ficticio: req.query.ficticio,
    }));
  });
```

- [x] **Step 6: Rodar os testes e confirmar que passam**

Run: `npx vitest run server/routes/projetos.test.js`
Expected: PASS em todos (13 testes).

- [x] **Step 7: Commit**

```bash
git add server/db/migrations/004_ficticio.sql server/repos/projetos.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: adiciona campo ficticio em projetos"
```

---

### Task 2: Excluir projetos fictícios do Painel

**Files:**
- Modify: `server/routes/painel.js`
- Test: `server/routes/painel.test.js`

**Interfaces:**
- Consumes: coluna `projetos.ficticio` (Task 1).
- Produces: nada consumido por outras tasks.

- [x] **Step 1: Escrever o teste (falhando)**

Em `server/routes/painel.test.js`, adicionar um novo `it` dentro do `describe('GET /api/painel', ...)`, depois do teste existente:

```js
  it('ignora projetos fictícios nos cartões e nos próximos', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const real = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site real', etapa: 'andamento', prazo_entrega: '2026-09-28',
    })).body;
    const ficticio = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Case fictício', etapa: 'andamento', prazo_entrega: '2026-09-28', ficticio: true,
    })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Proposta fictícia', etapa: 'proposta', valor_total_centavos: 80000, ficticio: true });
    await ctx.http.post(`/api/projetos/${ficticio.id}/parcelas`).send({ valor_centavos: 5000, vencimento: '2026-09-10' });
    await ctx.http.post(`/api/projetos/${ficticio.id}/tarefas`).send({ texto: 'Revisar case', prazo: '2026-09-24' });

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes.em_andamento).toBe(1);
    expect(res.body.cartoes.propostas).toEqual({ quantidade: 0, total_centavos: 0 });
    expect(res.body.cartoes.atrasadas).toEqual({ quantidade: 0, total_centavos: 0 });
    expect(res.body.proximos.every((i) => i.titulo !== 'Case fictício' && i.titulo !== 'Revisar case')).toBe(true);
    expect(res.body.proximos.some((i) => i.titulo === 'Site real')).toBe(true);
  });
```

- [x] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run server/routes/painel.test.js`
Expected: FAIL — `em_andamento` sai `2` (conta o fictício também), `propostas.quantidade` sai `1`.

- [x] **Step 3: Filtrar as queries**

Em `server/routes/painel.js`, dentro de `r.get('/painel', ...)`, trocar:

```js
    const parcelasAbertas = todas(
      `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NULL`,
    );
    const atrasadas = parcelasAbertas.filter((p) => estadoParcela(p, dia) === 'atrasada');
    const propostas = todas("SELECT valor_total_centavos FROM projetos WHERE etapa = 'proposta'");
    const entregas = todas(
      `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.etapa = 'andamento'`,
    );
```

por:

```js
    const parcelasAbertas = todas(
      `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NULL AND p.ficticio = 0`,
    );
    const atrasadas = parcelasAbertas.filter((p) => estadoParcela(p, dia) === 'atrasada');
    const propostas = todas("SELECT valor_total_centavos FROM projetos WHERE etapa = 'proposta' AND ficticio = 0");
    const entregas = todas(
      `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.etapa = 'andamento' AND p.ficticio = 0`,
    );
```

E, na montagem de `proximos`, trocar:

```js
          tarefas: todas(
            `SELECT t.*, p.titulo AS projeto_titulo FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
             WHERE t.concluida = 0 AND t.prazo IS NOT NULL AND p.etapa <> 'perdido'`,
          ),
          parcelas: parcelasAbertas,
          entregas,
          conteudos: todas("SELECT * FROM conteudos WHERE status <> 'publicado' AND data_planejada IS NOT NULL"),
```

por:

```js
          tarefas: todas(
            `SELECT t.*, p.titulo AS projeto_titulo FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
             WHERE t.concluida = 0 AND t.prazo IS NOT NULL AND p.etapa <> 'perdido' AND p.ficticio = 0`,
          ),
          parcelas: parcelasAbertas,
          entregas,
          conteudos: todas(
            `SELECT c.* FROM conteudos c LEFT JOIN projetos p ON p.id = c.projeto_id
             WHERE c.status <> 'publicado' AND c.data_planejada IS NOT NULL AND (p.id IS NULL OR p.ficticio = 0)`,
          ),
```

- [x] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run server/routes/painel.test.js`
Expected: PASS em ambos os testes.

- [x] **Step 5: Commit**

```bash
git add server/routes/painel.js server/routes/painel.test.js
git commit -m "feat: ignora projetos ficticios no painel"
```

---

### Task 3: Excluir projetos fictícios do Financeiro

**Files:**
- Modify: `server/routes/parcelas.js`
- Test: `server/routes/parcelas.test.js`

**Interfaces:**
- Consumes: coluna `projetos.ficticio` (Task 1).
- Produces: nada consumido por outras tasks.

- [x] **Step 1: Escrever os testes (falhando)**

Adicionar ao final do `describe('parcelas', ...)` em `server/routes/parcelas.test.js`, antes do `});` que fecha esse describe:

```js
  it('ignora projeto fictício na lista geral e no financeiro mensal', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const ficticio = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Case fictício', ficticio: true })).body;
    const p = (await ctx.http.post(`/api/projetos/${ficticio.id}/parcelas`).send({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: '2026-09-15' });

    const lista = await ctx.http.get('/api/parcelas').expect(200);
    expect(lista.body.some((x) => x.projeto_id === ficticio.id)).toBe(false);

    const mensal = await ctx.http.get('/api/financeiro/mensal?ano=2026').expect(200);
    expect(mensal.body[8]).toEqual({ mes: '2026-09', recebido_centavos: 0 });

    // parcelas do próprio projeto continuam visíveis no detalhe dele
    const doProjeto = await ctx.http.get(`/api/projetos/${ficticio.id}/parcelas`).expect(200);
    expect(doProjeto.body.parcelas).toHaveLength(1);
  });
```

- [x] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run server/routes/parcelas.test.js`
Expected: FAIL — `lista.body.some(...)` dá `true` (parcela do fictício aparece), e `mensal.body[8].recebido_centavos` sai `5000`.

- [x] **Step 3: Filtrar `GET /parcelas`**

Em `server/routes/parcelas.js`, dentro de `r.get('/parcelas', ...)`, trocar:

```js
    const lista = db
      .prepare(
        `SELECT pa.*, p.titulo AS projeto_titulo, c.nome AS cliente_nome
         FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id JOIN clientes c ON c.id = p.cliente_id
         ORDER BY pa.vencimento, pa.id`,
      )
```

por:

```js
    const lista = db
      .prepare(
        `SELECT pa.*, p.titulo AS projeto_titulo, c.nome AS cliente_nome
         FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id JOIN clientes c ON c.id = p.cliente_id
         WHERE p.ficticio = 0
         ORDER BY pa.vencimento, pa.id`,
      )
```

- [x] **Step 4: Filtrar `GET /financeiro/mensal`**

Trocar:

```js
  r.get('/financeiro/mensal', (req, res) => {
    const ano = Number(req.query.ano ?? hoje().slice(0, 4));
    if (!Number.isInteger(ano)) throw new ErroHttp(400, 'Ano inválido');
    res.json(recebidoPorMes(parcelas.listar(), ano));
  });
```

por:

```js
  r.get('/financeiro/mensal', (req, res) => {
    const ano = Number(req.query.ano ?? hoje().slice(0, 4));
    if (!Number.isInteger(ano)) throw new ErroHttp(400, 'Ano inválido');
    const lista = db
      .prepare('SELECT pa.* FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id WHERE p.ficticio = 0')
      .all()
      .map(linha);
    res.json(recebidoPorMes(lista, ano));
  });
```

- [x] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run server/routes/parcelas.test.js`
Expected: PASS em todos os testes do arquivo.

- [x] **Step 6: Commit**

```bash
git add server/routes/parcelas.js server/routes/parcelas.test.js
git commit -m "feat: ignora projeto ficticio no financeiro"
```

---

### Task 4: Checkbox "Projeto fictício" na edição do projeto

**Files:**
- Modify: `web/src/pages/projeto/AbaGeral.jsx`

**Interfaces:**
- Consumes: campo `projeto.ficticio` (0/1) vindo de `GET /projetos/:id` (Task 1).
- Produces: nada consumido por outras tasks — o `PUT /projetos/:id` já aceita `ficticio` desde a Task 1.

- [x] **Step 1: Adicionar o campo ao estado do formulário**

Em `web/src/pages/projeto/AbaGeral.jsx`, no `useFormulario`, depois de `postou_instagram: Boolean(projeto.postou_instagram),`:

```js
    postou_instagram: Boolean(projeto.postou_instagram),
    ficticio: Boolean(projeto.ficticio),
  });
```

- [x] **Step 2: Adicionar o checkbox no formulário**

Depois do bloco do checkbox "Postou no Instagram" (antes de `<Aviso erro={erro} />`):

```jsx
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
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.ficticio)}
            onChange={(e) => setValores((v) => ({ ...v, ficticio: e.target.checked }))}
          />{' '}
          Projeto fictício (só portfólio)
        </label>
      </div>
      <Aviso erro={erro} />
```

- [x] **Step 3: Verificar manualmente**

Run: `npm run dev` (ou `npm start`, conforme já rodando), abrir um projeto existente em `/projetos/:id`, marcar "Projeto fictício (só portfólio)", clicar em "Salvar projeto", recarregar a página e confirmar que o checkbox continua marcado.

- [x] **Step 4: Rodar a suíte de testes de projeto pra garantir que nada quebrou**

Run: `npx vitest run web/src/pages/projeto/Projeto.test.jsx`
Expected: PASS (o arquivo usa `toMatchObject` no corpo do PUT, então o campo novo não quebra as asserções existentes).

- [x] **Step 5: Commit**

```bash
git add web/src/pages/projeto/AbaGeral.jsx
git commit -m "feat: adiciona checkbox de projeto ficticio na edicao"
```

---

### Task 5: Checkbox na criação e Funil ignorando fictícios

**Files:**
- Modify: `web/src/components/FormOportunidade.jsx`
- Modify: `web/src/pages/Funil.jsx`
- Test: `web/src/pages/Funil.test.jsx`

**Interfaces:**
- Consumes: `GET /projetos?ficticio=0` e `POST /projetos` aceitando `ficticio` (Task 1).
- Produces: nada consumido por outras tasks — é a ponta final da integração no Funil.

- [x] **Step 1: Atualizar `Funil.test.jsx` (falhando)**

Em `web/src/pages/Funil.test.jsx`, trocar as quatro ocorrências da chave de mock `'GET /projetos'` por `'GET /projetos?ficticio=0'`:

```js
const abrir = () => renderizar(<Funil />, { rota: '/funil', padrao: '/funil' });

describe('Funil', () => {
  it('mostra cards por etapa e recolhe "Perdido"', async () => {
    mockApi({ 'GET /projetos?ficticio=0': projetos });
    ...

  it('muda a etapa pelo menu do card', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?ficticio=0': projetos, 'PUT /projetos/1': { ...projetos[0], etapa: 'proposta' } });
    ...

  it('nova oportunidade: valor inválido não chama a API', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [] });
    ...

  it('nova oportunidade com cliente novo envia novo_cliente e valor em centavos', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 } });
```

E, no último teste, atualizar o corpo esperado do `POST /projetos` para incluir o novo campo:

```js
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Site', etapa: 'contato', valor_total_centavos: 150050, prazo_entrega: '', ficticio: false, novo_cliente: { nome: 'Diego' },
    });
```

- [x] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run web/src/pages/Funil.test.jsx`
Expected: FAIL — `Funil.jsx` ainda chama `GET /projetos` (sem query string), então o mock de `'GET /projetos?ficticio=0'` não é atingido (`findByRole`/`findAllByRole` dão timeout ou a lista fica vazia); o teste de criação falha porque o corpo do POST não tem `ficticio`.

- [x] **Step 3: Atualizar `Funil.jsx`**

Trocar:

```js
  const { dados: projetos, erro, recarregar } = useCarregar(() => api('/projetos'), []);
```

por:

```js
  const { dados: projetos, erro, recarregar } = useCarregar(() => api('/projetos?ficticio=0'), []);
```

- [x] **Step 4: Atualizar `FormOportunidade.jsx`**

Trocar a desestruturação do `useFormulario`:

```js
  const { valores, campo } = useFormulario({
    titulo: '', cliente_id: '', novo_cliente_nome: '', valor: '', prazo_entrega: '', etapa: 'contato',
  });
```

por:

```js
  const { valores, campo, setValores } = useFormulario({
    titulo: '', cliente_id: '', novo_cliente_nome: '', valor: '', prazo_entrega: '', etapa: 'contato', ficticio: false,
  });
```

Incluir `ficticio` no corpo enviado — trocar:

```js
    const corpo = { titulo: valores.titulo, etapa: valores.etapa, valor_total_centavos: valor ?? 0, prazo_entrega: valores.prazo_entrega };
```

por:

```js
    const corpo = {
      titulo: valores.titulo, etapa: valores.etapa, valor_total_centavos: valor ?? 0,
      prazo_entrega: valores.prazo_entrega, ficticio: valores.ficticio,
    };
```

E adicionar o checkbox no JSX, antes de `<Aviso erro={erro} />`:

```jsx
      <Campo rotulo="Prazo de entrega" nome="prazo_entrega" erros={erros} type="date" {...campo('prazo_entrega')} />
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.ficticio)}
            onChange={(e) => setValores((v) => ({ ...v, ficticio: e.target.checked }))}
          />{' '}
          Projeto fictício (só portfólio)
        </label>
      </div>
      <Aviso erro={erro} />
```

- [x] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run web/src/pages/Funil.test.jsx`
Expected: PASS em todos os 4 testes.

- [x] **Step 6: Commit**

```bash
git add web/src/components/FormOportunidade.jsx web/src/pages/Funil.jsx web/src/pages/Funil.test.jsx
git commit -m "feat: marca projeto ficticio na criacao e some com eles do funil"
```

---

### Task 6: Verificação final

**Files:** nenhum (só execução).

- [x] **Step 1: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os arquivos de teste passam, sem regressões.

- [x] **Step 2: Conferir manualmente (se o dev server estiver disponível)**

No Funil, criar uma "Oportunidade" marcando "Projeto fictício (só portfólio)" e confirmar que ela não aparece em nenhuma coluna do kanban. Abrir a página de Projetos e confirmar que ela aparece lá normalmente. Abrir o Painel e confirmar que os cartões "Em andamento"/"Propostas" não contam esse projeto. Abrir o Financeiro (após criar uma parcela nesse projeto fictício) e confirmar que ela não aparece na lista nem no gráfico de recebido por mês.
