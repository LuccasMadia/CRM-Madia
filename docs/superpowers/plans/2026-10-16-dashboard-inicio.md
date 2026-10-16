# Dashboard na Início — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a Início num dashboard com 4 gráficos (funil, faturamento por serviço, origem dos clientes, recebido por mês) alimentados por uma rota nova `GET /api/painel/graficos`.

**Architecture:** Servidor: contas como funções puras em `server/domain/graficos.js`, chamadas por uma rota nova em `server/routes/painel.js`. Web: componentes em `web/src/components/graficos/` — funil em SVG próprio e três gráficos Recharts (carregados com `React.lazy` só na Início) — montados por `Inicio.jsx`, que busca `/painel` e `/painel/graficos` separadamente.

**Tech Stack:** Node 24 (`node:sqlite`), Express 5, React 19, Recharts, Vitest 5 (+ supertest; Testing Library + jsdom).

**Spec:** `docs/superpowers/specs/2026-10-16-tema-escuro-e-dashboard-design.md` (Partes 2 e 3).

## Pré-requisitos e execução em vários terminais

Este plano depende de dois outros:
- **Tema** — `docs/superpowers/plans/2026-10-16-tema-escuro.md` (tokens `--t1…`, `.cartao-numero`, `Numero` com `icone`).
- **Perfil por serviço** — `docs/superpowers/plans/2026-10-15-perfil-cliente-por-servico.md`: Task 1 (coluna `projetos.servico`), Task 9 (`ROTULO_SERVICO` em `web/src/lib/rotulos.js`) e Task 15 (seção "Para entregar" em `Inicio.jsx`).

Cada terminal trabalha na **sua própria worktree/branch** (skill `superpowers:using-git-worktrees`), e as branches são juntadas no `main` na ordem abaixo.

| Task | Depende de | Pode começar |
|---|---|---|
| 1 — Funções puras do servidor | nada | **já** |
| 2 — Rota `/painel/graficos` | Task 1 + Perfil Task 1 no `main` | depois do merge delas |
| 3 — `Funil` e `CartaoGrafico` | Tema no `main` | depois do merge do Tema |
| 4 — Gráficos Recharts | Tema no `main` | depois do merge do Tema (paralelo à 3) |
| 5 — Início montada | Tasks 2, 3, 4 + Perfil Tasks 9 e 15 no `main` | por último |
| 6 — Conferência visual | Task 5 | por último |

Sugestão: **terminal A** = Tasks 1 → 2; **terminal B** = Tasks 3 e 4; Tasks 5 e 6 num só terminal no fim. Tasks 3 e 4 mexem em `styles.css` em pontos diferentes (blocos novos no fim do arquivo) — em caso de conflito no merge, manter os dois blocos.

## Global Constraints

- Projetos com `ficticio = 1` ficam fora de **todos** os gráficos.
- Etapas do funil, nesta ordem: `contato`, `proposta`, `andamento`, `entregue`; contagem **cumulativa**; `perdido` conta só em `contato` e em `perdidos`; só `servico = 'site_sistema'`.
- Recebido por mês: sempre **6** itens (`AAAA-MM`), do mais antigo ao mês atual, por mês de `pago_em`.
- Origens: agrupar ignorando maiúsculas e espaços nas pontas; vazio/nulo → `"Não informado"`; 4 maiores + `"Outros"` (só se houver resto).
- Por serviço: parcelas pagas nos últimos **12** meses (mês atual + 11), sempre os 3 serviços na ordem `site_sistema`, `google_meu_negocio`, `placas_nfc`.
- Títulos e subtítulos exatos: "Funil de oportunidades" (sub "sites e sistemas"), "Faturamento por serviço" (sub "últimos 12 meses"), "De onde vêm os clientes", "Recebido por mês" (sub "últimos 6 meses"); estado vazio "Ainda sem dados".
- Cores dos gráficos espelham os tokens do tema (`#5eead4 #2dd4bf #14b8a6 #0d9488 #0f766e`).
- Recharts só é carregado na Início (`React.lazy`).
- Commits em Conventional Commits, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Testes: `npx vitest run <arquivo>` na raiz. Depois de mexer no servidor, o app real só reflete após `pm2 restart crm-madia-api`; depois de instalar dependência, `pm2 restart crm-madia-web`.

## Review Focus

1. **Banco vazio** (instalação nova, nenhum cliente/projeto/parcela): a Início abre sem erro e os 4 cards mostram "Ainda sem dados" — testes nas Tasks 1 e 5.
2. **Parcela paga com `pago_em` no futuro ou há mais de 12 meses** não entra em nenhum gráfico nem quebra a soma — teste na Task 1.
3. **Erro em `/painel/graficos`** não esconde cartões, tarefas nem próximos 7 dias — teste na Task 5.
4. **Mais de 5 origens** gera no máximo 5 fatias (4 + "Outros") e a legenda soma 100% aproximado sem fatia vazia — teste na Task 1 (servidor) e Task 4 (percentuais da legenda).
5. **Funil só com perdidos** (todos os sites perdidos): contato > 0, demais etapas 0, faixa de baixo ainda visível com largura mínima e sem divisão por zero — testes nas Tasks 1 e 3.

---

## Mapa de arquivos

**Servidor**
- Create `server/domain/graficos.js` — `montarFunil`, `recebidoPorMes`, `agruparOrigens`, `faturamentoPorServico`, `ultimosMeses`.
- Create `server/domain/graficos.test.js`.
- Modify `server/routes/painel.js` — rota `GET /painel/graficos`.
- Modify `server/routes/painel.test.js`.

**Web**
- Create `web/src/components/graficos/tema.js` — cores e estilos compartilhados dos gráficos.
- Create `web/src/components/graficos/CartaoGrafico.jsx`, `Funil.jsx` (+ `Funil.test.jsx`, `CartaoGrafico.test.jsx`).
- Create `web/src/components/graficos/GraficoLinha.jsx`, `GraficoRosca.jsx`, `GraficoBarras.jsx` (+ `GraficoRosca.test.jsx`).
- Create `web/src/test/mockRecharts.js` — versão falsa do Recharts para o jsdom.
- Modify `web/src/styles.css` — blocos novos no fim (Tasks 3 e 4).
- Modify `web/src/pages/Inicio.jsx`, `web/src/pages/Inicio.test.jsx`.
- Modify `package.json`/`package-lock.json` — `recharts`.

---

### Task 1: Funções puras dos gráficos (servidor)

**Files:**
- Create: `server/domain/graficos.js`
- Test: `server/domain/graficos.test.js`

**Interfaces:**
- Consumes: `somarMeses(iso, meses)` e `mesDe(iso)` de `server/domain/datas.js` (já existem).
- Produces:
  - `ultimosMeses(hoje: 'AAAA-MM-DD', n: number): string[]` — `n` meses `AAAA-MM`, do mais antigo ao de `hoje`.
  - `montarFunil(projetos: {etapa, servico}[]): { etapas: {etapa, quantidade, percentual}[], perdidos: number }`
  - `recebidoPorMes(parcelas: {valor_centavos, pago_em}[], hoje): {mes, total_centavos}[]` (6 itens)
  - `agruparOrigens(clientes: {origem}[]): { total: number, fatias: {nome, quantidade}[] }`
  - `faturamentoPorServico(parcelas: {valor_centavos, pago_em, servico}[], hoje): {servico, total_centavos}[]` (3 itens)
  - As funções **não** filtram fictícios: quem chama (Task 2) passa só linhas reais.

- [ ] **Step 1: Escrever os testes que falham**

Criar `server/domain/graficos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ultimosMeses, montarFunil, recebidoPorMes, agruparOrigens, faturamentoPorServico } from './graficos.js';

const site = (etapa) => ({ etapa, servico: 'site_sistema' });

describe('ultimosMeses', () => {
  it('conta para trás a partir do mês de hoje, atravessando o ano', () => {
    expect(ultimosMeses('2027-02-10', 6)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('montarFunil', () => {
  it('conta cumulativo: cada projeto entra em todas as etapas até a dele', () => {
    const r = montarFunil([site('contato'), site('proposta'), site('andamento'), site('entregue'), site('entregue')]);
    expect(r.etapas).toEqual([
      { etapa: 'contato', quantidade: 5, percentual: 100 },
      { etapa: 'proposta', quantidade: 4, percentual: 80 },
      { etapa: 'andamento', quantidade: 3, percentual: 60 },
      { etapa: 'entregue', quantidade: 2, percentual: 40 },
    ]);
    expect(r.perdidos).toBe(0);
  });

  it('perdido conta só em contato e em perdidos', () => {
    const r = montarFunil([site('perdido'), site('proposta')]);
    expect(r.etapas.map((e) => e.quantidade)).toEqual([2, 1, 0, 0]);
    expect(r.perdidos).toBe(1);
  });

  it('só com perdidos não divide por zero', () => {
    const r = montarFunil([site('perdido'), site('perdido')]);
    expect(r.etapas.map((e) => e.quantidade)).toEqual([2, 0, 0, 0]);
    expect(r.etapas.map((e) => e.percentual)).toEqual([100, 0, 0, 0]);
  });

  it('sem projetos fica tudo zero', () => {
    const r = montarFunil([]);
    expect(r.etapas.map((e) => [e.quantidade, e.percentual])).toEqual([[0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(r.perdidos).toBe(0);
  });

  it('ignora GMN e placas', () => {
    const r = montarFunil([
      site('entregue'),
      { etapa: 'entregue', servico: 'google_meu_negocio' },
      { etapa: 'andamento', servico: 'placas_nfc' },
    ]);
    expect(r.etapas[0].quantidade).toBe(1);
  });

  it('arredonda o percentual', () => {
    const r = montarFunil([site('contato'), site('contato'), site('proposta')]);
    expect(r.etapas[1].percentual).toBe(33);
  });
});

describe('recebidoPorMes', () => {
  it('soma por mês de pagamento, com zeros nos meses vazios', () => {
    const r = recebidoPorMes([
      { valor_centavos: 1000, pago_em: '2026-10-05' },
      { valor_centavos: 500, pago_em: '2026-10-20' },
      { valor_centavos: 300, pago_em: '2026-07-01' },
      { valor_centavos: 999, pago_em: null },
      { valor_centavos: 777, pago_em: '2026-04-30' },
      { valor_centavos: 888, pago_em: '2026-11-02' },
    ], '2026-10-16');
    expect(r).toEqual([
      { mes: '2026-05', total_centavos: 0 },
      { mes: '2026-06', total_centavos: 0 },
      { mes: '2026-07', total_centavos: 300 },
      { mes: '2026-08', total_centavos: 0 },
      { mes: '2026-09', total_centavos: 0 },
      { mes: '2026-10', total_centavos: 1500 },
    ]);
  });
});

describe('agruparOrigens', () => {
  it('agrupa ignorando maiúsculas e espaços e usa a grafia mais comum', () => {
    const r = agruparOrigens([
      { origem: 'Instagram' }, { origem: ' instagram ' }, { origem: 'Instagram' },
      { origem: '' }, { origem: null }, { origem: 'Indicação' },
    ]);
    expect(r).toEqual({
      total: 6,
      fatias: [
        { nome: 'Instagram', quantidade: 3 },
        { nome: 'Não informado', quantidade: 2 },
        { nome: 'Indicação', quantidade: 1 },
      ],
    });
  });

  it('mantém as 4 maiores e junta o resto em Outros', () => {
    const origens = ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'E', 'F'];
    const r = agruparOrigens(origens.map((origem) => ({ origem })));
    expect(r.total).toBe(16);
    expect(r.fatias).toEqual([
      { nome: 'A', quantidade: 5 },
      { nome: 'B', quantidade: 4 },
      { nome: 'C', quantidade: 3 },
      { nome: 'D', quantidade: 2 },
      { nome: 'Outros', quantidade: 2 },
    ]);
  });

  it('sem clientes devolve total zero e nenhuma fatia', () => {
    expect(agruparOrigens([])).toEqual({ total: 0, fatias: [] });
  });
});

describe('faturamentoPorServico', () => {
  it('soma parcelas pagas dos últimos 12 meses por serviço, sempre com os 3', () => {
    const r = faturamentoPorServico([
      { valor_centavos: 1000, pago_em: '2026-10-01', servico: 'site_sistema' },
      { valor_centavos: 2000, pago_em: '2025-11-01', servico: 'site_sistema' },
      { valor_centavos: 4000, pago_em: '2025-10-31', servico: 'site_sistema' },
      { valor_centavos: 500, pago_em: '2026-03-10', servico: 'google_meu_negocio' },
      { valor_centavos: 900, pago_em: null, servico: 'placas_nfc' },
      { valor_centavos: 700, pago_em: '2026-12-01', servico: 'placas_nfc' },
    ], '2026-10-16');
    expect(r).toEqual([
      { servico: 'site_sistema', total_centavos: 3000 },
      { servico: 'google_meu_negocio', total_centavos: 500 },
      { servico: 'placas_nfc', total_centavos: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/domain/graficos.test.js`
Expected: FAIL — `Failed to resolve import "./graficos.js"`.

- [ ] **Step 3: Implementar**

Criar `server/domain/graficos.js`:

```js
import { somarMeses, mesDe } from './datas.js';

export const ETAPAS_FUNIL = ['contato', 'proposta', 'andamento', 'entregue'];
export const SERVICOS_GRAFICO = ['site_sistema', 'google_meu_negocio', 'placas_nfc'];
const NAO_INFORMADO = 'Não informado';
const MAX_FATIAS = 4;

export function ultimosMeses(hoje, n) {
  const primeiroDia = `${mesDe(hoje)}-01`;
  return Array.from({ length: n }, (_, i) => mesDe(somarMeses(primeiroDia, i - (n - 1))));
}

export function montarFunil(projetos) {
  const sites = projetos.filter((p) => p.servico === 'site_sistema');
  // Até que etapa o projeto chegou; perdido só conta como contato.
  const alcance = (p) => (p.etapa === 'perdido' ? 0 : ETAPAS_FUNIL.indexOf(p.etapa));
  const contato = sites.length;
  const etapas = ETAPAS_FUNIL.map((etapa, i) => {
    const quantidade = sites.filter((p) => alcance(p) >= i).length;
    return { etapa, quantidade, percentual: contato ? Math.round((quantidade / contato) * 100) : 0 };
  });
  return { etapas, perdidos: sites.filter((p) => p.etapa === 'perdido').length };
}

function somarPagasPorMes(parcelas, meses, chave = () => '') {
  const janela = new Set(meses);
  const totais = new Map();
  for (const p of parcelas) {
    if (!p.pago_em || !janela.has(mesDe(p.pago_em))) continue;
    const k = `${chave(p)}|${mesDe(p.pago_em)}`;
    totais.set(k, (totais.get(k) ?? 0) + p.valor_centavos);
  }
  return totais;
}

export function recebidoPorMes(parcelas, hoje) {
  const meses = ultimosMeses(hoje, 6);
  const totais = somarPagasPorMes(parcelas, meses);
  return meses.map((mes) => ({ mes, total_centavos: totais.get(`|${mes}`) ?? 0 }));
}

export function faturamentoPorServico(parcelas, hoje) {
  const meses = ultimosMeses(hoje, 12);
  const totais = somarPagasPorMes(parcelas, meses, (p) => p.servico);
  return SERVICOS_GRAFICO.map((servico) => ({
    servico,
    total_centavos: meses.reduce((soma, mes) => soma + (totais.get(`${servico}|${mes}`) ?? 0), 0),
  }));
}

const grafiaMaisComum = (grafias) =>
  [...grafias].sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b, 'pt-BR'))[0][0];

export function agruparOrigens(clientes) {
  const grupos = new Map();
  for (const c of clientes) {
    const texto = (c.origem ?? '').trim();
    const chave = texto.toLowerCase();
    const nome = texto || NAO_INFORMADO;
    const grupo = grupos.get(chave) ?? { quantidade: 0, grafias: new Map() };
    grupo.quantidade += 1;
    grupo.grafias.set(nome, (grupo.grafias.get(nome) ?? 0) + 1);
    grupos.set(chave, grupo);
  }
  const fatias = [...grupos.values()]
    .map((g) => ({ nome: grafiaMaisComum(g.grafias), quantidade: g.quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
  const resto = fatias.slice(MAX_FATIAS).reduce((soma, f) => soma + f.quantidade, 0);
  const principais = fatias.slice(0, MAX_FATIAS);
  return { total: clientes.length, fatias: resto ? [...principais, { nome: 'Outros', quantidade: resto }] : principais };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/domain/graficos.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add server/domain/graficos.js server/domain/graficos.test.js
git commit -m "feat: contas dos graficos do painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rota `GET /api/painel/graficos`

**Pré-requisito:** Task 1 e a Task 1 do plano do perfil (coluna `projetos.servico`) já no `main`.

**Files:**
- Modify: `server/routes/painel.js`
- Test: `server/routes/painel.test.js`

**Interfaces:**
- Consumes: funções da Task 1; `projetos.servico` (Perfil Task 1); helper `todas(sql)` já existente em `rotasPainel`.
- Produces: `GET /api/painel/graficos` → `{ funil, recebido_por_mes, origens, por_servico }` no formato da Task 1.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `server/routes/painel.test.js` (fora do `describe` existente):

```js
describe('GET /api/painel/graficos', () => {
  function novoProjeto(ctx, { clienteId, titulo, etapa, servico = 'site_sistema', ficticio = 0 }) {
    return ctx.db.prepare(
      `INSERT INTO projetos (cliente_id, titulo, etapa, servico, ficticio, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    ).run(clienteId, titulo, etapa, servico, ficticio).lastInsertRowid;
  }
  function parcelaPaga(ctx, projetoId, valor, pagoEm) {
    ctx.db.prepare(
      `INSERT INTO parcelas (projeto_id, valor_centavos, vencimento, pago_em, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    ).run(projetoId, valor, pagoEm, pagoEm);
  }

  it('monta os 4 gráficos sem fictícios', async () => {
    const ctx = criarContexto({ hoje: '2026-10-16' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana', origem: 'Instagram' })).body;
    await ctx.http.post('/api/clientes').send({ nome: 'Bruno', origem: ' instagram ' });
    await ctx.http.post('/api/clientes').send({ nome: 'Davi', origem: 'Instagram' });
    await ctx.http.post('/api/clientes').send({ nome: 'Caio' });

    const entregue = novoProjeto(ctx, { clienteId: ana.id, titulo: 'Site', etapa: 'entregue' });
    novoProjeto(ctx, { clienteId: ana.id, titulo: 'Proposta', etapa: 'proposta' });
    novoProjeto(ctx, { clienteId: ana.id, titulo: 'Perdido', etapa: 'perdido' });
    const ficticio = novoProjeto(ctx, { clienteId: ana.id, titulo: 'Case', etapa: 'entregue', ficticio: 1 });
    const gmn = novoProjeto(ctx, { clienteId: ana.id, titulo: 'GMN', etapa: 'entregue', servico: 'google_meu_negocio' });

    parcelaPaga(ctx, entregue, 100000, '2026-10-05');
    parcelaPaga(ctx, entregue, 50000, '2026-04-10');
    parcelaPaga(ctx, ficticio, 999900, '2026-10-01');
    parcelaPaga(ctx, gmn, 20000, '2026-09-12');

    const res = await ctx.http.get('/api/painel/graficos').expect(200);
    expect(res.body.funil).toEqual({
      etapas: [
        { etapa: 'contato', quantidade: 3, percentual: 100 },
        { etapa: 'proposta', quantidade: 2, percentual: 67 },
        { etapa: 'andamento', quantidade: 1, percentual: 33 },
        { etapa: 'entregue', quantidade: 1, percentual: 33 },
      ],
      perdidos: 1,
    });
    expect(res.body.recebido_por_mes.map((m) => m.total_centavos)).toEqual([0, 0, 0, 0, 20000, 100000]);
    expect(res.body.recebido_por_mes[5].mes).toBe('2026-10');
    expect(res.body.origens).toEqual({
      total: 4,
      fatias: [{ nome: 'Instagram', quantidade: 3 }, { nome: 'Não informado', quantidade: 1 }],
    });
    expect(res.body.por_servico).toEqual([
      { servico: 'site_sistema', total_centavos: 150000 },
      { servico: 'google_meu_negocio', total_centavos: 20000 },
      { servico: 'placas_nfc', total_centavos: 0 },
    ]);
  });

  it('com banco vazio devolve tudo zerado', async () => {
    const ctx = criarContexto({ hoje: '2026-10-16' });
    const res = await ctx.http.get('/api/painel/graficos').expect(200);
    expect(res.body.funil.etapas.every((e) => e.quantidade === 0)).toBe(true);
    expect(res.body.recebido_por_mes).toHaveLength(6);
    expect(res.body.origens).toEqual({ total: 0, fatias: [] });
    expect(res.body.por_servico.every((s) => s.total_centavos === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/routes/painel.test.js`
Expected: os 2 testes novos FALHAM com 404; os antigos passam.

- [ ] **Step 3: Implementar a rota**

Em `server/routes/painel.js`, acrescentar ao import:

```js
import { montarFunil, recebidoPorMes, agruparOrigens, faturamentoPorServico } from '../domain/graficos.js';
```

E, dentro de `rotasPainel`, logo antes de `return r;`:

```js
  r.get('/painel/graficos', (req, res) => {
    const dia = hoje();
    const pagas = todas(
      `SELECT pa.valor_centavos, pa.pago_em, p.servico FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NOT NULL AND p.ficticio = 0`,
    );
    res.json({
      funil: montarFunil(todas('SELECT etapa, servico FROM projetos WHERE ficticio = 0')),
      recebido_por_mes: recebidoPorMes(pagas, dia),
      origens: agruparOrigens(todas('SELECT origem FROM clientes')),
      por_servico: faturamentoPorServico(pagas, dia),
    });
  });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/routes/painel.test.js server/domain/graficos.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/painel.js server/routes/painel.test.js
git commit -m "feat: rota com os dados dos graficos da inicio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `CartaoGrafico` e `Funil` em SVG

**Pré-requisito:** plano do Tema no `main`.

**Files:**
- Create: `web/src/components/graficos/tema.js`
- Create: `web/src/components/graficos/CartaoGrafico.jsx`, `web/src/components/graficos/CartaoGrafico.test.jsx`
- Create: `web/src/components/graficos/Funil.jsx`, `web/src/components/graficos/Funil.test.jsx`
- Modify: `web/src/styles.css` (bloco novo no fim, **antes** do `@media (max-width: 760px)`)

**Interfaces:**
- Consumes: `ROTULO_ETAPA` de `web/src/lib/rotulos.js` (existente).
- Produces:
  - `tema.js`: `ESCALA: string[5]`, `COR_GRADE`, `COR_EIXO`, `COR_TEXTO`, `COR_CARTAO`, `TOOLTIP`, `EIXO`, `milhares(centavos): string` — usados pela Task 4.
  - `CartaoGrafico({ titulo, subtitulo?, vazio?, children })`.
  - `Funil({ etapas: {etapa, quantidade, percentual}[], perdidos: number })`.
  - Classes CSS `.grade-graficos`, `.cartao-grafico__topo`, `.cartao-grafico__sub`, `.funil__*`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `web/src/components/graficos/CartaoGrafico.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartaoGrafico } from './CartaoGrafico.jsx';

describe('CartaoGrafico', () => {
  it('mostra título, subtítulo e o conteúdo', () => {
    render(<CartaoGrafico titulo="Recebido por mês" subtitulo="últimos 6 meses"><p>grafico</p></CartaoGrafico>);
    expect(screen.getByRole('heading', { name: 'Recebido por mês' })).toBeInTheDocument();
    expect(screen.getByText('últimos 6 meses')).toBeInTheDocument();
    expect(screen.getByText('grafico')).toBeInTheDocument();
  });

  it('vazio troca o conteúdo por "Ainda sem dados"', () => {
    render(<CartaoGrafico titulo="Funil" vazio><p>grafico</p></CartaoGrafico>);
    expect(screen.getByText('Ainda sem dados')).toBeInTheDocument();
    expect(screen.queryByText('grafico')).not.toBeInTheDocument();
  });
});
```

Criar `web/src/components/graficos/Funil.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Funil } from './Funil.jsx';

const etapas = [
  { etapa: 'contato', quantidade: 24, percentual: 100 },
  { etapa: 'proposta', quantidade: 12, percentual: 50 },
  { etapa: 'andamento', quantidade: 7, percentual: 29 },
  { etapa: 'entregue', quantidade: 5, percentual: 21 },
];

describe('Funil', () => {
  it('mostra quantidade, nome e percentual de cada etapa', () => {
    render(<Funil etapas={etapas} perdidos={0} />);
    expect(screen.getByRole('img', { name: 'Funil de oportunidades' })).toBeInTheDocument();
    for (const texto of ['24', '12', '7', '5', 'Contato', 'Proposta enviada', 'Em andamento', 'Entregue', '100%', '50%', '29%', '21%']) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
    expect(screen.queryByText(/perdido/)).not.toBeInTheDocument();
  });

  it('mostra os perdidos no singular e no plural', () => {
    const { rerender } = render(<Funil etapas={etapas} perdidos={1} />);
    expect(screen.getByText('1 perdido')).toBeInTheDocument();
    rerender(<Funil etapas={etapas} perdidos={3} />);
    expect(screen.getByText('3 perdidos')).toBeInTheDocument();
  });

  it('com etapas zeradas ainda desenha as 4 faixas', () => {
    const zeradas = etapas.map((e, i) => ({ ...e, quantidade: i === 0 ? 2 : 0, percentual: i === 0 ? 100 : 0 }));
    const { container } = render(<Funil etapas={zeradas} perdidos={2} />);
    const faixas = container.querySelectorAll('path');
    expect(faixas).toHaveLength(4);
    for (const f of faixas) expect(f.getAttribute('d')).not.toMatch(/NaN/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run web/src/components/graficos`
Expected: FAIL — imports não resolvem.

- [ ] **Step 3: Criar `tema.js`**

`web/src/components/graficos/tema.js`:

```js
// Cores dos gráficos: espelham os tokens de styles.css (--t1…--t5, --borda, --texto-suave,
// --texto, --superficie, --superficie-2). Ficam em hex porque o Recharts recebe cor como atributo SVG.
export const ESCALA = ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'];
export const COR_GRADE = '#24262a';
export const COR_EIXO = '#8b9099';
export const COR_TEXTO = '#ececee';
export const COR_CARTAO = '#141517';

export const TOOLTIP = {
  contentStyle: { background: '#1c1e21', border: `1px solid ${COR_GRADE}`, borderRadius: 10, color: COR_TEXTO },
  itemStyle: { color: COR_TEXTO },
  labelStyle: { color: COR_EIXO },
};

export const EIXO = { stroke: COR_EIXO, fontSize: 11, tickLine: false, axisLine: false };

// 1234500 centavos → "12,3k"; abaixo de mil reais, o valor inteiro.
export function milhares(centavos) {
  const reais = centavos / 100;
  if (reais < 1000) return String(Math.round(reais));
  return `${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
}
```

- [ ] **Step 4: Criar `CartaoGrafico.jsx`**

```jsx
export function CartaoGrafico({ titulo, subtitulo, vazio = false, children }) {
  return (
    <section className="cartao cartao-grafico">
      <header className="cartao-grafico__topo">
        <h2>{titulo}</h2>
        {subtitulo && <span className="cartao-grafico__sub">{subtitulo}</span>}
      </header>
      {vazio ? <p className="vazio">Ainda sem dados</p> : children}
    </section>
  );
}
```

- [ ] **Step 5: Criar `Funil.jsx`**

```jsx
import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { ESCALA } from './tema.js';

const LARGURA = 340;
const AREA = 200; // largura máxima das faixas; o resto é para nome e percentual
const MINIMO = 64; // faixa mais estreita, para o número caber
const ALTURA = 38;
const ESPACO = 6;

export function Funil({ etapas, perdidos }) {
  const topo = Math.max(etapas[0]?.quantidade ?? 0, 1);
  const largura = (q) => MINIMO + (AREA - MINIMO) * (q / topo);
  const centro = AREA / 2;
  const alturaTotal = etapas.length * (ALTURA + ESPACO) - ESPACO;

  return (
    <div className="funil">
      <svg viewBox={`0 0 ${LARGURA} ${alturaTotal}`} width="100%" role="img" aria-label="Funil de oportunidades">
        {etapas.map((e, i) => {
          const y = i * (ALTURA + ESPACO);
          const cima = largura(e.quantidade);
          const baixo = i + 1 < etapas.length ? largura(etapas[i + 1].quantidade) : cima * 0.85;
          const d = `M${centro - cima / 2} ${y} H${centro + cima / 2} L${centro + baixo / 2} ${y + ALTURA} H${centro - baixo / 2} Z`;
          return (
            <g key={e.etapa}>
              <title>{`${ROTULO_ETAPA[e.etapa]}: ${e.quantidade}`}</title>
              <path d={d} fill={ESCALA[i]} />
              <text x={centro} y={y + ALTURA / 2 + 5} textAnchor="middle" className="funil__quantidade">{e.quantidade}</text>
              <text x={AREA + 16} y={y + 16} className="funil__nome">{ROTULO_ETAPA[e.etapa]}</text>
              <text x={AREA + 16} y={y + 32} className="funil__percentual">{`${e.percentual}%`}</text>
            </g>
          );
        })}
      </svg>
      {perdidos > 0 && <p className="funil__perdidos">{`${perdidos} ${perdidos === 1 ? 'perdido' : 'perdidos'}`}</p>}
    </div>
  );
}
```

- [ ] **Step 6: CSS dos cartões de gráfico e do funil**

Em `web/src/styles.css`, logo **antes** da linha `@media (max-width: 760px) {`, acrescentar:

```css
.grade-graficos { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.cartao-grafico__topo { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.cartao-grafico__topo h2 { margin: 0; }
.cartao-grafico__sub { color: var(--texto-suave); font-size: 0.8rem; }
.funil svg { display: block; max-width: 420px; }
.funil__quantidade { fill: var(--primaria-texto); font-weight: 700; font-size: 14px; }
.funil__nome { fill: var(--texto); font-size: 13px; }
.funil__percentual { fill: var(--texto-suave); font-size: 11px; }
.funil__perdidos { margin: 10px 0 0; color: var(--texto-suave); font-size: 0.85rem; }
@media (max-width: 900px) { .grade-graficos { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run web/src/components/graficos`
Expected: PASS (5 testes).

- [ ] **Step 8: Commit**

```bash
git add web/src/components/graficos/tema.js web/src/components/graficos/CartaoGrafico.jsx web/src/components/graficos/CartaoGrafico.test.jsx web/src/components/graficos/Funil.jsx web/src/components/graficos/Funil.test.jsx web/src/styles.css
git commit -m "feat: cartao de grafico e funil em svg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gráficos Recharts (linha, rosca, barras)

**Pré-requisito:** plano do Tema no `main`. Se rodar em paralelo à Task 3 e `tema.js` ainda não existir na sua branch, crie-o com o conteúdo **exato** do Step 3 da Task 3 (no merge os arquivos serão idênticos).

**Files:**
- Modify: `package.json`, `package-lock.json` (`recharts`)
- Create: `web/src/test/mockRecharts.js`
- Create: `web/src/components/graficos/GraficoLinha.jsx`, `GraficoRosca.jsx`, `GraficoBarras.jsx`
- Create: `web/src/components/graficos/GraficoRosca.test.jsx`
- Modify: `web/src/styles.css` (bloco novo antes do `@media (max-width: 760px)`)

**Interfaces:**
- Consumes: `tema.js` (Task 3); `formatarDinheiro` de `web/src/lib/dinheiro.js`.
- Produces (exports nomeados, usados via `React.lazy` na Task 5):
  - `GraficoLinha({ dados: {rotulo: string, valor_centavos: number}[] })`
  - `GraficoBarras({ dados: {rotulo: string, valor_centavos: number}[] })`
  - `GraficoRosca({ fatias: {nome, quantidade}[], total: number })`
  - `rechartsFalso` em `web/src/test/mockRecharts.js` (para `vi.mock('recharts', …)`).

- [ ] **Step 1: Instalar o Recharts**

Run: `npm install recharts`
Expected: `recharts` em `dependencies` do `package.json`.

- [ ] **Step 2: Criar o Recharts falso para testes**

`web/src/test/mockRecharts.js`:

```js
import { createElement } from 'react';

// O jsdom não mede tamanho, então o Recharts real não desenha nada nos testes.
// Uso: vi.mock('recharts', async () => (await import('<caminho>/test/mockRecharts.js')).rechartsFalso);
const Caixa = ({ children }) => createElement('div', null, children);
const Nada = () => null;

export const rechartsFalso = {
  ResponsiveContainer: Caixa,
  AreaChart: Caixa,
  BarChart: Caixa,
  PieChart: Caixa,
  Pie: Caixa,
  Bar: Caixa,
  Area: Nada,
  Cell: Nada,
  CartesianGrid: Nada,
  XAxis: Nada,
  YAxis: Nada,
  Tooltip: Nada,
  LabelList: Nada,
};
```

- [ ] **Step 3: Escrever o teste que falha**

`web/src/components/graficos/GraficoRosca.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraficoRosca } from './GraficoRosca.jsx';

vi.mock('recharts', async () => (await import('../../test/mockRecharts.js')).rechartsFalso);

describe('GraficoRosca', () => {
  it('mostra o total no centro e a legenda com percentuais', () => {
    render(<GraficoRosca total={8} fatias={[
      { nome: 'Instagram', quantidade: 5 },
      { nome: 'Indicação', quantidade: 2 },
      { nome: 'Não informado', quantidade: 1 },
    ]} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('clientes')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('13%')).toBeInTheDocument();
  });

  it('um cliente só usa o singular', () => {
    render(<GraficoRosca total={1} fatias={[{ nome: 'Google', quantidade: 1 }]} />);
    expect(screen.getByText('cliente')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run web/src/components/graficos/GraficoRosca.test.jsx`
Expected: FAIL — `./GraficoRosca.jsx` não existe.

- [ ] **Step 4: Criar `GraficoRosca.jsx`**

```jsx
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { ESCALA, TOOLTIP } from './tema.js';

const TAMANHO = 160;

export function GraficoRosca({ fatias, total }) {
  const percentual = (q) => `${Math.round((q / total) * 100)}%`;
  return (
    <div className="rosca">
      <div className="rosca__grafico">
        <PieChart width={TAMANHO} height={TAMANHO}>
          <Tooltip {...TOOLTIP} formatter={(v, nome) => [`${v} ${v === 1 ? 'cliente' : 'clientes'}`, nome]} />
          <Pie data={fatias} dataKey="quantidade" nameKey="nome" innerRadius={50} outerRadius={74} paddingAngle={2} stroke="none">
            {fatias.map((f, i) => <Cell key={f.nome} fill={ESCALA[i % ESCALA.length]} />)}
          </Pie>
        </PieChart>
        <div className="rosca__centro">
          <strong>{total}</strong>
          <span>{total === 1 ? 'cliente' : 'clientes'}</span>
        </div>
      </div>
      <ul className="rosca__legenda">
        {fatias.map((f, i) => (
          <li key={f.nome}>
            <span className="rosca__ponto" style={{ background: ESCALA[i % ESCALA.length] }} />
            <span>{f.nome}</span>
            <b>{percentual(f.quantidade)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run web/src/components/graficos/GraficoRosca.test.jsx`
Expected: PASS.

- [ ] **Step 6: Criar `GraficoLinha.jsx`**

```jsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { COR_CARTAO, COR_GRADE, ESCALA, EIXO, TOOLTIP, milhares } from './tema.js';

export function GraficoLinha({ dados }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={dados} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grafico-linha-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ESCALA[1]} stopOpacity={0.35} />
            <stop offset="1" stopColor={ESCALA[1]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COR_GRADE} vertical={false} />
        <XAxis dataKey="rotulo" {...EIXO} />
        <YAxis {...EIXO} width={44} tickFormatter={milhares} />
        <Tooltip {...TOOLTIP} formatter={(v) => [formatarDinheiro(v), 'Recebido']} />
        <Area
          type="monotone"
          dataKey="valor_centavos"
          stroke={ESCALA[1]}
          strokeWidth={2.5}
          fill="url(#grafico-linha-area)"
          dot={{ r: 4, fill: ESCALA[3], stroke: COR_CARTAO, strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 7: Criar `GraficoBarras.jsx`**

```jsx
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { COR_GRADE, COR_TEXTO, ESCALA, EIXO, TOOLTIP, milhares } from './tema.js';

export function GraficoBarras({ dados }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COR_GRADE} vertical={false} />
        <XAxis dataKey="rotulo" {...EIXO} />
        <YAxis {...EIXO} width={44} tickFormatter={milhares} />
        <Tooltip {...TOOLTIP} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} formatter={(v) => [formatarDinheiro(v), 'Recebido']} />
        <Bar dataKey="valor_centavos" radius={[8, 8, 0, 0]} maxBarSize={64}>
          {dados.map((d, i) => <Cell key={d.rotulo} fill={ESCALA[(i + 1) % ESCALA.length]} />)}
          <LabelList dataKey="valor_centavos" position="top" fill={COR_TEXTO} fontSize={11} formatter={milhares} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 8: CSS da rosca**

Em `web/src/styles.css`, logo **antes** da linha `@media (max-width: 760px) {`, acrescentar:

```css
.rosca { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.rosca__grafico { position: relative; width: 160px; height: 160px; flex: none; }
.rosca__centro { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; }
.rosca__centro strong { font-size: 1.5rem; font-weight: 700; }
.rosca__centro span { color: var(--texto-suave); font-size: 0.75rem; }
.rosca__legenda { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; flex: 1; min-width: 160px; font-size: 0.9rem; }
.rosca__legenda li { display: flex; align-items: center; gap: 10px; }
.rosca__legenda b { margin-left: auto; font-variant-numeric: tabular-nums; }
.rosca__ponto { width: 10px; height: 10px; border-radius: 50%; flex: none; }
```

- [ ] **Step 9: Rodar a suíte web**

Run: `npx vitest run web`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json web/src/test/mockRecharts.js web/src/components/graficos/GraficoLinha.jsx web/src/components/graficos/GraficoRosca.jsx web/src/components/graficos/GraficoRosca.test.jsx web/src/components/graficos/GraficoBarras.jsx web/src/styles.css
git add web/src/components/graficos/tema.js 2>/dev/null || true
git commit -m "feat: graficos de linha, rosca e barras com recharts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Início montada como dashboard

**Pré-requisito:** Tasks 2, 3 e 4 deste plano e as Tasks 9 e 15 do plano do perfil no `main`.

**Files:**
- Modify: `web/src/pages/Inicio.jsx`
- Test: `web/src/pages/Inicio.test.jsx`

**Interfaces:**
- Consumes: `GET /painel/graficos` (Task 2); `CartaoGrafico`, `Funil` (Task 3); `GraficoLinha`, `GraficoRosca`, `GraficoBarras`, `rechartsFalso` (Task 4); `ROTULO_SERVICO` (Perfil Task 9: `{ site_sistema: 'Site/Sistema', google_meu_negocio: 'GMN', placas_nfc: 'Placas' }`); `Numero` com `icone` (Tema).
- Produces: nada para outras tasks.

- [ ] **Step 1: Escrever os testes que falham**

Em `web/src/pages/Inicio.test.jsx`:
- trocar a primeira linha por `import { describe, it, expect, vi } from 'vitest';`
- logo depois dos imports, acrescentar:

```js
vi.mock('recharts', async () => (await import('../test/mockRecharts.js')).rechartsFalso);

const PAINEL_VAZIO = {
  cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
  tarefas_por_projeto: { reais: [], ficticios: [] },
  proximos: [],
  para_entregar: { gmn: 0, placas: 0, itens: [] },
};

const GRAFICOS = {
  funil: {
    etapas: [
      { etapa: 'contato', quantidade: 4, percentual: 100 },
      { etapa: 'proposta', quantidade: 2, percentual: 50 },
      { etapa: 'andamento', quantidade: 1, percentual: 25 },
      { etapa: 'entregue', quantidade: 1, percentual: 25 },
    ],
    perdidos: 1,
  },
  recebido_por_mes: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((mes, i) => ({ mes, total_centavos: i * 1000 })),
  origens: { total: 4, fatias: [{ nome: 'Instagram', quantidade: 3 }, { nome: 'Não informado', quantidade: 1 }] },
  por_servico: [
    { servico: 'site_sistema', total_centavos: 150000 },
    { servico: 'google_meu_negocio', total_centavos: 20000 },
    { servico: 'placas_nfc', total_centavos: 0 },
  ],
};

const GRAFICOS_VAZIOS = {
  funil: { etapas: GRAFICOS.funil.etapas.map((e) => ({ ...e, quantidade: 0, percentual: 0 })), perdidos: 0 },
  recebido_por_mes: GRAFICOS.recebido_por_mes.map((m) => ({ ...m, total_centavos: 0 })),
  origens: { total: 0, fatias: [] },
  por_servico: GRAFICOS.por_servico.map((s) => ({ ...s, total_centavos: 0 })),
};
```

- dentro do `describe('Inicio', …)`, acrescentar:

```js
  it('mostra os 4 gráficos com os dados do painel', async () => {
    mockApi({ 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    expect(await screen.findByRole('heading', { name: 'Funil de oportunidades' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Faturamento por serviço' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'De onde vêm os clientes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recebido por mês' })).toBeInTheDocument();
    expect(screen.getByText('1 perdido')).toBeInTheDocument();
    expect(await screen.findByText('Instagram')).toBeInTheDocument(); // rosca é carregada sob demanda
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.queryByText('Ainda sem dados')).not.toBeInTheDocument();
  });

  it('com tudo zerado mostra "Ainda sem dados" nos 4 gráficos', async () => {
    mockApi({ 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': GRAFICOS_VAZIOS });
    renderizar(<Inicio />);
    expect(await screen.findAllByText('Ainda sem dados')).toHaveLength(4);
  });

  it('erro nos gráficos não esconde o resto da Início', async () => {
    mockApi({ 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': resposta(500, { erro: 'Falhou' }) });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nada para os próximos 7 dias.')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhuma tarefa pendente.')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Funil de oportunidades' })).not.toBeInTheDocument();
  });
```

- mudar o import do mock para `import { mockApi, resposta } from '../test/mockApi.js';`

Run: `npx vitest run web/src/pages/Inicio.test.jsx`
Expected: os 3 testes novos FALHAM (títulos não existem); os antigos passam.

- [ ] **Step 2: Implementar em `web/src/pages/Inicio.jsx`**

No topo, trocar/adicionar imports:

```js
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Numero } from '../components/Numero.jsx';
import { CartaoGrafico } from '../components/graficos/CartaoGrafico.jsx';
import { Funil } from '../components/graficos/Funil.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';
import { ABA_DO_SERVICO, ROTULO_SERVICO } from '../lib/rotulos.js';

// Recharts só é baixado quando a Início abre.
const GraficoLinha = lazy(() => import('../components/graficos/GraficoLinha.jsx').then((m) => ({ default: m.GraficoLinha })));
const GraficoRosca = lazy(() => import('../components/graficos/GraficoRosca.jsx').then((m) => ({ default: m.GraficoRosca })));
const GraficoBarras = lazy(() => import('../components/graficos/GraficoBarras.jsx').then((m) => ({ default: m.GraficoBarras })));

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rotuloMes = (anoMes) => MESES[Number(anoMes.slice(5, 7)) - 1];
const dataDeHoje = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
```

(`ABA_DO_SERVICO` já foi importado pela Task 15 do plano do perfil — manter um só import de `rotulos.js` com os dois nomes.)

Acrescentar o componente, antes de `export function Inicio()`:

```jsx
function Graficos() {
  const { dados, erro } = useCarregar(() => api('/painel/graficos'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <p className="vazio">Carregando gráficos…</p>;
  const { funil, recebido_por_mes: recebido, origens, por_servico: porServico } = dados;
  const carregando = <p className="vazio">Carregando…</p>;

  return (
    <>
      <div className="grade-graficos">
        <CartaoGrafico titulo="Funil de oportunidades" subtitulo="sites e sistemas" vazio={funil.etapas[0].quantidade === 0}>
          <Funil etapas={funil.etapas} perdidos={funil.perdidos} />
        </CartaoGrafico>
        <CartaoGrafico titulo="Faturamento por serviço" subtitulo="últimos 12 meses" vazio={porServico.every((s) => s.total_centavos === 0)}>
          <Suspense fallback={carregando}>
            <GraficoBarras dados={porServico.map((s) => ({ rotulo: ROTULO_SERVICO[s.servico], valor_centavos: s.total_centavos }))} />
          </Suspense>
        </CartaoGrafico>
      </div>
      <div className="grade-graficos">
        <CartaoGrafico titulo="De onde vêm os clientes" vazio={origens.total === 0}>
          <Suspense fallback={carregando}>
            <GraficoRosca fatias={origens.fatias} total={origens.total} />
          </Suspense>
        </CartaoGrafico>
        <CartaoGrafico titulo="Recebido por mês" subtitulo="últimos 6 meses" vazio={recebido.every((m) => m.total_centavos === 0)}>
          <Suspense fallback={carregando}>
            <GraficoLinha dados={recebido.map((m) => ({ rotulo: rotuloMes(m.mes), valor_centavos: m.total_centavos }))} />
          </Suspense>
        </CartaoGrafico>
      </div>
    </>
  );
}
```

No `return` de `Inicio`:
- trocar `<header className="pagina__topo"><h1>Início</h1></header>` por:

```jsx
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo">Olá, Lucca</p>
          <h1>Início</h1>
        </div>
        <p className="vazio">{dataDeHoje()}</p>
      </header>
```

- logo depois da `<section className="cartao">` "Para entregar" (criada pela Task 15 do perfil) e antes da `<div className="grade-2">` das tarefas, inserir `<Graficos />`.

Ordem final na tela: cabeçalho → cartões com ícone → Para entregar → gráficos (2 linhas) → tarefas → próximos 7 dias.

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run web/src/pages/Inicio.test.jsx`
Expected: PASS (antigos e novos). Os testes antigos não mockam `/painel/graficos`; eles mostram um aviso de erro no lugar dos gráficos, o que não afeta o que verificam.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (servidor e web).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Inicio.jsx web/src/pages/Inicio.test.jsx
git commit -m "feat: inicio vira dashboard com graficos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Conferência no app real

**Files:**
- Modify (só se a conferência achar problema): `web/src/styles.css`, `web/src/components/graficos/*.jsx`

- [ ] **Step 1: Reiniciar os processos**

Run: `pm2 restart crm-madia-api crm-madia-web`
Expected: os dois `online`.

- [ ] **Step 2: Conferir a Início em `http://127.0.0.1:5173/`**

- Os 4 gráficos aparecem com os dados reais; passar o mouse mostra o tooltip escuro em R$ nas barras e na linha, e "N clientes" na rosca.
- Funil: faixas afinando de cima para baixo, número legível dentro da faixa mais estreita, nome e percentual à direita, linha de perdidos.
- Conferir um número na mão: o total do mês atual em "Recebido por mês" bate com a soma das parcelas pagas no mês na tela Financeiro (sem fictícios).
- Largura < 900px: gráficos em 1 coluna; 390px: rosca com a legenda embaixo, sem rolagem horizontal.

- [ ] **Step 3: Conferir que o Recharts não entra nas outras telas**

Run: `npx vite build`
Expected: em `dist/assets/` há um chunk separado com o Recharts (o maior arquivo `.js` além do `index-*.js`), e o `index-*.js` não cresceu ~130 KB em relação ao build anterior. Se o Recharts estiver no `index`, conferir se algum arquivo fora da Início importa `recharts` diretamente.

- [ ] **Step 4: Corrigir o que aparecer e commitar (só se houve correção)**

```bash
git add web/src/styles.css web/src/components/graficos
git commit -m "fix: ajustes visuais do dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
