# Geração Automática de Parcelas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Luccas generate parcelas automatically in two ways: a fixed batch (N parcelas, same value, monthly on a chosen day) and a recurring monthly fee ("mensalidade") that auto-generates one parcela per month for as long as it stays active on the project.

**Architecture:** Both features add server-side generation logic to the existing Express + `node:sqlite` API (`server/routes/parcelas.js`, `server/routes/projetos.js`) and reuse the existing repo/validation helpers (`criarRepo`, `emTransacao`, `validar`). The frontend (React, no state library) extends two existing tab components (`AbaFinanceiro.jsx`, `AbaGeral.jsx`) with new form sections, following the codebase's `useFormulario`/`useEnvio`/`Campo` pattern. No new pages, no background jobs — mensalidade generation happens on-demand inside the existing `GET /projetos/:id/parcelas` handler.

**Tech Stack:** Express 5, `node:sqlite`, Vite + React 19, Vitest + Testing Library + supertest. Money in integer centavos. Dates as `YYYY-MM-DD` strings.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-24-parcelas-automaticas-design.md`
- Lote: `quantidade` is 1–60, `valor_centavos` is fixed per parcela (no total-split math), `primeira_vencimento` is a full date. Descrição is always auto-numbered `"Parcela {i}/{quantidade}"` (1-indexed) — no user-entered description field for lote.
- Lote recurrence is monthly only, advancing by whole months from `primeira_vencimento`, with end-of-month clamp (e.g. 31 Jan + 1 month → 28/29 Feb).
- Mensalidade: liga/desliga simples (`mensalidade_ativa` boolean) — no history of activation periods. Deactivating only stops future generation; past auto-generated parcelas are never deleted or modified.
- Mensalidade generation only ever creates the **current month's** parcela, on demand, when `GET /projetos/:id/parcelas` is called. No retroactive backfill of skipped months.
- Mensalidade requires `mensalidade_valor_centavos` (> 0) and `mensalidade_dia_vencimento` (1–31) whenever `mensalidade_ativa` is true — enforced server-side on both `POST /projetos` and `PUT /projetos/:id`.
- Migration files follow the existing `NNN_nome.sql` naming (`001_inicial.sql` exists) — this work adds `002_mensalidade.sql`.
- Test commands run via `npx vitest run <path>` (root `vitest.config.js` already routes `server/**/*.test.js` and `web/**/*.test.{js,jsx}` to their respective environments).

---

### Task 1: Date helpers — `somarMeses` and `dataNoMes`

**Files:**
- Modify: `server/domain/datas.js:1-17` (add two exports after `somarDias`)
- Test: `server/domain/datas.test.js`

**Interfaces:**
- Produces: `somarMeses(iso: string, meses: number): string` — adds whole months to an ISO date, preserving the day-of-month, clamped to the last day of the target month if it doesn't have that many days.
- Produces: `dataNoMes(anoMes: string, dia: number): string` — builds an ISO date (`YYYY-MM-DD`) for the given `YYYY-MM` and day, clamped to the last day of that month.

- [ ] **Step 1: Write the failing tests**

Add to `server/domain/datas.test.js` (after the existing `it('mesDe corta o dia', ...)` block, before `dataValida`'s test, importing the two new functions in the top `import` line):

```js
import { describe, it, expect } from 'vitest';
import { hojeLocal, somarDias, somarMeses, mesDe, dataNoMes, dataValida } from './datas.js';
```

```js
  it('somarMeses preserva o dia e atravessa anos', () => {
    expect(somarMeses('2026-04-10', 0)).toBe('2026-04-10');
    expect(somarMeses('2026-04-10', 1)).toBe('2026-05-10');
    expect(somarMeses('2026-10-10', 3)).toBe('2027-01-10');
  });
  it('somarMeses ajusta para o último dia quando o mês de destino é mais curto', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2024-01-31', 1)).toBe('2024-02-29');
  });
  it('dataNoMes monta a data no dia informado, com clamp de fim de mês', () => {
    expect(dataNoMes('2026-09', 10)).toBe('2026-09-10');
    expect(dataNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(dataNoMes('2024-02', 31)).toBe('2024-02-29');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/domain/datas.test.js`
Expected: FAIL — `somarMeses is not a function` / `dataNoMes is not a function`

- [ ] **Step 3: Implement the helpers**

In `server/domain/datas.js`, insert after the `somarDias` function (after line 9) and before `export const mesDe = ...`:

```js
function ultimoDiaDoMes(ano, mesIndex0) {
  return new Date(Date.UTC(ano, mesIndex0 + 1, 0)).getUTCDate();
}

export function somarMeses(iso, meses) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  alvo.setUTCDate(Math.min(dia, ultimoDiaDoMes(alvo.getUTCFullYear(), alvo.getUTCMonth())));
  return alvo.toISOString().slice(0, 10);
}

export function dataNoMes(anoMes, dia) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const diaFinal = Math.min(dia, ultimoDiaDoMes(ano, mes - 1));
  return `${anoMes}-${String(diaFinal).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/domain/datas.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add server/domain/datas.js server/domain/datas.test.js
git commit -m "feat: soma meses preservando dia, com clamp de fim de mes"
```

---

### Task 2: `max` support in the generic integer validator

**Files:**
- Modify: `server/http/validar.js:32-35`
- Test: `server/http/validar.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `validar(corpo, regras)` now honors `regra.max` for `{ tipo: 'inteiro' }` fields, matching the existing `regra.min` behavior and error format `` `Deve ser no máximo ${max}` ``.

- [ ] **Step 1: Write the failing test**

Add to `server/http/validar.test.js`, inside the `describe('validar', ...)` block, as a new `it` (don't touch the existing `REGRAS` constant or its tests):

```js
  it('aplica limite máximo em inteiro', () => {
    const REGRAS_MAX = { n: { tipo: 'inteiro', max: 5 } };
    expect(validar({ n: 5 }, REGRAS_MAX)).toEqual({ n: 5 });
    expect(errosDe(() => validar({ n: 6 }, REGRAS_MAX))).toEqual([{ campo: 'n', mensagem: 'Deve ser no máximo 5' }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/http/validar.test.js`
Expected: FAIL — the `n: 6` case doesn't throw (no `max` check exists yet)

- [ ] **Step 3: Implement the `max` check**

In `server/http/validar.js`, replace the `case 'inteiro':` block (lines 32–35):

```js
    case 'inteiro':
      if (!Number.isInteger(valor)) return { erro: 'Deve ser um número inteiro' };
      if (regra.min !== undefined && valor < regra.min) return { erro: `Deve ser no mínimo ${regra.min}` };
      if (regra.max !== undefined && valor > regra.max) return { erro: `Deve ser no máximo ${regra.max}` };
      return { valor };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/http/validar.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add server/http/validar.js server/http/validar.test.js
git commit -m "feat: suporte a limite maximo em campos inteiro do validador"
```

---

### Task 3: Backend — parcelamento em lote endpoint

**Files:**
- Modify: `server/routes/parcelas.js:1-78`
- Test: `server/routes/parcelas.test.js`

**Interfaces:**
- Consumes: `somarMeses(iso, meses)` from Task 1 (`server/domain/datas.js`); `max` validation from Task 2 (`server/http/validar.js`); `emTransacao(db, fn)` from `server/repos/crud.js` (already exists).
- Produces: `POST /projetos/:id/parcelas/lote` — body `{ quantidade, valor_centavos, primeira_vencimento }`, responds `201` with an array of created parcelas (same shape as the `GET` list, each with `estado`).

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/parcelas.test.js`, as a new `describe` block after the existing `describe('parcelas', ...)` block closes:

```js
describe('parcelamento em lote', () => {
  it('gera N parcelas mensais com descrição numerada', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 3, valor_centavos: 50000, primeira_vencimento: '2026-04-10' })
      .expect(201);
    expect(res.body.map((p) => [p.descricao, p.vencimento, p.valor_centavos, p.estado])).toEqual([
      ['Parcela 1/3', '2026-04-10', 50000, 'pendente'],
      ['Parcela 2/3', '2026-05-10', 50000, 'pendente'],
      ['Parcela 3/3', '2026-06-10', 50000, 'pendente'],
    ]);
    const lista = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(lista.body.parcelas).toHaveLength(3);
  });

  it('ajusta parcelas para o fim do mês quando o dia não existe', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 2, valor_centavos: 10000, primeira_vencimento: '2026-01-31' })
      .expect(201);
    expect(res.body.map((p) => p.vencimento)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('valida quantidade, valor e data', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 0, valor_centavos: 0, primeira_vencimento: 'x' })
      .expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['primeira_vencimento', 'quantidade', 'valor_centavos']);
  });

  it('rejeita quantidade acima do limite', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 61, valor_centavos: 100, primeira_vencimento: '2026-04-10' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'quantidade', mensagem: 'Deve ser no máximo 60' }]);
  });

  it('404 em projeto inexistente', async () => {
    await ctx.http
      .post('/api/projetos/999/parcelas/lote')
      .send({ quantidade: 1, valor_centavos: 100, primeira_vencimento: '2026-04-10' })
      .expect(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/parcelas.test.js`
Expected: FAIL — `404` / `Rota não encontrada` for the new endpoint (it doesn't exist yet)

- [ ] **Step 3: Implement the lote endpoint**

In `server/routes/parcelas.js`, update the imports at the top (line 2 and line 7):

```js
import { Router } from 'express';
import { criarRepo, linha, emTransacao } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, naoEncontrado } from '../http/erros.js';
import { estadoParcela, resumoParcelas, recebidoPorMes } from '../domain/financeiro.js';
import { mesDe, somarMeses } from '../domain/datas.js';
```

Add `REGRAS_LOTE` next to `REGRAS_PARCELA` (after line 14, before `const ESTADOS = ...`):

```js
const REGRAS_LOTE = {
  quantidade: { tipo: 'inteiro', obrigatorio: true, min: 1, max: 60 },
  valor_centavos: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  primeira_vencimento: { tipo: 'data', obrigatorio: true },
};
```

Add the new route right after the existing `r.post('/projetos/:id/parcelas', ...)` handler (after line 42, before `r.put('/parcelas/:id', ...)`):

```js
  r.post('/projetos/:id/parcelas/lote', (req, res) => {
    const projeto = exigirProjeto(req);
    const { quantidade, valor_centavos, primeira_vencimento } = validar(req.body, REGRAS_LOTE);
    const criadas = emTransacao(db, () =>
      Array.from({ length: quantidade }, (_, i) =>
        parcelas.criar({
          projeto_id: projeto.id,
          descricao: `Parcela ${i + 1}/${quantidade}`,
          valor_centavos,
          vencimento: somarMeses(primeira_vencimento, i),
        }),
      ),
    );
    res.status(201).json(criadas.map(comEstado));
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/parcelas.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add server/routes/parcelas.js server/routes/parcelas.test.js
git commit -m "feat: endpoint para gerar parcelas em lote mensalmente"
```

---

### Task 4: Frontend — form de parcelamento em lote na Aba Financeiro

**Files:**
- Modify: `web/src/pages/projeto/AbaFinanceiro.jsx:1-106`
- Test: `web/src/pages/projeto/AbaFinanceiro.test.jsx`

**Interfaces:**
- Consumes: `POST /projetos/:id/parcelas/lote` from Task 3.
- Produces: no new exports — internal UI addition to `AbaFinanceiro`.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/pages/projeto/AbaFinanceiro.test.jsx`, add `fireEvent` to the existing `@testing-library/react` import and add two new `it` blocks inside `describe('AbaFinanceiro', ...)`:

```js
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaFinanceiro } from './AbaFinanceiro.jsx';
import { mockApi } from '../../test/mockApi.js';
import { hojeISO } from '../../lib/datas.js';
```

```js
  it('gera parcelas em lote', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5/parcelas': { parcelas: [], resumo: dados.resumo },
      'POST /projetos/5/parcelas/lote': [],
    });
    render(<AbaFinanceiro projeto={{ id: 5 }} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Quantidade'), '3');
    await user.type(screen.getByLabelText('Valor de cada parcela (R$)'), '500');
    fireEvent.change(screen.getByLabelText('Vencimento da 1ª parcela'), { target: { value: '2026-04-10' } });
    await user.click(screen.getByRole('button', { name: 'Gerar parcelas' }));
    await screen.findByText('Nenhuma parcela cadastrada.');
    const post = chamadas.find((c) => c.caminho === '/projetos/5/parcelas/lote');
    expect(post.corpo).toEqual({ quantidade: 3, valor_centavos: 50000, primeira_vencimento: '2026-04-10' });
  });

  it('não gera lote sem valor válido', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/parcelas': { parcelas: [], resumo: dados.resumo } });
    render(<AbaFinanceiro projeto={{ id: 5 }} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Quantidade'), '3');
    await user.type(screen.getByLabelText('Valor de cada parcela (R$)'), 'mil');
    await user.click(screen.getByRole('button', { name: 'Gerar parcelas' }));
    expect(await screen.findByText('Informe um valor válido')).toBeInTheDocument();
    expect(chamadas.some((c) => c.caminho === '/projetos/5/parcelas/lote')).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/pages/projeto/AbaFinanceiro.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Quantidade` (form doesn't exist yet)

- [ ] **Step 3: Implement the lote form**

In `web/src/pages/projeto/AbaFinanceiro.jsx`, add a second empty-state constant after `VAZIO` (line 12):

```js
const VAZIO = { descricao: '', valor: '', vencimento: '' };
const VAZIO_LOTE = { quantidade: '', valor: '', primeira_vencimento: '' };
```

Replace the component body's state/handlers section (lines 14–36) with:

```js
export function AbaFinanceiro({ projeto }) {
  const { dados, erro, recarregar } = useCarregar(() => api(`/projetos/${projeto.id}/parcelas`), [projeto.id]);
  const { valores, campo, setValores } = useFormulario(VAZIO);
  const { valores: loteValores, campo: loteCampo, setValores: setLoteValores } = useFormulario(VAZIO_LOTE);
  const envio = useEnvio();
  const envioLote = useEnvio();

  const acao = (fn) => envio.executar(async () => { await fn(); recarregar(); });
  const atualizar = (parcela, corpo) => acao(() => api(`/parcelas/${parcela.id}`, { method: 'PUT', body: corpo }));

  function adicionar(e) {
    e.preventDefault();
    const valor = paraCentavos(valores.valor);
    if (valor === null || Number.isNaN(valor)) {
      envio.setErros([{ campo: 'valor_centavos', mensagem: 'Informe um valor válido' }]);
      return;
    }
    acao(async () => {
      await api(`/projetos/${projeto.id}/parcelas`, {
        method: 'POST',
        body: { descricao: valores.descricao, valor_centavos: valor, vencimento: valores.vencimento },
      });
      setValores(VAZIO);
    });
  }

  function gerarLote(e) {
    e.preventDefault();
    const valor = paraCentavos(loteValores.valor);
    if (valor === null || Number.isNaN(valor)) {
      envioLote.setErros([{ campo: 'valor_centavos', mensagem: 'Informe um valor válido' }]);
      return;
    }
    envioLote.executar(async () => {
      await api(`/projetos/${projeto.id}/parcelas/lote`, {
        method: 'POST',
        body: {
          quantidade: Number(loteValores.quantidade),
          valor_centavos: valor,
          primeira_vencimento: loteValores.primeira_vencimento,
        },
      });
      setLoteValores(VAZIO_LOTE);
      recarregar();
    });
  }
```

Replace the returned JSX (lines 43–106) with:

```js
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <p>Carregando…</p>;
  const { parcelas, resumo } = dados;
  const acima = resumo.nao_parcelado_centavos < 0;

  return (
    <>
      <div className="cartoes">
        <Numero rotulo="Recebido">{formatarDinheiro(resumo.pago_centavos)}</Numero>
        <Numero rotulo="A receber">{formatarDinheiro(resumo.pendente_centavos)}</Numero>
        <Numero rotulo="Atrasado">{formatarDinheiro(resumo.atrasado_centavos)}</Numero>
        <Numero rotulo={acima ? 'Parcelas acima do valor' : 'Não parcelado'}>
          {formatarDinheiro(Math.abs(resumo.nao_parcelado_centavos))}
        </Numero>
      </div>

      <div className="cartao">
        <h3>Gerar parcelas em lote</h3>
        <form onSubmit={gerarLote} className="form form--linha" noValidate>
          <Campo rotulo="Quantidade" nome="quantidade" erros={envioLote.erros} type="number" min="1" {...loteCampo('quantidade')} />
          <Campo rotulo="Valor de cada parcela (R$)" nome="valor_centavos" erros={envioLote.erros} inputMode="decimal" {...loteCampo('valor')} />
          <Campo rotulo="Vencimento da 1ª parcela" nome="primeira_vencimento" erros={envioLote.erros} type="date" {...loteCampo('primeira_vencimento')} />
          <button className="btn btn--primario" disabled={envioLote.enviando}>Gerar parcelas</button>
        </form>
        <Aviso erro={envioLote.erro} />

        {parcelas.length ? (
          <table className="tabela">
            <thead>
              <tr><th>Descrição</th><th className="num">Valor</th><th>Vencimento</th><th>Estado</th><th>Pagamento</th><th /></tr>
            </thead>
            <tbody>
              {parcelas.map((p) => {
                const nome = p.descricao || `Parcela de ${formatarData(p.vencimento)}`;
                return (
                  <tr key={p.id}>
                    <td>{nome}</td>
                    <td className="num">{formatarDinheiro(p.valor_centavos)}</td>
                    <td>{formatarData(p.vencimento)}</td>
                    <td><span className={`etiqueta etiqueta--${p.estado}`}>{ROTULO_ESTADO_PARCELA[p.estado]}</span></td>
                    <td>
                      {p.pago_em ? (
                        <>
                          <input
                            type="date"
                            aria-label={`Data de pagamento de ${nome}`}
                            value={p.pago_em}
                            onChange={(e) => e.target.value && atualizar(p, { pago_em: e.target.value })}
                          />{' '}
                          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => atualizar(p, { pago_em: null })}>Desfazer</button>
                        </>
                      ) : (
                        <button type="button" className="btn btn--pequeno" aria-label={`Marcar ${nome} como paga`} onClick={() => atualizar(p, { pago_em: hojeISO() })}>
                          Marcar como pago
                        </button>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Excluir ${nome}`} onClick={() => acao(() => api(`/parcelas/${p.id}`, { method: 'DELETE' }))}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="vazio">Nenhuma parcela cadastrada.</p>}

        <h3>Adicionar parcela avulsa</h3>
        <form onSubmit={adicionar} className="form form--linha" noValidate>
          <Campo rotulo="Descrição" nome="descricao" erros={envio.erros} placeholder="Entrada 50%" {...campo('descricao')} />
          <Campo rotulo="Valor da parcela (R$)" nome="valor_centavos" erros={envio.erros} inputMode="decimal" {...campo('valor')} />
          <Campo rotulo="Vencimento" nome="vencimento" erros={envio.erros} type="date" {...campo('vencimento')} />
          <button className="btn btn--primario" disabled={envio.enviando}>Adicionar parcela</button>
        </form>
        <Aviso erro={envio.erro} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/pages/projeto/AbaFinanceiro.test.jsx`
Expected: PASS (all tests in the file, including the two pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/projeto/AbaFinanceiro.jsx web/src/pages/projeto/AbaFinanceiro.test.jsx
git commit -m "feat: form para gerar parcelas em lote na aba financeiro"
```

---

### Task 5: Migração — colunas de mensalidade

**Files:**
- Create: `server/db/migrations/002_mensalidade.sql`

**Interfaces:**
- Produces: `projetos.mensalidade_ativa` (INTEGER 0/1, default 0), `projetos.mensalidade_valor_centavos` (INTEGER, default 0), `projetos.mensalidade_dia_vencimento` (INTEGER, nullable, 1–31), `parcelas.mensalidade` (INTEGER 0/1, default 0).

- [ ] **Step 1: Write the migration**

Create `server/db/migrations/002_mensalidade.sql`:

```sql
ALTER TABLE projetos ADD COLUMN mensalidade_ativa INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_ativa IN (0, 1));
ALTER TABLE projetos ADD COLUMN mensalidade_valor_centavos INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_valor_centavos >= 0);
ALTER TABLE projetos ADD COLUMN mensalidade_dia_vencimento INTEGER CHECK (mensalidade_dia_vencimento IS NULL OR (mensalidade_dia_vencimento BETWEEN 1 AND 31));
ALTER TABLE parcelas ADD COLUMN mensalidade INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade IN (0, 1));
```

- [ ] **Step 2: Run the existing migration/connection suite to verify it applies cleanly**

Run: `npx vitest run server/db/connection.test.js`
Expected: PASS — `openDb(':memory:')` runs both `001_inicial.sql` and `002_mensalidade.sql` without SQL errors, and `schema_migrations` records both filenames (covered by the existing "não reaplica migrações já registradas" test).

- [ ] **Step 3: Commit**

```bash
git add server/db/migrations/002_mensalidade.sql
git commit -m "feat: colunas de mensalidade em projetos e parcelas"
```

---

### Task 6: Backend — campos de mensalidade em projetos + validação cruzada

**Files:**
- Modify: `server/repos/projetos.js:3-6`
- Modify: `server/routes/projetos.js:1-83`
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: `002_mensalidade.sql` columns from Task 5.
- Produces: `PUT /projetos/:id` and `POST /projetos` accept/return `mensalidade_ativa` (bool), `mensalidade_valor_centavos` (int), `mensalidade_dia_vencimento` (int|null); reject with `400` when `mensalidade_ativa` ends up `true` but valor/dia are missing.

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/projetos.test.js`, inside `describe('/api/projetos', ...)`, before the closing `});`:

```js
  it('exige valor e dia quando ativa a mensalidade', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ mensalidade_ativa: true }).expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['mensalidade_dia_vencimento', 'mensalidade_valor_centavos']);
  });

  it('ativa mensalidade com valor e dia válidos', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    const res = await ctx.http
      .put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 })
      .expect(200);
    expect(res.body).toMatchObject({ mensalidade_ativa: 1, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 });
  });

  it('desativar mensalidade não exige valor/dia', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    await ctx.http
      .put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 })
      .expect(200);
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`).send({ mensalidade_ativa: false }).expect(200);
    expect(res.body.mensalidade_ativa).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/projetos.test.js`
Expected: FAIL — the `PUT` succeeds with `200` instead of `400` for the first test (no cross-field check yet), and `mensalidade_ativa`/`mensalidade_valor_centavos`/`mensalidade_dia_vencimento` are `undefined` in responses for the other two

- [ ] **Step 3: Implement**

In `server/repos/projetos.js`, replace `CAMPOS_PROJETO` (lines 3–6):

```js
export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
];
```

In `server/routes/projetos.js`, replace `REGRAS_PROJETO` (lines 10–20):

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
};

function exigirDadosMensalidade(atual, dados) {
  const ativa = dados.mensalidade_ativa ?? atual?.mensalidade_ativa ?? 0;
  if (!ativa) return;
  const valor = dados.mensalidade_valor_centavos ?? atual?.mensalidade_valor_centavos;
  const dia = dados.mensalidade_dia_vencimento ?? atual?.mensalidade_dia_vencimento;
  const erros = [];
  if (!valor) erros.push({ campo: 'mensalidade_valor_centavos', mensagem: 'Obrigatório quando a mensalidade está ativa' });
  if (!dia) erros.push({ campo: 'mensalidade_dia_vencimento', mensagem: 'Obrigatório quando a mensalidade está ativa' });
  if (erros.length) throw new ErroValidacao(erros);
}
```

In the same file, update the `POST /` handler (lines 37–59) to call `exigirDadosMensalidade` in both branches:

```js
  r.post('/', (req, res) => {
    const corpo = req.body ?? {};
    if (corpo.novo_cliente) {
      let dadosCliente;
      try {
        dadosCliente = validar(corpo.novo_cliente, REGRAS_CLIENTE);
      } catch (erro) {
        if (!(erro instanceof ErroValidacao)) throw erro;
        throw new ErroValidacao(erro.erros.map((e) => ({ ...e, campo: `novo_cliente.${e.campo}` })));
      }
      const { cliente_id: _ignorado, ...regrasSemCliente } = REGRAS_PROJETO;
      const dados = aplicarRegrasProjeto(null, validar(corpo, regrasSemCliente), hoje());
      exigirDadosMensalidade(null, dados);
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        return projetos.criar({ ...dados, cliente_id: cliente.id });
      });
      return res.status(201).json(projetos.obterComCliente(criado.id));
    }
    const dados = aplicarRegrasProjeto(null, validar(corpo, REGRAS_PROJETO), hoje());
    exigirDadosMensalidade(null, dados);
    exigirCliente(dados.cliente_id);
    const criado = projetos.criar(dados);
    res.status(201).json(projetos.obterComCliente(criado.id));
  });
```

And update the `PUT /:id` handler (lines 67–75):

```js
  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = projetos.obter(id);
    if (!atual) throw naoEncontrado('Projeto');
    const dados = aplicarRegrasProjeto(atual, validar(req.body, REGRAS_PROJETO, { parcial: true }), hoje());
    exigirDadosMensalidade(atual, dados);
    if (dados.cliente_id !== undefined) exigirCliente(dados.cliente_id);
    projetos.atualizar(id, dados);
    res.json(projetos.obterComCliente(id));
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/projetos.test.js`
Expected: PASS (all tests in the file, including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add server/repos/projetos.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: campos de mensalidade em projetos com validacao cruzada"
```

---

### Task 7: Backend — geração automática da parcela mensal

**Files:**
- Modify: `server/routes/parcelas.js:1-90` (post-Task-3 state)
- Test: `server/routes/parcelas.test.js`

**Interfaces:**
- Consumes: `dataNoMes(anoMes, dia)` from Task 1; `mensalidade_ativa`/`mensalidade_valor_centavos`/`mensalidade_dia_vencimento` on the projeto object from Task 6.
- Produces: `GET /projetos/:id/parcelas` now also creates the current month's mensalidade parcela (idempotently) before responding, when the projeto has `mensalidade_ativa` truthy.

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/parcelas.test.js`, as a new `describe` block after `describe('parcelamento em lote', ...)`:

```js
describe('mensalidade automática', () => {
  async function ativarMensalidade(valor = 20000, dia = 10) {
    await ctx.http
      .put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: valor, mensalidade_dia_vencimento: dia })
      .expect(200);
  }

  it('gera a parcela do mês atual na primeira consulta e não duplica', async () => {
    await ativarMensalidade();
    const res1 = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res1.body.parcelas).toHaveLength(1);
    expect(res1.body.parcelas[0]).toMatchObject({ descricao: 'Mensalidade', valor_centavos: 20000, vencimento: '2026-09-10' });

    const res2 = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res2.body.parcelas).toHaveLength(1);
  });

  it('não gera quando a mensalidade está desativada', async () => {
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas).toHaveLength(0);
  });

  it('desativar para de gerar novas parcelas, mas mantém as já criadas', async () => {
    await ativarMensalidade();
    await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    await ctx.http.put(`/api/projetos/${projeto.id}`).send({ mensalidade_ativa: false }).expect(200);
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas).toHaveLength(1);
  });

  it('ajusta o dia de vencimento para o fim de um mês curto', async () => {
    const ctxFevereiro = criarContexto({ hoje: '2026-02-15' });
    const cli = (await ctxFevereiro.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const proj = (await ctxFevereiro.http.post('/api/projetos').send({ cliente_id: cli.id, titulo: 'App' })).body;
    await ctxFevereiro.http
      .put(`/api/projetos/${proj.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 10000, mensalidade_dia_vencimento: 31 })
      .expect(200);
    const res = await ctxFevereiro.http.get(`/api/projetos/${proj.id}/parcelas`).expect(200);
    expect(res.body.parcelas[0].vencimento).toBe('2026-02-28');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/parcelas.test.js`
Expected: FAIL — `res1.body.parcelas` is `[]` instead of having 1 item (no auto-generation yet)

- [ ] **Step 3: Implement**

In `server/routes/parcelas.js`, update the datas import to include `dataNoMes`:

```js
import { mesDe, somarMeses, dataNoMes } from '../domain/datas.js';
```

Update the `criarRepo` call for parcelas to include the new `mensalidade` column:

```js
  const parcelas = criarRepo(db, 'parcelas', ['projeto_id', 'descricao', 'valor_centavos', 'vencimento', 'pago_em', 'mensalidade']);
```

Add a `gerarMensalidadeSeNecessario` helper right after `exigirProjeto` (after the function that throws `naoEncontrado('Projeto')`):

```js
  function gerarMensalidadeSeNecessario(projeto) {
    if (!projeto.mensalidade_ativa) return;
    const mesAtual = mesDe(hoje());
    const existentes = parcelas.listar({ projeto_id: projeto.id });
    const jaGerada = existentes.some((p) => p.mensalidade && mesDe(p.vencimento) === mesAtual);
    if (jaGerada) return;
    parcelas.criar({
      projeto_id: projeto.id,
      descricao: 'Mensalidade',
      valor_centavos: projeto.mensalidade_valor_centavos,
      vencimento: dataNoMes(mesAtual, projeto.mensalidade_dia_vencimento),
      mensalidade: 1,
    });
  }
```

Update the `GET /projetos/:id/parcelas` handler to call it before listing:

```js
  r.get('/projetos/:id/parcelas', (req, res) => {
    const projeto = exigirProjeto(req);
    gerarMensalidadeSeNecessario(projeto);
    const lista = parcelas.listar({ projeto_id: projeto.id }, 'vencimento, id');
    res.json({
      parcelas: lista.map(comEstado),
      resumo: resumoParcelas(lista, hoje(), projeto.valor_total_centavos),
    });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/parcelas.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add server/routes/parcelas.js server/routes/parcelas.test.js
git commit -m "feat: gera automaticamente a parcela mensal quando a mensalidade esta ativa"
```

---

### Task 8: Frontend — controle de mensalidade na Aba Geral

**Files:**
- Modify: `web/src/pages/projeto/AbaGeral.jsx:1-84`
- Test: `web/src/pages/projeto/Projeto.test.jsx`

**Interfaces:**
- Consumes: `PUT /projetos/:id` accepting `mensalidade_ativa`/`mensalidade_valor_centavos`/`mensalidade_dia_vencimento` from Task 6.
- Produces: no new exports — internal UI addition to `AbaGeral`.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/pages/projeto/Projeto.test.jsx`, inside `describe('Projeto', ...)`, after the existing `it('troca de aba', ...)` block:

```js
  it('ativa mensalidade e envia valor/dia convertidos', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5': projetoExemplo,
      'GET /clientes': [{ id: 1, nome: 'Ana' }],
      'PUT /projetos/5': { ...projetoExemplo, mensalidade_ativa: 1, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10, atualizado_em: 'T2' },
    });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    await user.type(screen.getByLabelText('Valor da mensalidade (R$)'), '200');
    await user.type(screen.getByLabelText('Dia de vencimento'), '10');
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo).toMatchObject({ mensalidade_ativa: true, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 });
  });

  it('esconde os campos de mensalidade quando desmarcada', async () => {
    mockApi({ 'GET /projetos/5': projetoExemplo, 'GET /clientes': [] });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    await screen.findByLabelText('Cobra mensalidade');
    expect(screen.queryByLabelText('Valor da mensalidade (R$)')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/pages/projeto/Projeto.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Cobra mensalidade`

- [ ] **Step 3: Implement**

In `web/src/pages/projeto/AbaGeral.jsx`, extend the initial `useFormulario` values (lines 14–24):

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
  });
```

Replace the `salvar` function (lines 27–42):

```js
  function salvar(e) {
    e.preventDefault();
    const valorCentavos = paraCentavos(valores.valor);
    if (Number.isNaN(valorCentavos)) {
      setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const mensalidadeValorCentavos = valores.mensalidade_ativa ? paraCentavos(valores.mensalidade_valor) : 0;
    if (valores.mensalidade_ativa && (mensalidadeValorCentavos === null || Number.isNaN(mensalidadeValorCentavos))) {
      setErros([{ campo: 'mensalidade_valor_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const { valor: _valor, mensalidade_valor: _mensalidadeValor, ...resto } = valores;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, {
        method: 'PUT',
        body: {
          ...resto,
          cliente_id: Number(resto.cliente_id),
          valor_total_centavos: valorCentavos ?? 0,
          mensalidade_ativa: Boolean(valores.mensalidade_ativa),
          mensalidade_valor_centavos: mensalidadeValorCentavos ?? 0,
          mensalidade_dia_vencimento: valores.mensalidade_ativa && valores.mensalidade_dia_vencimento
            ? Number(valores.mensalidade_dia_vencimento)
            : null,
        },
      });
      onSalvo();
    });
  }
```

Add the checkbox and conditional fields to the JSX, right after the `Notas` `Campo` (after line 76, before `<Aviso erro={erro} />`):

```jsx
      <Campo rotulo="Notas" nome="notas" erros={erros}>
        <textarea rows={4} {...campo('notas')} />
      </Campo>
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.mensalidade_ativa)}
            onChange={(e) => setValores((v) => ({ ...v, mensalidade_ativa: e.target.checked }))}
          />{' '}
          Cobra mensalidade
        </label>
      </div>
      {valores.mensalidade_ativa && (
        <>
          <Campo rotulo="Valor da mensalidade (R$)" nome="mensalidade_valor_centavos" erros={erros} inputMode="decimal" {...campo('mensalidade_valor')} />
          <Campo rotulo="Dia de vencimento" nome="mensalidade_dia_vencimento" erros={erros} type="number" min="1" max="31" {...campo('mensalidade_dia_vencimento')} />
        </>
      )}
      <Aviso erro={erro} />
```

(This replaces just the single line `<Aviso erro={erro} />` that follows `Notas` in the original file — the `Campo rotulo="Notas"` block itself is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/pages/projeto/Projeto.test.jsx`
Expected: PASS (all tests in the file, including pre-existing ones)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test in both the `server` and `web` projects

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/projeto/AbaGeral.jsx web/src/pages/projeto/Projeto.test.jsx
git commit -m "feat: controle de mensalidade recorrente na aba geral do projeto"
```
