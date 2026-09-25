# Divulgação pendente dentro das tarefas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a seção separada "Divulgação pendente" da Início por itens sintéticos ("Postar no Instagram", "Publicar no portfólio") dentro da própria lista de tarefas de cada projeto, na seção "Tarefas por projeto" já existente.

**Architecture:** `montarDivulgacaoPendente` (que produzia uma lista própria) vira `montarTarefasDivulgacao`, que produz linhas no mesmo formato usado por `agruparTarefasPorProjeto` (`{id, texto, prazo, projeto_id, projeto_titulo, ficticio}`). A rota `GET /painel` soma essas linhas às tarefas reais antes de agrupar, e o campo `divulgacao_pendente` sai da resposta. `Inicio.jsx` perde a seção separada.

**Tech Stack:** Node.js (`node:sqlite`), Express, Vitest + Supertest no backend; React 19, Vitest + Testing Library no frontend.

## Global Constraints

- `agruparTarefasPorProjeto` não muda (spec: "continua uma função pura de agrupamento, agnóstica a se a linha veio da tabela `tarefas` ou é sintética").
- Regra de quando divulgar não muda: só projetos com `etapa = 'entregue'`, reais e fictícios igualmente.

---

### Task 1: `montarTarefasDivulgacao` no lugar de `montarDivulgacaoPendente`

**Files:**
- Modify: `server/domain/painel.js`
- Test: `server/domain/painel.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `montarTarefasDivulgacao(linhas: Array<{id, titulo, ficticio, postou_instagram, portfolio_publicado}>) → Array<{id, texto, prazo: null, projeto_id, projeto_titulo, ficticio}>`. Consumida por `server/routes/painel.js` na Task 2.

- [ ] **Step 1: Trocar o teste (falhando)**

Em `server/domain/painel.test.js`, trocar o import:

```js
import { montarProximos, agruparTarefasPorProjeto, montarDivulgacaoPendente } from './painel.js';
```

por:

```js
import { montarProximos, agruparTarefasPorProjeto, montarTarefasDivulgacao } from './painel.js';
```

E trocar o bloco `describe('montarDivulgacaoPendente', ...)` inteiro por:

```js
describe('montarTarefasDivulgacao', () => {
  it('gera um item só para o que falta', () => {
    const linhas = [{ id: 1, titulo: 'Site A', ficticio: 0, postou_instagram: 0, portfolio_publicado: 1 }];
    expect(montarTarefasDivulgacao(linhas)).toEqual([
      { id: 'divulgacao-1-Postar no Instagram', texto: 'Postar no Instagram', prazo: null, projeto_id: 1, projeto_titulo: 'Site A', ficticio: 0 },
    ]);
  });

  it('gera dois itens quando falta tudo', () => {
    const linhas = [{ id: 2, titulo: 'Case fictício', ficticio: 1, postou_instagram: 0, portfolio_publicado: 0 }];
    expect(montarTarefasDivulgacao(linhas)).toEqual([
      { id: 'divulgacao-2-Postar no Instagram', texto: 'Postar no Instagram', prazo: null, projeto_id: 2, projeto_titulo: 'Case fictício', ficticio: 1 },
      { id: 'divulgacao-2-Publicar no portfólio', texto: 'Publicar no portfólio', prazo: null, projeto_id: 2, projeto_titulo: 'Case fictício', ficticio: 1 },
    ]);
  });

  it('não gera nada quando as duas divulgações já foram feitas', () => {
    const linhas = [{ id: 3, titulo: 'Loja X', ficticio: 0, postou_instagram: 1, portfolio_publicado: 1 }];
    expect(montarTarefasDivulgacao(linhas)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run server/domain/painel.test.js`
Expected: FAIL — `montarTarefasDivulgacao` ainda não existe em `./painel.js` (erro de import/`is not a function`).

- [ ] **Step 3: Implementar a função**

Em `server/domain/painel.js`, trocar:

```js
export function montarDivulgacaoPendente(linhas) {
  return linhas.map((p) => ({
    projeto_id: p.id,
    titulo: p.titulo,
    ficticio: Boolean(p.ficticio),
    falta_portfolio: !p.portfolio_publicado,
    falta_instagram: !p.postou_instagram,
  }));
}
```

por:

```js
export function montarTarefasDivulgacao(linhas) {
  return linhas.flatMap((p) => {
    const itens = [];
    if (!p.postou_instagram) itens.push('Postar no Instagram');
    if (!p.portfolio_publicado) itens.push('Publicar no portfólio');
    return itens.map((texto) => ({
      id: `divulgacao-${p.id}-${texto}`,
      texto,
      prazo: null,
      projeto_id: p.id,
      projeto_titulo: p.titulo,
      ficticio: p.ficticio,
    }));
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run server/domain/painel.test.js`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add server/domain/painel.js server/domain/painel.test.js
git commit -m "feat: gera itens de divulgacao pendente no formato de tarefa"
```

---

### Task 2: Somar os itens de divulgação às tarefas em `GET /painel`

**Files:**
- Modify: `server/routes/painel.js`
- Test: `server/routes/painel.test.js`

**Interfaces:**
- Consumes: `montarTarefasDivulgacao` de `../domain/painel.js` (Task 1).
- Produces: `GET /painel` não retorna mais `divulgacao_pendente`; os itens de divulgação entram dentro de `tarefas_por_projeto`. Consumido por `web/src/pages/Inicio.jsx` na Task 3.

- [ ] **Step 1: Atualizar o teste (falhando)**

Em `server/routes/painel.test.js`, no teste `'agrupa tarefas por projeto (com e sem prazo) e lista divulgação pendente'`, trocar as duas últimas asserções (a de `tarefas_por_projeto.reais` continua igual, mas ganha o item de divulgação, e as de `divulgacao_pendente` saem):

```js
    expect(res.body.tarefas_por_projeto.reais).toEqual([
      { projeto_id: real.id, projeto_titulo: 'Site real', tarefas: [
        { id: expect.any(Number), texto: 'Com prazo', prazo: '2026-09-30' },
        { id: expect.any(Number), texto: 'Sem prazo', prazo: null },
        { id: `divulgacao-${real.id}-Publicar no portfólio`, texto: 'Publicar no portfólio', prazo: null },
      ] },
    ]);
    expect(res.body.tarefas_por_projeto.ficticios).toEqual([
      { projeto_id: ficticio.id, projeto_titulo: 'Case fictício', tarefas: [
        { id: expect.any(Number), texto: 'Tarefa do case', prazo: null },
        { id: `divulgacao-${ficticio.id}-Postar no Instagram`, texto: 'Postar no Instagram', prazo: null },
        { id: `divulgacao-${ficticio.id}-Publicar no portfólio`, texto: 'Publicar no portfólio', prazo: null },
      ] },
    ]);
    expect(res.body.proximos.some((i) => i.tipo === 'tarefa')).toBe(false);
    expect(res.body.divulgacao_pendente).toBeUndefined();
  });
});
```

(Isso substitui as linhas antigas — do `expect(res.body.tarefas_por_projeto.reais)` até o `expect(res.body.divulgacao_pendente).toEqual([...])` — no teste existente. O `real` já tem `postou_instagram: true` de uma chamada anterior no mesmo teste, por isso só falta "Publicar no portfólio" pra ele.)

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run server/routes/painel.test.js`
Expected: FAIL — os itens de divulgação ainda não estão dentro de `tarefas_por_projeto`, e `divulgacao_pendente` ainda existe na resposta.

- [ ] **Step 3: Atualizar a rota**

Em `server/routes/painel.js`, trocar o import:

```js
import { montarProximos, agruparTarefasPorProjeto, montarDivulgacaoPendente } from '../domain/painel.js';
```

por:

```js
import { montarProximos, agruparTarefasPorProjeto, montarTarefasDivulgacao } from '../domain/painel.js';
```

E trocar:

```js
      tarefas_por_projeto: agruparTarefasPorProjeto(
        todas(
          `SELECT t.id, t.texto, t.prazo, p.id AS projeto_id, p.titulo AS projeto_titulo, p.ficticio
           FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
           WHERE t.concluida = 0 AND p.etapa <> 'perdido'
           ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id, t.ordem, t.id`,
        ),
      ),
      divulgacao_pendente: montarDivulgacaoPendente(
        todas(
          `SELECT p.id, p.titulo, p.ficticio, p.postou_instagram, COALESCE(pf.publicar, 0) AS portfolio_publicado
           FROM projetos p LEFT JOIN portfolio pf ON pf.projeto_id = p.id
           WHERE p.etapa = 'entregue' AND (p.postou_instagram = 0 OR COALESCE(pf.publicar, 0) = 0)
           ORDER BY p.titulo`,
        ),
      ),
```

por:

```js
      tarefas_por_projeto: agruparTarefasPorProjeto([
        ...todas(
          `SELECT t.id, t.texto, t.prazo, p.id AS projeto_id, p.titulo AS projeto_titulo, p.ficticio
           FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
           WHERE t.concluida = 0 AND p.etapa <> 'perdido'
           ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id, t.ordem, t.id`,
        ),
        ...montarTarefasDivulgacao(
          todas(
            `SELECT p.id, p.titulo, p.ficticio, p.postou_instagram, COALESCE(pf.publicar, 0) AS portfolio_publicado
             FROM projetos p LEFT JOIN portfolio pf ON pf.projeto_id = p.id
             WHERE p.etapa = 'entregue' AND (p.postou_instagram = 0 OR COALESCE(pf.publicar, 0) = 0)
             ORDER BY p.titulo`,
          ),
        ),
      ]),
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run server/routes/painel.test.js`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add server/routes/painel.js server/routes/painel.test.js
git commit -m "feat: itens de divulgacao pendente entram na lista de tarefas por projeto"
```

---

### Task 3: Simplificar `Inicio.jsx`

**Files:**
- Modify: `web/src/pages/Inicio.jsx`
- Test: `web/src/pages/Inicio.test.jsx`

**Interfaces:**
- Consumes: `GET /painel` sem `divulgacao_pendente`, com os itens de divulgação já dentro de `tarefas_por_projeto` (Task 2).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Atualizar o teste (falhando)**

Substituir o conteúdo de `web/src/pages/Inicio.test.jsx` por:

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Inicio } from './Inicio.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('Inicio', () => {
  it('mostra cartões e próximos itens, destacando atrasados', async () => {
    mockApi({
      'GET /painel': {
        cartoes: {
          a_receber_mes_centavos: 300000,
          atrasadas: { quantidade: 1, total_centavos: 50000 },
          em_andamento: 2,
          propostas: { quantidade: 1, total_centavos: 800000 },
        },
        tarefas_por_projeto: {
          reais: [{ projeto_id: 10, projeto_titulo: 'Site A', tarefas: [
            { id: 1, texto: 'Revisar', prazo: null },
            { id: 'divulgacao-10-Publicar no portfólio', texto: 'Publicar no portfólio', prazo: null },
          ] }],
          ficticios: [{ projeto_id: 20, projeto_titulo: 'Case fictício', tarefas: [{ id: 2, texto: 'Ajustar', prazo: '2026-09-30' }] }],
        },
        proximos: [
          { tipo: 'parcela', id: 3, projeto_id: 5, titulo: 'Entrada', contexto: 'Site Ana', data: '2026-09-20', atrasado: true, valor_centavos: 50000 },
          { tipo: 'conteudo', id: 4, projeto_id: null, titulo: 'Post case', contexto: 'instagram', data: '2026-09-25', atrasado: false },
        ],
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText(/3\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 · R\$\s500,00/)).toBeInTheDocument(); // \s cobre o espaço não separável do Intl
    expect(screen.getByRole('link', { name: 'Entrada' })).toHaveAttribute('href', '/projetos/5');
    expect(screen.getByRole('link', { name: 'Post case' })).toHaveAttribute('href', '/conteudo');
    expect(screen.getByText('atrasado')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Site A' })).toHaveAttribute('href', '/projetos/10');
    expect(screen.getByText('Revisar')).toBeInTheDocument();
    expect(screen.getByText('Publicar no portfólio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Case fictício' })).toHaveAttribute('href', '/projetos/20');
    expect(screen.getByText('Ajustar')).toBeInTheDocument();

    expect(screen.queryByText(/Divulgação pendente/)).not.toBeInTheDocument();
  });

  it('mostra mensagem quando não há nada nos próximos dias nem tarefas', async () => {
    mockApi({
      'GET /painel': {
        cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
        tarefas_por_projeto: { reais: [], ficticios: [] },
        proximos: [],
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nada para os próximos 7 dias.')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhuma tarefa pendente.')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run web/src/pages/Inicio.test.jsx`
Expected: FAIL — `Inicio.jsx` ainda espera `dados.divulgacao_pendente`, que agora é `undefined` (`.length` de `undefined` quebra o render).

- [ ] **Step 3: Simplificar `Inicio.jsx`**

Remover a função `rotuloFalta` (não é mais usada) e trocar:

```jsx
  const { cartoes, tarefas_por_projeto: tarefasPorProjeto, divulgacao_pendente: divulgacaoPendente, proximos } = dados;
```

por:

```jsx
  const { cartoes, tarefas_por_projeto: tarefasPorProjeto, proximos } = dados;
```

E remover o bloco inteiro da seção "Divulgação pendente":

```jsx
      {divulgacaoPendente.length > 0 && (
        <section className="cartao">
          <h2>Divulgação pendente</h2>
          <table className="tabela">
            <tbody>
              {divulgacaoPendente.map((p) => (
                <tr key={p.projeto_id}>
                  <td><Link to={`/projetos/${p.projeto_id}`}>{p.titulo}</Link></td>
                  <td>Falta: {rotuloFalta(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="grade-2">
```

por:

```jsx
      <div className="grade-2">
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run web/src/pages/Inicio.test.jsx`
Expected: PASS em ambos os testes.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Inicio.jsx web/src/pages/Inicio.test.jsx
git commit -m "feat: remove secao separada de divulgacao pendente da inicio"
```

---

### Task 4: Verificação final

**Files:** nenhum (só execução).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os arquivos de teste passam, sem regressões.

- [ ] **Step 2: Conferir manualmente (se o dev server estiver disponível)**

Abrir a Início. Confirmar que não existe mais a seção "Divulgação pendente" separada, e que um projeto entregue sem Instagram/portfólio aparece com "Postar no Instagram"/"Publicar no portfólio" dentro da sua lista de tarefas (na coluna real ou fictícios, conforme o caso).
