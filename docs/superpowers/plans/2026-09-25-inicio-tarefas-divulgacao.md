# Início: tarefas por projeto + divulgação pendente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na página Início, mostrar tarefas pendentes agrupadas por projeto (reais/fictícios, sem esconder as sem prazo) e um lembrete de divulgação pendente (portfólio/Instagram) para projetos entregues — tirando as tarefas da lista "Próximos 7 dias".

**Architecture:** Duas funções puras novas em `server/domain/painel.js` (mesmo padrão de `montarProximos`), duas queries SQL novas em `server/routes/painel.js` que alimentam essas funções, `GET /painel` ganha dois campos na resposta (`tarefas_por_projeto`, `divulgacao_pendente`), e `web/src/pages/Inicio.jsx` ganha duas seções novas e para de esperar tarefas em `proximos`.

**Tech Stack:** Node.js (`node:sqlite`), Express, Vitest + Supertest (`criarContexto`) no backend; React 19, Vitest + Testing Library no frontend.

## Global Constraints

- Tarefas concluídas (`concluida = 1`) e de projetos com `etapa = 'perdido'` nunca aparecem em "Tarefas por projeto" (spec: "Escopo #1").
- "Divulgação pendente" só considera projetos com `etapa = 'entregue'`, reais e fictícios igualmente (spec: "Escopo #2").
- "Próximos 7 dias" não muda o comportamento de parcelas/entregas/conteúdos — só perde tarefas (spec: "Escopo #3").

---

### Task 1: Funções de domínio `agruparTarefasPorProjeto` e `montarDivulgacaoPendente`

**Files:**
- Modify: `server/domain/painel.js`
- Test: `server/domain/painel.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `agruparTarefasPorProjeto(linhas: Array<{id, texto, prazo, projeto_id, projeto_titulo, ficticio}>) → { reais: Array<{projeto_id, projeto_titulo, tarefas: Array<{id, texto, prazo}>}>, ficticios: [...] }` e `montarDivulgacaoPendente(linhas: Array<{id, titulo, ficticio, postou_instagram, portfolio_publicado}>) → Array<{projeto_id, titulo, ficticio, falta_portfolio, falta_instagram}>`. Consumidas por `server/routes/painel.js` na Task 2.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar ao final de `server/domain/painel.test.js`:

```js
import { agruparTarefasPorProjeto, montarDivulgacaoPendente } from './painel.js';

describe('agruparTarefasPorProjeto', () => {
  it('agrupa por projeto e separa reais de fictícios, preservando ordem de chegada', () => {
    const linhas = [
      { id: 1, texto: 'Revisar layout', prazo: '2026-09-25', projeto_id: 10, projeto_titulo: 'Site A', ficticio: 0 },
      { id: 2, texto: 'Sem prazo', prazo: null, projeto_id: 10, projeto_titulo: 'Site A', ficticio: 0 },
      { id: 3, texto: 'Ajustar case', prazo: null, projeto_id: 20, projeto_titulo: 'Case fictício', ficticio: 1 },
    ];
    expect(agruparTarefasPorProjeto(linhas)).toEqual({
      reais: [
        { projeto_id: 10, projeto_titulo: 'Site A', tarefas: [
          { id: 1, texto: 'Revisar layout', prazo: '2026-09-25' },
          { id: 2, texto: 'Sem prazo', prazo: null },
        ] },
      ],
      ficticios: [
        { projeto_id: 20, projeto_titulo: 'Case fictício', tarefas: [{ id: 3, texto: 'Ajustar case', prazo: null }] },
      ],
    });
  });

  it('retorna listas vazias quando não há tarefas', () => {
    expect(agruparTarefasPorProjeto([])).toEqual({ reais: [], ficticios: [] });
  });
});

describe('montarDivulgacaoPendente', () => {
  it('mapeia o que falta divulgar', () => {
    const linhas = [
      { id: 1, titulo: 'Site A', ficticio: 0, postou_instagram: 0, portfolio_publicado: 1 },
      { id: 2, titulo: 'Case fictício', ficticio: 1, postou_instagram: 0, portfolio_publicado: 0 },
    ];
    expect(montarDivulgacaoPendente(linhas)).toEqual([
      { projeto_id: 1, titulo: 'Site A', ficticio: false, falta_portfolio: false, falta_instagram: true },
      { projeto_id: 2, titulo: 'Case fictício', ficticio: true, falta_portfolio: true, falta_instagram: true },
    ]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run server/domain/painel.test.js`
Expected: FAIL — `agruparTarefasPorProjeto`/`montarDivulgacaoPendente` não existem em `./painel.js` ainda (erro de import/`undefined is not a function`).

- [ ] **Step 3: Implementar as funções**

Em `server/domain/painel.js`, adicionar ao final do arquivo:

```js
export function agruparTarefasPorProjeto(linhas) {
  const grupos = new Map();
  for (const l of linhas) {
    if (!grupos.has(l.projeto_id)) {
      grupos.set(l.projeto_id, { projeto_id: l.projeto_id, projeto_titulo: l.projeto_titulo, ficticio: Boolean(l.ficticio), tarefas: [] });
    }
    grupos.get(l.projeto_id).tarefas.push({ id: l.id, texto: l.texto, prazo: l.prazo });
  }
  const projetos = [...grupos.values()];
  const semFicticio = ({ ficticio, ...resto }) => resto;
  return {
    reais: projetos.filter((p) => !p.ficticio).map(semFicticio),
    ficticios: projetos.filter((p) => p.ficticio).map(semFicticio),
  };
}

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

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run server/domain/painel.test.js`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add server/domain/painel.js server/domain/painel.test.js
git commit -m "feat: funcoes de dominio para tarefas por projeto e divulgacao pendente"
```

---

### Task 2: Ligar as queries em `GET /painel`

**Files:**
- Modify: `server/routes/painel.js`
- Test: `server/routes/painel.test.js`

**Interfaces:**
- Consumes: `agruparTarefasPorProjeto`, `montarDivulgacaoPendente` de `../domain/painel.js` (Task 1).
- Produces: `GET /painel` retorna `tarefas_por_projeto: { reais, ficticios }` e `divulgacao_pendente: [...]`; `proximos` deixa de incluir itens `tipo: 'tarefa'`. Consumido por `web/src/pages/Inicio.jsx` na Task 3.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar ao final de `server/routes/painel.test.js`, dentro do `describe('GET /api/painel', ...)`:

```js
  it('agrupa tarefas por projeto (com e sem prazo) e lista divulgação pendente', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const real = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site real', etapa: 'entregue' })).body;
    const ficticio = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Case fictício', etapa: 'entregue', ficticio: true })).body;
    await ctx.http.post(`/api/projetos/${real.id}/tarefas`).send({ texto: 'Com prazo', prazo: '2026-09-30' });
    await ctx.http.post(`/api/projetos/${real.id}/tarefas`).send({ texto: 'Sem prazo' });
    await ctx.http.post(`/api/projetos/${ficticio.id}/tarefas`).send({ texto: 'Tarefa do case' });
    await ctx.http.put(`/api/projetos/${real.id}`).send({ postou_instagram: true });

    const res = await ctx.http.get('/api/painel').expect(200);

    expect(res.body.tarefas_por_projeto.reais).toEqual([
      { projeto_id: real.id, projeto_titulo: 'Site real', tarefas: [
        { id: expect.any(Number), texto: 'Com prazo', prazo: '2026-09-30' },
        { id: expect.any(Number), texto: 'Sem prazo', prazo: null },
      ] },
    ]);
    expect(res.body.tarefas_por_projeto.ficticios).toEqual([
      { projeto_id: ficticio.id, projeto_titulo: 'Case fictício', tarefas: [{ id: expect.any(Number), texto: 'Tarefa do case', prazo: null }] },
    ]);
    expect(res.body.proximos.some((i) => i.tipo === 'tarefa')).toBe(false);

    expect(res.body.divulgacao_pendente).toEqual([
      { projeto_id: ficticio.id, titulo: 'Case fictício', ficticio: true, falta_portfolio: true, falta_instagram: true },
      { projeto_id: real.id, titulo: 'Site real', ficticio: false, falta_portfolio: true, falta_instagram: false },
    ]);
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run server/routes/painel.test.js`
Expected: FAIL — `res.body.tarefas_por_projeto` é `undefined`.

- [ ] **Step 3: Implementar as queries e ligar as funções**

Em `server/routes/painel.js`, trocar o import:

```js
import { montarProximos } from '../domain/painel.js';
```

por:

```js
import { montarProximos, agruparTarefasPorProjeto, montarDivulgacaoPendente } from '../domain/painel.js';
```

E dentro de `r.get('/painel', ...)`, trocar:

```js
      proximos: montarProximos(
        {
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
        },
        dia,
      ),
    });
```

por:

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
      proximos: montarProximos(
        {
          parcelas: parcelasAbertas,
          entregas,
          conteudos: todas(
            `SELECT c.* FROM conteudos c LEFT JOIN projetos p ON p.id = c.projeto_id
             WHERE c.status <> 'publicado' AND c.data_planejada IS NOT NULL AND (p.id IS NULL OR p.ficticio = 0)`,
          ),
        },
        dia,
      ),
    });
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run server/routes/painel.test.js`
Expected: PASS em todos os testes do arquivo (incluindo os dois já existentes).

- [ ] **Step 5: Commit**

```bash
git add server/routes/painel.js server/routes/painel.test.js
git commit -m "feat: painel retorna tarefas por projeto e divulgacao pendente"
```

---

### Task 3: Seções novas em `Inicio.jsx`

**Files:**
- Modify: `web/src/pages/Inicio.jsx`
- Test: `web/src/pages/Inicio.test.jsx`

**Interfaces:**
- Consumes: `GET /painel` com `tarefas_por_projeto` e `divulgacao_pendente` (Task 2).
- Produces: nada consumido por outras tasks — é a ponta final da integração.

- [ ] **Step 1: Atualizar o teste (falhando)**

Em `web/src/pages/Inicio.test.jsx`, atualizar o mock do primeiro teste pra incluir os campos novos, e adicionar as asserções:

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
          reais: [{ projeto_id: 10, projeto_titulo: 'Site A', tarefas: [{ id: 1, texto: 'Revisar', prazo: null }] }],
          ficticios: [{ projeto_id: 20, projeto_titulo: 'Case fictício', tarefas: [{ id: 2, texto: 'Ajustar', prazo: '2026-09-30' }] }],
        },
        divulgacao_pendente: [
          { projeto_id: 30, titulo: 'Loja B', ficticio: false, falta_portfolio: true, falta_instagram: false },
        ],
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
    expect(screen.getByRole('link', { name: 'Case fictício' })).toHaveAttribute('href', '/projetos/20');
    expect(screen.getByText('Ajustar')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Loja B' })).toHaveAttribute('href', '/projetos/30');
    expect(screen.getByText('Falta: Portfólio')).toBeInTheDocument();
  });

  it('mostra mensagem quando não há nada nos próximos dias, tarefas nem divulgação pendente', async () => {
    mockApi({
      'GET /painel': {
        cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
        tarefas_por_projeto: { reais: [], ficticios: [] },
        divulgacao_pendente: [],
        proximos: [],
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nada para os próximos 7 dias.')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhuma tarefa pendente.')).toHaveLength(2);
    expect(screen.queryByText(/Divulgação pendente/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run web/src/pages/Inicio.test.jsx`
Expected: FAIL — as seções/textos novos (`Falta: Portfólio`, `Nenhuma tarefa pendente.`, links de projeto das tarefas) ainda não existem em `Inicio.jsx`.

- [ ] **Step 3: Implementar as seções em `Inicio.jsx`**

Substituir o conteúdo de `web/src/pages/Inicio.jsx` por:

```jsx
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Numero } from '../components/Numero.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';

const ROTULO_ITEM = { parcela: 'Parcela', entrega: 'Entrega', conteudo: 'Conteúdo' };
const destino = (item) => (item.projeto_id ? `/projetos/${item.projeto_id}` : '/conteudo');

function rotuloFalta({ falta_portfolio, falta_instagram }) {
  if (falta_portfolio && falta_instagram) return 'Instagram e Portfólio';
  if (falta_portfolio) return 'Portfólio';
  return 'Instagram';
}

function ColunaTarefas({ titulo, projetos }) {
  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => (
            <li key={p.projeto_id} style={{ display: 'block' }}>
              <Link to={`/projetos/${p.projeto_id}`}>{p.projeto_titulo}</Link>
              <ul className="lista">
                {p.tarefas.map((t) => (
                  <li key={t.id}>
                    <span>{t.texto}</span>
                    {t.prazo && <span className="vazio">{formatarData(t.prazo)}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhuma tarefa pendente.</p>}
    </section>
  );
}

export function Inicio() {
  const { dados, erro } = useCarregar(() => api('/painel'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <p>Carregando…</p>;
  const { cartoes, tarefas_por_projeto: tarefasPorProjeto, divulgacao_pendente: divulgacaoPendente, proximos } = dados;

  return (
    <section>
      <header className="pagina__topo"><h1>Início</h1></header>
      <div className="cartoes">
        <Numero rotulo="A receber este mês">{formatarDinheiro(cartoes.a_receber_mes_centavos)}</Numero>
        <Numero rotulo="Parcelas atrasadas">
          {cartoes.atrasadas.quantidade} · {formatarDinheiro(cartoes.atrasadas.total_centavos)}
        </Numero>
        <Numero rotulo="Projetos em andamento">{cartoes.em_andamento}</Numero>
        <Numero rotulo="Propostas abertas">
          {cartoes.propostas.quantidade} · {formatarDinheiro(cartoes.propostas.total_centavos)}
        </Numero>
      </div>

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
        <ColunaTarefas titulo="Projetos reais" projetos={tarefasPorProjeto.reais} />
        <ColunaTarefas titulo="Projetos fictícios" projetos={tarefasPorProjeto.ficticios} />
      </div>

      <section className="cartao">
        <h2>Próximos 7 dias</h2>
        {proximos.length ? (
          <table className="tabela">
            <tbody>
              {proximos.map((item) => (
                <tr key={`${item.tipo}-${item.id}`}>
                  <td className={item.atrasado ? 'item-atrasado' : undefined}>
                    {formatarData(item.data)}{item.atrasado && <> · <span>atrasado</span></>}
                  </td>
                  <td><span className="etiqueta">{ROTULO_ITEM[item.tipo]}</span></td>
                  <td><Link to={destino(item)}>{item.titulo}</Link></td>
                  <td className="vazio">{item.contexto}</td>
                  <td className="num">{item.valor_centavos ? formatarDinheiro(item.valor_centavos) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="vazio">Nada para os próximos 7 dias.</p>}
      </section>
    </section>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run web/src/pages/Inicio.test.jsx`
Expected: PASS em ambos os testes.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Inicio.jsx web/src/pages/Inicio.test.jsx
git commit -m "feat: mostra tarefas por projeto e divulgacao pendente no inicio"
```

---

### Task 4: Verificação final

**Files:** nenhum (só execução).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os arquivos de teste passam, sem regressões.

- [ ] **Step 2: Conferir manualmente (se o dev server estiver disponível)**

Abrir a Início. Confirmar: tarefa sem prazo aparece na coluna certa (real/fictício); um projeto entregue sem `postou_instagram` ou sem portfólio publicado aparece em "Divulgação pendente" com o texto certo; "Próximos 7 dias" não mostra mais tarefas.
