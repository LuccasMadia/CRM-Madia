# Packs de placas e preço de recompra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada modelo de placa ganha uma tabela de packs, e a linha "Placas NFC" da oportunidade passa a sugerir o preço pelo pack (cliente novo) ou pela continuação do pack (recompra, somando o histórico de placas do cliente).

**Architecture:** Função pura `precoPlacas` em `server/domain/placas.js` calcula o preço por posição. Tabela nova `placas_modelos_packs` guarda os packs; `projetos_servicos.valor_total_centavos` guarda o total exato da linha de placas. Um helper `precoSugeridoPlacas(db, …)` (em `server/repos/placas.js`) junta packs + histórico do cliente e é usado pelo endpoint novo `GET /placas/modelos/:id/preco` e por `validarServicos` em `routes/projetos.js`. O frontend só exibe a sugestão.

**Tech Stack:** Node 24 (`node:sqlite`), Express 5, React 19, Vitest + Testing Library + supertest.

**Spec:** `docs/superpowers/specs/2026-10-15-placas-packs-recompra-design.md`

## Global Constraints

- Valores sempre em centavos inteiros (`*_centavos`); nunca float na persistência.
- Pack de 1 **não** é gravado em `placas_modelos_packs`; é sempre `placas_modelos.preco_venda_centavos`.
- `placas_modelos_packs.quantidade >= 2`, única por modelo; `preco_total_centavos >= 0`.
- Histórico = soma de `placas_vendas.quantidade` do `cliente_id`, de **qualquer modelo**, excluindo as vendas ligadas (`projetos_servicos.venda_id`) à própria oportunidade.
- Posição acima da maior quantidade da tabela usa o último degrau.
- Linha `placas_nfc` grava `valor_total_centavos` e `valor_unitario_centavos = Math.round(total / quantidade)`; demais tipos deixam `valor_total_centavos` `NULL`.
- Venda criada na entrega usa `preco_vendido_centavos = Math.round(total / quantidade)`.
- Mensagens de erro e rótulos em português, mesmo formato `{ campo, mensagem }` já usado.
- Commits em Conventional Commits, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar testes com `npx vitest run <arquivo>`; suíte completa com `npm test`.

## Review Focus

1. **Pack com total menor que um pack menor** (ex.: pack de 2 = R$ 70 com unidade R$ 80) geraria degrau negativo → a API rejeita com `packs[i].preco_total_centavos: "Não pode ser menor que o pack de N"` (teste na Task 3). Também ao baixar o `preco_venda_centavos` acima de um pack existente.
2. **Salvar a aba Visão geral sem mexer nos serviços** de uma oportunidade com 3 placas por R$ 200 → tem que continuar R$ 200, não R$ 200,01 (a AbaGeral precisa reenviar `valor_total_centavos`; teste na Task 6 e na Task 4).
3. **Endpoint de preço fora do ar / sem mock** (ex.: testes existentes de Funil e Projeto que não mockam `/preco`) → o `CamposServicos` mantém o valor atual e não quebra (teste na Task 6).
4. **Oportunidade com "+ Novo cliente"** → nenhuma consulta de histórico, preço de pack normal (teste na Task 4: criar com `novo_cliente` sem valor usa pack).
5. **Quantidade vazia/0 digitada no campo** → não dispara consulta de preço com quantidade inválida e o endpoint responde 400 para `quantidade` < 1 (testes nas Tasks 3 e 6).

---

### Task 1: Domínio — preço por posição

**Files:**
- Modify: `server/domain/placas.js` (adicionar no fim)
- Modify: `server/domain/servicos.js`
- Test: `server/domain/placas.test.js`, `server/domain/servicos.test.js`

**Interfaces:**
- Produces:
  - `precosPorPosicao(modelo: { preco_venda_centavos }, packs: Array<{ quantidade, preco_total_centavos }>): number[]` — `degraus[k-1]` = preço da posição *k*, até a maior quantidade da tabela.
  - `precoPlacas(modelo, packs, jaComprou: number, quantidade: number): { total_centavos: number, preco_por_placa_centavos: number[] }`
  - `valorLinhaServico(s)` passa a usar `s.valor_total_centavos` quando não for `null`/`undefined`.

- [ ] **Step 1: Write the failing tests**

Em `server/domain/placas.test.js`, adicionar `precosPorPosicao, precoPlacas` ao import existente de `./placas.js` e acrescentar no fim:

```js
const MOD_10x10 = { preco_venda_centavos: 8000 };
const PACKS_10x10 = [{ quantidade: 2, preco_total_centavos: 14000 }, { quantidade: 3, preco_total_centavos: 20000 }];
const MOD_10x15 = { preco_venda_centavos: 10000 };
const PACKS_10x15 = [{ quantidade: 3, preco_total_centavos: 25000 }, { quantidade: 2, preco_total_centavos: 18000 }];

describe('precosPorPosicao', () => {
  it('deriva o preço de cada posição pela diferença entre packs (ordem dos packs não importa)', () => {
    expect(precosPorPosicao(MOD_10x10, PACKS_10x10)).toEqual([8000, 6000, 6000]);
    expect(precosPorPosicao(MOD_10x15, PACKS_10x15)).toEqual([10000, 8000, 7000]);
  });

  it('sem packs, só tem a posição 1', () => {
    expect(precosPorPosicao(MOD_10x10, [])).toEqual([8000]);
  });

  it('tabela com buraco divide a diferença e joga o resto na última posição do intervalo', () => {
    expect(precosPorPosicao({ preco_venda_centavos: 10000 }, [{ quantidade: 3, preco_total_centavos: 25001 }])).toEqual([10000, 7500, 7501]);
  });
});

describe('precoPlacas', () => {
  it('cliente novo paga exatamente o pack', () => {
    expect(precoPlacas(MOD_10x15, PACKS_10x15, 0, 1).total_centavos).toBe(10000);
    expect(precoPlacas(MOD_10x15, PACKS_10x15, 0, 2).total_centavos).toBe(18000);
    expect(precoPlacas(MOD_10x15, PACKS_10x15, 0, 3).total_centavos).toBe(25000);
  });

  it('acima do maior pack repete o último degrau', () => {
    expect(precoPlacas(MOD_10x15, PACKS_10x15, 0, 4)).toEqual({ total_centavos: 32000, preco_por_placa_centavos: [10000, 8000, 7000, 7000] });
    expect(precoPlacas(MOD_10x10, PACKS_10x10, 0, 5).total_centavos).toBe(32000);
  });

  it('recompra continua do ponto em que o cliente parou', () => {
    expect(precoPlacas(MOD_10x15, PACKS_10x15, 1, 2)).toEqual({ total_centavos: 15000, preco_por_placa_centavos: [8000, 7000] });
    expect(precoPlacas(MOD_10x15, PACKS_10x15, 3, 1).total_centavos).toBe(7000);
    expect(precoPlacas(MOD_10x10, PACKS_10x10, 1, 1).total_centavos).toBe(6000);
  });

  it('modelo sem packs cobra preço cheio em toda posição', () => {
    expect(precoPlacas(MOD_10x10, [], 2, 3).total_centavos).toBe(24000);
  });

  it('tabela com buraco mantém o pack exato para cliente novo', () => {
    const packs = [{ quantidade: 3, preco_total_centavos: 25001 }];
    expect(precoPlacas({ preco_venda_centavos: 10000 }, packs, 0, 3).total_centavos).toBe(25001);
  });
});
```

Em `server/domain/servicos.test.js`, acrescentar (garanta que `valorLinhaServico` está no import):

```js
describe('valorLinhaServico com valor_total_centavos', () => {
  it('usa o total da linha quando existe', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 6667, quantidade: 3, valor_total_centavos: 20000 })).toBe(20000);
  });

  it('sem total (null), continua unitário × quantidade', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 5000, quantidade: 2, valor_total_centavos: null })).toBe(10000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/domain/placas.test.js server/domain/servicos.test.js`
Expected: FAIL — `precosPorPosicao is not a function` / total 20001 ≠ 20000.

- [ ] **Step 3: Implement**

No fim de `server/domain/placas.js`:

```js
export function precosPorPosicao(modelo, packs) {
  const totais = [{ quantidade: 1, preco_total_centavos: modelo.preco_venda_centavos }, ...packs.filter((p) => p.quantidade >= 2)]
    .sort((a, b) => a.quantidade - b.quantidade);
  const degraus = [];
  let anterior = { quantidade: 0, preco_total_centavos: 0 };
  for (const pack of totais) {
    const posicoes = pack.quantidade - anterior.quantidade;
    const diferenca = pack.preco_total_centavos - anterior.preco_total_centavos;
    const base = Math.floor(diferenca / posicoes);
    for (let i = 0; i < posicoes; i++) degraus.push(i === posicoes - 1 ? diferenca - base * (posicoes - 1) : base);
    anterior = pack;
  }
  return degraus;
}

export function precoPlacas(modelo, packs, jaComprou, quantidade) {
  const degraus = precosPorPosicao(modelo, packs);
  const precoPorPlaca = [];
  for (let posicao = jaComprou + 1; posicao <= jaComprou + quantidade; posicao++) {
    precoPorPlaca.push(degraus[Math.min(posicao, degraus.length) - 1]);
  }
  return { total_centavos: precoPorPlaca.reduce((soma, p) => soma + p, 0), preco_por_placa_centavos: precoPorPlaca };
}
```

Em `server/domain/servicos.js`, trocar `valorLinhaServico` por:

```js
export function valorLinhaServico(servico) {
  return servico.valor_total_centavos ?? servico.valor_unitario_centavos * (servico.quantidade ?? 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/domain`
Expected: PASS (todos, incluindo os antigos).

- [ ] **Step 5: Commit**

```bash
git add server/domain/placas.js server/domain/placas.test.js server/domain/servicos.js server/domain/servicos.test.js
git commit -m "feat: calculo de preco de placas por posicao (pack e recompra)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 014 + repos

**Files:**
- Create: `server/db/migrations/014_placas_packs.sql`
- Modify: `server/repos/placas.js`
- Modify: `server/repos/servicos.js:3`
- Test: `server/db/connection.test.js`, `server/repos/placas.test.js` (novo)

**Interfaces:**
- Consumes: `precoPlacas` (Task 1).
- Produces:
  - `repoPlacasModelosPacks(db)` com `listar({ modelo_id }?)` (ordenado por `quantidade`), `criar`, `removerPorModelo(modeloId)`.
  - `repoPlacasVendas(db).quantidadeDoCliente(clienteId: number, { excluirProjetoId?: number|null }): number`
  - `precoSugeridoPlacas(db, { modelo, quantidade, clienteId?, projetoId? }): { total_centavos, ja_comprou, recompra, preco_por_placa_centavos }`
  - `CAMPOS_SERVICO` inclui `'valor_total_centavos'`.

- [ ] **Step 1: Write the failing tests**

Em `server/db/connection.test.js`, adicionar imports `readdirSync, readFileSync` (de `node:fs`), `fileURLToPath` (de `node:url`) e `DatabaseSync` (de `node:sqlite`), e o teste:

```js
describe('migration 014_placas_packs', () => {
  it('preenche valor_total_centavos das linhas de placas já existentes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('CREATE TABLE schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
    const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql') && f < '014').sort()) {
      db.exec(readFileSync(path.join(pasta, arquivo), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?, ?)').run(arquivo, 'x');
    }
    const t = '2026-10-01T00:00:00.000Z';
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
    db.prepare('INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('P', t, t);
    db.prepare('INSERT INTO placas_modelos (id, nome, preco_venda_centavos, criado_em, atualizado_em) VALUES (1, ?, 8000, ?, ?)').run('10x10', t, t);
    db.prepare("INSERT INTO projetos_servicos (projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, criado_em, atualizado_em) VALUES (1, 'placas_nfc', 1, 2, 7000, ?, ?)").run(t, t);
    db.prepare("INSERT INTO projetos_servicos (projeto_id, tipo, quantidade, valor_unitario_centavos, criado_em, atualizado_em) VALUES (1, 'saas', 1, 5000, ?, ?)").run(t, t);

    migrate(db);

    const linhas = db.prepare('SELECT tipo, valor_total_centavos FROM projetos_servicos ORDER BY id').all().map((r) => ({ ...r }));
    expect(linhas).toEqual([{ tipo: 'placas_nfc', valor_total_centavos: 14000 }, { tipo: 'saas', valor_total_centavos: null }]);
  });
});
```

Criar `server/repos/placas.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../db/connection.js';
import { repoPlacasModelos, repoPlacasModelosPacks, repoPlacasVendas, precoSugeridoPlacas } from './placas.js';
import { repoProjetosServicos } from './servicos.js';

let db;
let modelo;
const t = '2026-10-01T00:00:00.000Z';

function criarVenda({ clienteId, quantidade, modeloId = modelo.id }) {
  return repoPlacasVendas(db).criar({
    modelo_id: modeloId, quantidade, preco_vendido_centavos: 8000, custo_unitario_centavos: 700,
    cliente_id: clienteId, comprador_nome: null, data_venda: '2026-10-01',
  });
}

beforeEach(() => {
  db = openDb(':memory:');
  db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?), (2, ?, ?, ?)').run('Ana', t, t, 'Bia', t, t);
  modelo = repoPlacasModelos(db).criar({ nome: '10x15', preco_venda_centavos: 10000 });
  const packs = repoPlacasModelosPacks(db);
  packs.criar({ modelo_id: modelo.id, quantidade: 3, preco_total_centavos: 25000 });
  packs.criar({ modelo_id: modelo.id, quantidade: 2, preco_total_centavos: 18000 });
});

describe('repoPlacasModelosPacks', () => {
  it('lista os packs do modelo ordenados por quantidade', () => {
    expect(repoPlacasModelosPacks(db).listar({ modelo_id: modelo.id }).map((p) => p.quantidade)).toEqual([2, 3]);
  });
});

describe('quantidadeDoCliente', () => {
  it('soma vendas de qualquer modelo só do cliente pedido', () => {
    const outro = repoPlacasModelos(db).criar({ nome: '10x10', preco_venda_centavos: 8000 });
    criarVenda({ clienteId: 1, quantidade: 2 });
    criarVenda({ clienteId: 1, quantidade: 1, modeloId: outro.id });
    criarVenda({ clienteId: 2, quantidade: 5 });
    expect(repoPlacasVendas(db).quantidadeDoCliente(1, {})).toBe(3);
  });

  it('exclui as vendas ligadas à própria oportunidade', () => {
    db.prepare('INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('P', t, t);
    const venda = criarVenda({ clienteId: 1, quantidade: 2 });
    criarVenda({ clienteId: 1, quantidade: 1 });
    repoProjetosServicos(db).criar({ projeto_id: 1, tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_unitario_centavos: 9000, valor_total_centavos: 18000, venda_id: venda.id });
    expect(repoPlacasVendas(db).quantidadeDoCliente(1, { excluirProjetoId: 1 })).toBe(1);
  });
});

describe('precoSugeridoPlacas', () => {
  it('cliente novo (sem clienteId) paga o pack', () => {
    expect(precoSugeridoPlacas(db, { modelo, quantidade: 2 })).toEqual({
      total_centavos: 18000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000, 8000],
    });
  });

  it('cliente com histórico paga a continuação do pack', () => {
    criarVenda({ clienteId: 1, quantidade: 1 });
    expect(precoSugeridoPlacas(db, { modelo, quantidade: 2, clienteId: 1 })).toMatchObject({ total_centavos: 15000, ja_comprou: 1, recompra: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/db/connection.test.js server/repos/placas.test.js`
Expected: FAIL — `no such column: valor_total_centavos` / `repoPlacasModelosPacks is not a function`.

- [ ] **Step 3: Implement**

Criar `server/db/migrations/014_placas_packs.sql`:

```sql
CREATE TABLE placas_modelos_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 2),
  preco_total_centavos INTEGER NOT NULL CHECK (preco_total_centavos >= 0),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE (modelo_id, quantidade)
);

ALTER TABLE projetos_servicos ADD COLUMN valor_total_centavos INTEGER CHECK (valor_total_centavos >= 0);
UPDATE projetos_servicos SET valor_total_centavos = valor_unitario_centavos * quantidade WHERE tipo = 'placas_nfc';
```

Em `server/repos/servicos.js`, trocar a linha de campos:

```js
export const CAMPOS_SERVICO = ['projeto_id', 'tipo', 'modelo_id', 'quantidade', 'valor_unitario_centavos', 'valor_total_centavos', 'venda_id'];
```

Em `server/repos/placas.js`:
- No topo: `import { precoPlacas } from '../domain/placas.js';`
- Logo depois de `repoPlacasModelosItens`:

```js
export const CAMPOS_PACK = ['modelo_id', 'quantidade', 'preco_total_centavos'];
export function repoPlacasModelosPacks(db) {
  const base = criarRepo(db, 'placas_modelos_packs', CAMPOS_PACK);
  return {
    ...base,
    listar({ modelo_id } = {}) {
      const filtro = {};
      if (modelo_id) filtro.modelo_id = Number(modelo_id);
      return base.listar(filtro, 'modelo_id, quantidade');
    },
    removerPorModelo(modeloId) {
      db.prepare('DELETE FROM placas_modelos_packs WHERE modelo_id = ?').run(modeloId);
    },
  };
}
```

- Trocar `repoPlacasVendas` por:

```js
export function repoPlacasVendas(db) {
  const base = criarRepo(db, 'placas_vendas', CAMPOS_VENDA);
  return {
    ...base,
    listar: () => base.listar({}, 'data_venda DESC, id DESC'),
    quantidadeDoCliente(clienteId, { excluirProjetoId = null } = {}) {
      return db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) AS n FROM placas_vendas
        WHERE cliente_id = ?
          AND id NOT IN (SELECT venda_id FROM projetos_servicos WHERE projeto_id = ? AND venda_id IS NOT NULL)
      `).get(clienteId, excluirProjetoId ?? -1).n;
    },
  };
}
```

- No fim do arquivo:

```js
export function precoSugeridoPlacas(db, { modelo, quantidade, clienteId = null, projetoId = null }) {
  const packs = repoPlacasModelosPacks(db).listar({ modelo_id: modelo.id });
  const jaComprou = clienteId ? repoPlacasVendas(db).quantidadeDoCliente(clienteId, { excluirProjetoId: projetoId }) : 0;
  const { total_centavos, preco_por_placa_centavos } = precoPlacas(modelo, packs, jaComprou, quantidade);
  return { total_centavos, ja_comprou: jaComprou, recompra: jaComprou > 0, preco_por_placa_centavos };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS (todos os testes do servidor).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/014_placas_packs.sql server/db/connection.test.js server/repos/placas.js server/repos/placas.test.js server/repos/servicos.js
git commit -m "feat: tabela de packs por modelo e total exato na linha de placas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rotas de Placas — packs no modelo e endpoint de preço

**Files:**
- Modify: `server/routes/placas.js` (imports, `montarModelo`, `POST/PUT/DELETE /placas/modelos`, nova rota de preço)
- Test: `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `repoPlacasModelosPacks`, `precoSugeridoPlacas` (Task 2).
- Produces:
  - `GET /api/placas/modelos` → cada modelo com `packs: [{ quantidade, preco_total_centavos }]`.
  - `POST/PUT /api/placas/modelos` aceitam `packs` (no PUT, substitui todos se vier).
  - `GET /api/placas/modelos/:id/preco?quantidade=N&cliente_id=X&projeto_id=Y` → `{ total_centavos, ja_comprou, recompra, preco_por_placa_centavos }`.

- [ ] **Step 1: Write the failing tests**

No fim de `server/routes/placas.test.js`:

```js
describe('/api/placas/modelos packs', () => {
  async function criarComPacks(packs, overrides = {}) {
    return ctx.http.post('/api/placas/modelos').send({ nome: '10x15', preco_venda_centavos: 10000, packs, ...overrides });
  }

  it('cria e lista o modelo com os packs ordenados', async () => {
    await criarComPacks([{ quantidade: 3, preco_total_centavos: 25000 }, { quantidade: 2, preco_total_centavos: 18000 }]).expect(201);
    const res = await ctx.http.get('/api/placas/modelos').expect(200);
    expect(res.body[0].packs).toEqual([{ quantidade: 2, preco_total_centavos: 18000 }, { quantidade: 3, preco_total_centavos: 25000 }]);
  });

  it('modelo sem packs vem com lista vazia', async () => {
    await criarComPacks(undefined).expect(201);
    expect((await ctx.http.get('/api/placas/modelos')).body[0].packs).toEqual([]);
  });

  it('PUT com packs substitui todos; PUT sem packs mantém', async () => {
    const modelo = (await criarComPacks([{ quantidade: 2, preco_total_centavos: 18000 }])).body;
    await ctx.http.put(`/api/placas/modelos/${modelo.id}`).send({ packs: [{ quantidade: 3, preco_total_centavos: 25000 }] }).expect(200);
    const res = await ctx.http.put(`/api/placas/modelos/${modelo.id}`).send({ nome: 'Novo nome' }).expect(200);
    expect(res.body.packs).toEqual([{ quantidade: 3, preco_total_centavos: 25000 }]);
  });

  it('rejeita quantidade menor que 2', async () => {
    const res = await criarComPacks([{ quantidade: 1, preco_total_centavos: 9000 }]).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'packs[0].quantidade', mensagem: 'Deve ser no mínimo 2' }]);
  });

  it('rejeita quantidade repetida', async () => {
    const res = await criarComPacks([{ quantidade: 2, preco_total_centavos: 18000 }, { quantidade: 2, preco_total_centavos: 17000 }]).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'packs[1].quantidade', mensagem: 'Quantidade repetida' }]);
  });

  it('rejeita pack com total menor que um pack menor', async () => {
    const res = await criarComPacks([{ quantidade: 2, preco_total_centavos: 9000 }]).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'packs[0].preco_total_centavos', mensagem: 'Não pode ser menor que o pack de 1' }]);
  });

  it('rejeita subir o preço de venda acima de um pack existente', async () => {
    const modelo = (await criarComPacks([{ quantidade: 2, preco_total_centavos: 18000 }])).body;
    const res = await ctx.http.put(`/api/placas/modelos/${modelo.id}`).send({ preco_venda_centavos: 19000 }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'packs[0].preco_total_centavos', mensagem: 'Não pode ser menor que o pack de 1' }]);
  });

  it('excluir o modelo remove os packs', async () => {
    const modelo = (await criarComPacks([{ quantidade: 2, preco_total_centavos: 18000 }])).body;
    await ctx.http.delete(`/api/placas/modelos/${modelo.id}`).expect(204);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM placas_modelos_packs').get().n).toBe(0);
  });
});

describe('/api/placas/modelos/:id/preco', () => {
  let modelo;
  let ana;
  let bia;
  beforeEach(async () => {
    modelo = (await ctx.http.post('/api/placas/modelos').send({
      nome: '10x15', preco_venda_centavos: 10000,
      packs: [{ quantidade: 2, preco_total_centavos: 18000 }, { quantidade: 3, preco_total_centavos: 25000 }],
    })).body;
    ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    bia = (await ctx.http.post('/api/clientes').send({ nome: 'Bia' })).body;
  });

  function venda(clienteId, quantidade) {
    const t = '2026-10-01T00:00:00.000Z';
    return ctx.db.prepare(`INSERT INTO placas_vendas (modelo_id, quantidade, preco_vendido_centavos, custo_unitario_centavos, cliente_id, data_venda, criado_em, atualizado_em)
      VALUES (?, ?, 8000, 700, ?, '2026-10-01', ?, ?)`).run(modelo.id, quantidade, clienteId, t, t).lastInsertRowid;
  }

  it('sem cliente devolve o preço do pack', async () => {
    const res = await ctx.http.get(`/api/placas/modelos/${modelo.id}/preco?quantidade=2`).expect(200);
    expect(res.body).toEqual({ total_centavos: 18000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000, 8000] });
  });

  it('com cliente que já comprou devolve o preço de recompra, ignorando vendas de outros clientes', async () => {
    venda(ana.id, 1);
    venda(bia.id, 5);
    const res = await ctx.http.get(`/api/placas/modelos/${modelo.id}/preco?quantidade=2&cliente_id=${ana.id}`).expect(200);
    expect(res.body).toMatchObject({ total_centavos: 15000, ja_comprou: 1, recompra: true });
  });

  it('ignora as vendas da própria oportunidade (projeto_id)', async () => {
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'P' })).body;
    const vendaId = venda(ana.id, 2);
    ctx.db.prepare(`INSERT INTO projetos_servicos (projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, valor_total_centavos, venda_id, criado_em, atualizado_em)
      VALUES (?, 'placas_nfc', ?, 2, 9000, 18000, ?, 'x', 'x')`).run(projeto.id, modelo.id, vendaId);
    const res = await ctx.http.get(`/api/placas/modelos/${modelo.id}/preco?quantidade=2&cliente_id=${ana.id}&projeto_id=${projeto.id}`).expect(200);
    expect(res.body).toMatchObject({ total_centavos: 18000, ja_comprou: 0 });
  });

  it('quantidade ausente ou menor que 1 responde 400', async () => {
    const res = await ctx.http.get(`/api/placas/modelos/${modelo.id}/preco?quantidade=0`).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'quantidade', mensagem: 'Deve ser no mínimo 1' }]);
    await ctx.http.get(`/api/placas/modelos/${modelo.id}/preco`).expect(400);
  });

  it('modelo inexistente responde 404', async () => {
    await ctx.http.get('/api/placas/modelos/999/preco?quantidade=1').expect(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/placas.test.js`
Expected: FAIL — `packs` undefined nas respostas, rota `/preco` 404.

- [ ] **Step 3: Implement**

Em `server/routes/placas.js`:

1. Import: adicionar `repoPlacasModelosPacks, precoSugeridoPlacas` ao import de `'../repos/placas.js'`.
2. Em `rotasPlacas`, depois de `const itensModelo = …`: `const packsModelo = repoPlacasModelosPacks(db);`
3. Depois de `validarItens`, adicionar:

```js
  function validarPacks(packsBrutos, precoVendaCentavos) {
    if (!Array.isArray(packsBrutos)) throw new ErroValidacao([{ campo: 'packs', mensagem: 'Deve ser uma lista' }]);
    const vistas = new Set();
    const packs = packsBrutos.map((pack, i) => {
      const quantidade = Number(pack.quantidade);
      const preco = Number(pack.preco_total_centavos);
      if (!Number.isInteger(quantidade) || quantidade < 2) {
        throw new ErroValidacao([{ campo: `packs[${i}].quantidade`, mensagem: 'Deve ser no mínimo 2' }]);
      }
      if (vistas.has(quantidade)) throw new ErroValidacao([{ campo: `packs[${i}].quantidade`, mensagem: 'Quantidade repetida' }]);
      vistas.add(quantidade);
      if (!Number.isInteger(preco) || preco < 0) {
        throw new ErroValidacao([{ campo: `packs[${i}].preco_total_centavos`, mensagem: 'Valor inválido' }]);
      }
      return { quantidade, preco_total_centavos: preco, indice: i };
    });
    const ordenados = [{ quantidade: 1, preco_total_centavos: precoVendaCentavos }, ...packs].sort((a, b) => a.quantidade - b.quantidade);
    for (let k = 1; k < ordenados.length; k++) {
      if (ordenados[k].preco_total_centavos < ordenados[k - 1].preco_total_centavos) {
        throw new ErroValidacao([{
          campo: `packs[${ordenados[k].indice}].preco_total_centavos`,
          mensagem: `Não pode ser menor que o pack de ${ordenados[k - 1].quantidade}`,
        }]);
      }
    }
    return packs.map(({ quantidade, preco_total_centavos }) => ({ quantidade, preco_total_centavos }));
  }

  function gravarPacks(modeloId, packs) {
    packsModelo.removerPorModelo(modeloId);
    for (const pack of packs) packsModelo.criar({ ...pack, modelo_id: modeloId });
  }
```

4. Em `montarModelo`, acrescentar ao objeto retornado:

```js
      packs: packsModelo.listar({ modelo_id: modelo.id }).map((p) => ({ quantidade: p.quantidade, preco_total_centavos: p.preco_total_centavos })),
```

5. `POST /placas/modelos`: depois de `const itens = …`, `const packs = validarPacks(req.body.packs ?? [], dados.preco_venda_centavos);` e dentro da transação, depois do loop de itens: `gravarPacks(modelo.id, packs);`.

6. `PUT /placas/modelos/:id`: trocar `if (!modelos.obter(id)) throw naoEncontrado('Modelo');` por:

```js
    const atual = modelos.obter(id);
    if (!atual) throw naoEncontrado('Modelo');
```

e depois de `const itens = …`:

```js
    const precoVenda = dados.preco_venda_centavos ?? atual.preco_venda_centavos;
    let packs = null;
    if (req.body.packs !== undefined) packs = validarPacks(req.body.packs, precoVenda);
    else if (dados.preco_venda_centavos !== undefined) validarPacks(packsModelo.listar({ modelo_id: id }), precoVenda);
```

e dentro da transação, depois do bloco `if (itens) {…}`: `if (packs) gravarPacks(id, packs);`.

7. `DELETE /placas/modelos/:id`: dentro da transação, antes de `modelos.remover(id)`: `packsModelo.removerPorModelo(id);`.

8. Nova rota, logo depois de `POST /placas/modelos/:id/ativar`:

```js
  r.get('/placas/modelos/:id/preco', (req, res) => {
    const modelo = modelos.obter(lerId(req.params.id));
    if (!modelo) throw naoEncontrado('Modelo');
    const quantidade = Number(req.query.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      throw new ErroValidacao([{ campo: 'quantidade', mensagem: 'Deve ser no mínimo 1' }]);
    }
    const clienteId = Number(req.query.cliente_id) || null;
    const projetoId = Number(req.query.projeto_id) || null;
    res.json(precoSugeridoPlacas(db, { modelo, quantidade, clienteId, projetoId }));
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/placas.js server/routes/placas.test.js
git commit -m "feat: packs no cadastro de modelo e endpoint de preco sugerido de placas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Oportunidade usa preço de pack/recompra e total exato

**Files:**
- Modify: `server/routes/projetos.js:5,44-71,104-130,141-214`
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: `precoSugeridoPlacas(db, { modelo, quantidade, clienteId, projetoId })` (Task 2), `valorLinhaServico` (Task 1).
- Produces: linhas `placas_nfc` aceitam `valor_total_centavos`; resposta de `GET /projetos/:id` traz `valor_total_centavos` por serviço (já vem do `SELECT *`).

- [ ] **Step 1: Write the failing tests**

Dentro de `describe('/api/projetos com serviços', …)` em `server/routes/projetos.test.js`, acrescentar:

```js
  async function criarModeloComPacks() {
    return (await ctx.http.post('/api/placas/modelos').send({
      nome: 'Placa 10x15', preco_venda_centavos: 10000,
      packs: [{ quantidade: 2, preco_total_centavos: 18000 }, { quantidade: 3, preco_total_centavos: 25000 }],
    }).expect(201)).body;
  }

  function registrarVendaAnterior(modeloId, quantidade) {
    const t = '2026-09-01T00:00:00.000Z';
    ctx.db.prepare(`INSERT INTO placas_vendas (modelo_id, quantidade, preco_vendido_centavos, custo_unitario_centavos, cliente_id, data_venda, criado_em, atualizado_em)
      VALUES (?, ?, 10000, 700, ?, '2026-09-01', ?, ?)`).run(modeloId, quantidade, cliente.id, t, t);
  }

  it('placas sem valor informado usam o preço de pack para cliente sem histórico', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(25000);
    expect(res.body.servicos[0]).toMatchObject({ valor_total_centavos: 25000, valor_unitario_centavos: 8333 });
  });

  it('placas sem valor informado usam o preço de recompra para cliente com histórico', async () => {
    const modelo = await criarModeloComPacks();
    registrarVendaAnterior(modelo.id, 1);
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(15000);
  });

  it('cliente novo (novo_cliente) usa o preço de pack', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      titulo: 'P', novo_cliente: { nome: 'Caio' }, servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(18000);
  });

  it('valor_total_centavos explícito é respeitado', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3, valor_total_centavos: 20000 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(20000);
    expect(res.body.servicos[0]).toMatchObject({ valor_total_centavos: 20000, valor_unitario_centavos: 6667 });
  });

  it('valor_total_centavos inválido responde 400', async () => {
    const modelo = await criarModeloComPacks();
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: -1 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].valor_total_centavos', mensagem: 'Valor inválido' }]);
  });

  it('reenviar a linha com valor_total_centavos não muda o total (sem arredondar para 20001)', async () => {
    const modelo = await criarModeloComPacks();
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3, valor_total_centavos: 20000 }],
    })).body;
    const linha = criado.servicos[0];
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({
      servicos: [{ tipo: 'placas_nfc', modelo_id: linha.modelo_id, quantidade: linha.quantidade, valor_unitario_centavos: linha.valor_unitario_centavos, valor_total_centavos: linha.valor_total_centavos }],
    }).expect(200);
    expect(res.body.valor_total_centavos).toBe(20000);
  });

  it('entregar 3 placas por R$ 200 cria a venda com preço unitário arredondado', async () => {
    const modelo = await criarModeloComPacks();
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 3, valor_total_centavos: 20000 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    const vendas = (await ctx.http.get('/api/placas/vendas')).body;
    expect(vendas[0]).toMatchObject({ quantidade: 3, preco_vendido_centavos: 6667 });
  });
```

(`prepararReceita` já existe nesse `describe`; se estiver declarado depois dos novos testes, tudo bem — é function declaration dentro do mesmo bloco.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/projetos.test.js`
Expected: FAIL — valores calculados pelo preço cheio (30000, 20000 etc.), `valor_total_centavos` null.

- [ ] **Step 3: Implement**

Em `server/routes/projetos.js`:

1. Import: `import { repoPlacasModelos, repoPlacasModelosItens, repoPlacasLotes, repoPlacasVendas, precoSugeridoPlacas } from '../repos/placas.js';` e `import { TIPOS_SERVICO, calcularValorTotal, valorLinhaServico } from '../domain/servicos.js';`.

2. Trocar a assinatura e o bloco `placas_nfc` de `validarServicos`:

```js
function validarServicos(servicosBrutos, { modelosRepo, db, clienteId = null, projetoId = null }) {
  if (!Array.isArray(servicosBrutos)) throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Deve ser uma lista' }]);
  return servicosBrutos.map((s, i) => {
    if (!TIPOS_SERVICO.includes(s.tipo)) {
      throw new ErroValidacao([{ campo: `servicos[${i}].tipo`, mensagem: 'Tipo de serviço inválido' }]);
    }
    if (s.tipo === 'placas_nfc') {
      const modeloId = Number(s.modelo_id);
      const modelo = Number.isInteger(modeloId) && modeloId > 0 ? modelosRepo.obter(modeloId) : null;
      if (!modelo) throw new ErroValidacao([{ campo: `servicos[${i}].modelo_id`, mensagem: 'Modelo de placa não encontrado' }]);
      const quantidade = Number(s.quantidade);
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        throw new ErroValidacao([{ campo: `servicos[${i}].quantidade`, mensagem: 'Deve ser no mínimo 1' }]);
      }
      let valorTotal;
      if (s.valor_total_centavos != null) valorTotal = s.valor_total_centavos;
      else if (s.valor_unitario_centavos != null) valorTotal = s.valor_unitario_centavos * quantidade;
      else valorTotal = precoSugeridoPlacas(db, { modelo, quantidade, clienteId, projetoId }).total_centavos;
      if (!Number.isInteger(valorTotal) || valorTotal < 0) {
        throw new ErroValidacao([{ campo: `servicos[${i}].valor_total_centavos`, mensagem: 'Valor inválido' }]);
      }
      return {
        tipo: s.tipo, modelo_id: modeloId, quantidade,
        valor_total_centavos: valorTotal, valor_unitario_centavos: Math.round(valorTotal / quantidade),
      };
    }
    // … resto (tipos sem placas) igual ao atual
```

3. Em `processarEntregaDePlacas`, trocar `preco_vendido_centavos: linhaServico.valor_unitario_centavos,` por:

```js
        preco_vendido_centavos: Math.round(valorLinhaServico(linhaServico) / linhaServico.quantidade),
```

4. `POST /`: trocar a linha de `servicosValidados` por:

```js
    const clienteDaOportunidade = corpo.novo_cliente ? null : (Number(corpo.cliente_id) || null);
    const servicosValidados = temServicos
      ? validarServicos(corpo.servicos, { modelosRepo: modelos, db, clienteId: clienteDaOportunidade })
      : null;
```

5. `PUT /:id`: trocar a linha de `servicosValidados` por:

```js
    const servicosValidados = temServicos
      ? validarServicos(corpo.servicos, { modelosRepo: modelos, db, clienteId: Number(corpo.cliente_id) || atual.cliente_id, projetoId: id })
      : null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS (incluindo os testes antigos de serviços: sem packs, 2 placas de R$ 80 continuam R$ 160 e a venda continua com preço 8000).

- [ ] **Step 5: Commit**

```bash
git add server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: oportunidade sugere preco de pack ou recompra para placas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cadastro de packs no modelo (frontend)

**Files:**
- Modify: `web/src/components/FormPlacaModelo.jsx`
- Modify: `web/src/pages/placas/AbaModelos.jsx`
- Test: `web/src/components/FormPlacaModelo.test.jsx` (novo), `web/src/pages/Placas.test.jsx` (só se algum teste quebrar por causa da coluna nova)

**Interfaces:**
- Consumes: `precosPorPosicao` de `server/domain/placas.js` (importado direto, como `AbaPortfolio.jsx` já faz com `server/domain/slug.js`); API `packs` da Task 3.
- Produces: `onSalvar({ nome, preco_venda_centavos, itens, packs: [{ quantidade, preco_total_centavos }] })`.

- [ ] **Step 1: Write the failing test**

Criar `web/src/components/FormPlacaModelo.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormPlacaModelo } from './FormPlacaModelo.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const INICIAL = {
  nome: 'Placa 10x15', preco_venda_centavos: 10000, itens: [],
  packs: [{ quantidade: 2, preco_total_centavos: 18000 }, { quantidade: 3, preco_total_centavos: 25000 }],
};

describe('FormPlacaModelo packs', () => {
  it('mostra os packs existentes e a prévia dos degraus', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    renderizar(<FormPlacaModelo inicial={INICIAL} onSalvar={() => {}} />);
    expect(await screen.findByLabelText('Quantidade do pack 1')).toHaveValue(2);
    expect(screen.getByLabelText('Preço do pack 2')).toHaveValue('250,00');
    expect(screen.getByText('1ª: R$ 100,00 · 2ª: R$ 80,00 · 3ª em diante: R$ 70,00')).toBeInTheDocument();
  });

  it('adiciona, remove e envia packs', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    const enviados = [];
    renderizar(<FormPlacaModelo inicial={INICIAL} onSalvar={(d) => enviados.push(d)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Pack' }));
    await user.clear(screen.getByLabelText('Quantidade do pack 3'));
    await user.type(screen.getByLabelText('Quantidade do pack 3'), '5');
    await user.type(screen.getByLabelText('Preço do pack 3'), '380');
    await user.click(screen.getAllByRole('button', { name: 'Remover pack' })[1]);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados[0].packs).toEqual([
      { quantidade: 2, preco_total_centavos: 18000 },
      { quantidade: 5, preco_total_centavos: 38000 },
    ]);
  });

  it('avisa quando um pack sai mais caro por placa que o anterior', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    renderizar(<FormPlacaModelo inicial={{ ...INICIAL, packs: [{ quantidade: 2, preco_total_centavos: 21000 }] }} onSalvar={() => {}} />);
    expect(await screen.findByText('O pack de 2 sai mais caro por placa que o pack de 1.')).toBeInTheDocument();
  });

  it('valor de pack inválido bloqueia o envio', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    const enviados = [];
    renderizar(<FormPlacaModelo inicial={{ ...INICIAL, packs: [] }} onSalvar={(d) => enviados.push(d)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Pack' }));
    await user.type(screen.getByLabelText('Preço do pack 1'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/components/FormPlacaModelo.test.jsx`
Expected: FAIL — não encontra "Quantidade do pack 1".

- [ ] **Step 3: Implement**

Em `web/src/components/FormPlacaModelo.jsx`:

1. Imports: adicionar `formatarDinheiro` ao import de `../lib/dinheiro.js` e `import { precosPorPosicao } from '../../../server/domain/placas.js';`.

2. Depois do `useState` de `itens`:

```jsx
  const [packs, setPacks] = useState(
    (inicial.packs ?? []).map((p) => ({ quantidade: String(p.quantidade), preco: centavosParaTexto(p.preco_total_centavos) })),
  );

  function alterarPack(indice, campoPack, valor) {
    setPacks((atual) => atual.map((p, i) => (i === indice ? { ...p, [campoPack]: valor } : p)));
  }

  const precoVendaCentavos = paraCentavos(valores.preco_venda);
  const packsValidos = packs
    .map((p) => ({ quantidade: Number(p.quantidade), preco_total_centavos: paraCentavos(p.preco) }))
    .filter((p) => Number.isInteger(p.quantidade) && p.quantidade >= 2 && Number.isInteger(p.preco_total_centavos));
  const temPrevia = Number.isInteger(precoVendaCentavos) && packsValidos.length > 0;
  const degraus = temPrevia ? precosPorPosicao({ preco_venda_centavos: precoVendaCentavos }, packsValidos) : [];
  const previa = degraus
    .map((d, i) => `${i + 1}ª${i === degraus.length - 1 ? ' em diante' : ''}: ${formatarDinheiro(d)}`)
    .join(' · ');
  const tabela = temPrevia
    ? [{ quantidade: 1, preco_total_centavos: precoVendaCentavos }, ...packsValidos].sort((a, b) => a.quantidade - b.quantidade)
    : [];
  const avisosPacks = tabela.slice(1)
    .filter((p, k) => p.preco_total_centavos / p.quantidade > tabela[k].preco_total_centavos / tabela[k].quantidade)
    .map((p) => {
      const anterior = tabela[tabela.indexOf(p) - 1];
      return `O pack de ${p.quantidade} sai mais caro por placa que o pack de ${anterior.quantidade}.`;
    });
```

3. Em `enviar`, depois da validação de `precoVenda` e antes de `executar`:

```jsx
    const packsSaida = packs.map((p) => ({ quantidade: Number(p.quantidade), preco_total_centavos: paraCentavos(p.preco) }));
    if (packsSaida.some((p) => p.preco_total_centavos === null || Number.isNaN(p.preco_total_centavos))) {
      setErros([{ campo: 'packs', mensagem: 'Valor de pack inválido' }]);
      return;
    }
```

e adicionar `packs: packsSaida,` ao objeto passado para `onSalvar`.

4. Logo depois do `<Campo rotulo="Preço de venda (R$)" … />`:

```jsx
      <fieldset>
        <legend>Packs</legend>
        {packs.map((pack, indice) => (
          <div className="form--linha" key={indice}>
            <input
              aria-label={`Quantidade do pack ${indice + 1}`}
              type="number"
              min="2"
              value={pack.quantidade}
              onChange={(e) => alterarPack(indice, 'quantidade', e.target.value)}
            />
            <input
              aria-label={`Preço do pack ${indice + 1}`}
              inputMode="decimal"
              placeholder="Preço total (R$)"
              value={pack.preco}
              onChange={(e) => alterarPack(indice, 'preco', e.target.value)}
            />
            <button type="button" className="btn btn--fantasma btn--pequeno" aria-label="Remover pack" onClick={() => setPacks((atual) => atual.filter((_, i) => i !== indice))}>Remover</button>
          </div>
        ))}
        <button type="button" className="btn btn--fantasma" onClick={() => setPacks((atual) => [...atual, { quantidade: String(atual.length + 2), preco: '' }])}>+ Pack</button>
        {previa && <p className="form__ajuda">{previa}</p>}
        {avisosPacks.map((a) => <p key={a} className="form__ajuda form__ajuda--aviso">{a}</p>)}
        {erros.some((e) => e.campo === 'packs') && <p className="form__ajuda form__ajuda--aviso">Valor de pack inválido</p>}
      </fieldset>
```

(Se `form__ajuda` não existir em `web/src/styles`, use a classe de texto auxiliar que o projeto já usa — procure com `grep -rn "ajuda\|dica" web/src/*.css web/src/styles` — ou adicione `.form__ajuda { font-size: .875rem; color: var(--texto-suave, #666); margin: .25rem 0 0; } .form__ajuda--aviso { color: #a15c00; }` no CSS global.)

5. Em `web/src/pages/placas/AbaModelos.jsx`: adicionar a coluna depois de "Preço de venda":
   - Cabeçalho: `<th>Packs</th>` logo após `<th className="num">Preço de venda</th>`.
   - Célula, logo após a de `preco_venda_centavos`:

```jsx
        <td>{(m.packs ?? []).length ? m.packs.map((p) => `${p.quantidade} = ${formatarDinheiro(p.preco_total_centavos)}`).join(' · ') : '—'}</td>
```

   - `colSpan={5}` → `colSpan={6}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS. Se algum teste de `Placas.test.jsx` contar colunas/células, ajustar a expectativa para a coluna nova.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/FormPlacaModelo.jsx web/src/components/FormPlacaModelo.test.jsx web/src/pages/placas/AbaModelos.jsx
git add -u web/src
git commit -m "feat: cadastro de packs e previa de degraus no modelo de placa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: CamposServicos sugere preço de pack/recompra

**Files:**
- Modify: `web/src/components/CamposServicos.jsx`
- Modify: `web/src/components/FormOportunidade.jsx` (passar `clienteId`)
- Modify: `web/src/pages/projeto/AbaGeral.jsx:33` e `<CamposServicos>` (passar `clienteId`, `projetoId`, `valor_total_centavos`)
- Test: `web/src/components/CamposServicos.test.jsx`, `web/src/pages/projeto/Projeto.test.jsx`

**Interfaces:**
- Consumes: `GET /placas/modelos/:id/preco?quantidade=N[&cliente_id=X][&projeto_id=Y]` (Task 3) → `{ total_centavos, ja_comprou, recompra, preco_por_placa_centavos }`.
- Produces: `<CamposServicos servicos desconto clienteId projetoId onChange />`; saída da linha de placas `{ tipo: 'placas_nfc', modelo_id, quantidade, valor_total_centavos }`.

- [ ] **Step 1: Write the failing tests**

Em `web/src/components/CamposServicos.test.jsx`:

1. No primeiro teste ("marcar Placas NFC…"), adicionar ao `mockApi` a rota `'GET /placas/modelos/1/preco?quantidade=1': { total_centavos: 8000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [8000] }`, trocar `getByLabelText('Valor de Placas NFC')` por `getByLabelText('Valor total das placas')`, e a expectativa de saída para:

```js
    expect(emitidos.at(-1)).toEqual({
      servicos: [{ tipo: 'placas_nfc', modelo_id: 1, quantidade: 1, valor_total_centavos: 8000 }],
      desconto_centavos: 0,
    });
```

2. No teste "trocar o modelo de placas…", adicionar ao mock `'GET /placas/modelos/1/preco?quantidade=1': { total_centavos: 8000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [8000] }` e `'GET /placas/modelos/2/preco?quantidade=1': { total_centavos: 10000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000] }`, e trocar o rótulo para `'Valor total das placas'` (use `await screen.findByDisplayValue('100,00')` para esperar a resposta).

3. Acrescentar:

```jsx
  const MODELO = { id: 2, nome: 'Placa 10x15', ativo: 1, preco_venda_centavos: 10000 };

  it('com cliente que já comprou, preenche o preço de recompra e mostra a etiqueta', async () => {
    mockApi({
      'GET /placas/modelos': [MODELO],
      'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=7': { total_centavos: 8000, ja_comprou: 1, recompra: true, preco_por_placa_centavos: [8000] },
      'GET /placas/modelos/2/preco?quantidade=2&cliente_id=7': { total_centavos: 15000, ja_comprou: 1, recompra: true, preco_por_placa_centavos: [8000, 7000] },
    });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} clienteId={7} onChange={(v) => emitidos.push(v)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    const quantidade = screen.getByLabelText('Quantidade de placas');
    await user.clear(quantidade);
    await user.type(quantidade, '2');
    expect(await screen.findByDisplayValue('150,00')).toBeInTheDocument();
    expect(screen.getByText('Cliente já comprou 1 placa — preço de recompra')).toBeInTheDocument();
    expect(emitidos.at(-1).servicos[0]).toEqual({ tipo: 'placas_nfc', modelo_id: 2, quantidade: 2, valor_total_centavos: 15000 });
  });

  it('valor editado à mão não é sobrescrito; o link restaura o sugerido', async () => {
    mockApi({
      'GET /placas/modelos': [MODELO],
      'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=1': { total_centavos: 10000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000] },
      'GET /placas/modelos/2/preco?quantidade=2': { total_centavos: 18000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000, 8000] },
    });
    renderizar(<CamposServicos servicos={[]} desconto={0} clienteId={null} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    const valor = screen.getByLabelText('Valor total das placas');
    await user.clear(valor);
    await user.type(valor, '170');
    const quantidade = screen.getByLabelText('Quantidade de placas');
    await user.clear(quantidade);
    await user.type(quantidade, '2');
    const link = await screen.findByRole('button', { name: 'usar preço sugerido (R$ 180,00)' });
    expect(valor).toHaveValue('170');
    await user.click(link);
    expect(valor).toHaveValue('180,00');
    expect(screen.getByText('Preço de pack')).toBeInTheDocument();
  });

  it('linha existente carrega o total salvo e não é sobrescrita pela sugestão', async () => {
    mockApi({
      'GET /placas/modelos': [MODELO],
      'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=3&cliente_id=7&projeto_id=9': { total_centavos: 25000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000, 8000, 7000] },
    });
    renderizar(
      <CamposServicos
        servicos={[{ tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_unitario_centavos: 6667, valor_total_centavos: 20000 }]}
        desconto={0} clienteId={7} projetoId={9} onChange={() => {}}
      />,
    );
    expect(await screen.findByRole('button', { name: 'usar preço sugerido (R$ 250,00)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Valor total das placas')).toHaveValue('200,00');
    expect(screen.getByText(/Subtotal: R\$ 200,00/)).toBeInTheDocument();
  });

  it('se a consulta de preço falhar, mantém o valor atual', async () => {
    mockApi({ 'GET /placas/modelos': [MODELO], 'GET /config': {} });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    await userEvent.setup().click(await screen.findByLabelText('Placas NFC'));
    expect(screen.getByLabelText('Valor total das placas')).toHaveValue('100,00');
  });

  it('quantidade vazia não consulta preço', async () => {
    const api = mockApi({
      'GET /placas/modelos': [MODELO], 'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=1': { total_centavos: 10000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000] },
    });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    await user.clear(screen.getByLabelText('Quantidade de placas'));
    expect(api.chamadas.filter((c) => c.caminho.includes('quantidade=0') || c.caminho.endsWith('quantidade='))).toEqual([]);
  });
```

Em `web/src/pages/projeto/Projeto.test.jsx`, acrescentar um teste no mesmo `describe` dos de serviços (seguindo o mesmo jeito de renderizar/salvar dos testes das linhas 85–118) que monta um projeto com `servicos: [{ id: 1, tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_unitario_centavos: 6667, valor_total_centavos: 20000, venda_id: null, modelo_nome: 'Placa 10x15' }]`, mocka `'GET /placas/modelos': [{ id: 2, nome: 'Placa 10x15', ativo: 1, preco_venda_centavos: 10000 }]`, salva a aba sem mexer nos serviços e verifica:

```js
    expect(put.corpo.servicos).toEqual([{ tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_unitario_centavos: 6667, valor_total_centavos: 20000 }]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/components/CamposServicos.test.jsx web/src/pages/projeto/Projeto.test.jsx`
Expected: FAIL — rótulo "Valor total das placas" não existe; `valor_total_centavos` ausente no PUT.

- [ ] **Step 3: Implement**

Reescrever `web/src/components/CamposServicos.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO } from '../lib/rotulos.js';
import { apenasAtivos } from '../lib/ativos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function linhaInicial(tipo, modelos, config) {
  if (tipo === 'placas_nfc') {
    const modelo = apenasAtivos(modelos)[0];
    return {
      tipo, modelo_id: modelo ? String(modelo.id) : '', quantidade: '1',
      valor: modelo ? centavosParaTexto(modelo.preco_venda_centavos) : '0,00', manual: false, sugerido: null,
    };
  }
  const precoPadrao = config?.[`preco_servico_${tipo}_centavos`] ?? 0;
  return { tipo, modelo_id: '', quantidade: '1', valor: centavosParaTexto(precoPadrao) };
}

function linhaExistente(s) {
  if (s.tipo !== 'placas_nfc') {
    return { tipo: s.tipo, modelo_id: '', quantidade: '1', valor: centavosParaTexto(s.valor_unitario_centavos ?? 0) };
  }
  const total = s.valor_total_centavos ?? (s.valor_unitario_centavos ?? 0) * (s.quantidade ?? 1);
  return {
    tipo: s.tipo, modelo_id: s.modelo_id ? String(s.modelo_id) : '', quantidade: String(s.quantidade ?? 1),
    valor: centavosParaTexto(total), manual: true, sugerido: null,
  };
}

function paraSaida(linhas, descontoTexto) {
  return {
    servicos: linhas.map((l) => (
      l.tipo === 'placas_nfc'
        ? { tipo: l.tipo, modelo_id: Number(l.modelo_id) || null, quantidade: Number(l.quantidade) || 1, valor_total_centavos: paraCentavos(l.valor) || 0 }
        : { tipo: l.tipo, valor_unitario_centavos: paraCentavos(l.valor) || 0 }
    )),
    desconto_centavos: paraCentavos(descontoTexto) || 0,
  };
}

function etiquetaPlacas(linha) {
  if (!linha.sugerido) return null;
  if (linha.sugerido.recompra) {
    const n = linha.sugerido.ja_comprou;
    return `Cliente já comprou ${n} ${n === 1 ? 'placa' : 'placas'} — preço de recompra`;
  }
  return Number(linha.quantidade) >= 2 ? 'Preço de pack' : null;
}

export function CamposServicos({ servicos, desconto, clienteId = null, projetoId = null, onChange }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: config } = useCarregar(() => api('/config'), []);
  const [linhas, setLinhas] = useState((servicos ?? []).map(linhaExistente));
  const [descontoTexto, setDescontoTexto] = useState(centavosParaTexto(desconto ?? 0));
  const linhasRef = useRef(linhas);
  const descontoRef = useRef(descontoTexto);

  function aplicar(proximas, proximoDesconto = descontoRef.current) {
    linhasRef.current = proximas;
    descontoRef.current = proximoDesconto;
    setLinhas(proximas);
    setDescontoTexto(proximoDesconto);
    onChange(paraSaida(proximas, proximoDesconto));
  }

  const placas = linhas.find((l) => l.tipo === 'placas_nfc');
  const quantidadePlacas = Number(placas?.quantidade);
  const chavePreco = placas && placas.modelo_id && Number.isInteger(quantidadePlacas) && quantidadePlacas >= 1
    ? `${placas.modelo_id}|${quantidadePlacas}|${clienteId ?? ''}|${projetoId ?? ''}`
    : null;

  useEffect(() => {
    if (!chavePreco) return undefined;
    let ativo = true;
    const [modeloId, quantidade] = chavePreco.split('|');
    const params = new URLSearchParams({ quantidade });
    if (clienteId) params.set('cliente_id', String(clienteId));
    if (projetoId) params.set('projeto_id', String(projetoId));
    api(`/placas/modelos/${modeloId}/preco?${params}`).then(
      (sugerido) => {
        if (!ativo) return;
        aplicar(linhasRef.current.map((l) => (
          l.tipo !== 'placas_nfc' ? l : { ...l, sugerido, valor: l.manual ? l.valor : centavosParaTexto(sugerido.total_centavos) }
        )));
      },
      () => {},
    );
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavePreco]);

  function alternar(tipo, marcado) {
    const atuais = linhasRef.current;
    aplicar(marcado ? [...atuais, linhaInicial(tipo, modelos, config)] : atuais.filter((l) => l.tipo !== tipo));
  }

  function alterarLinha(tipo, campo, valor) {
    aplicar(linhasRef.current.map((l) => {
      if (l.tipo !== tipo) return l;
      if (campo === 'valor' && tipo === 'placas_nfc') return { ...l, valor, manual: true };
      return { ...l, [campo]: valor };
    }));
  }

  function usarSugerido() {
    aplicar(linhasRef.current.map((l) => (
      l.tipo === 'placas_nfc' && l.sugerido ? { ...l, manual: false, valor: centavosParaTexto(l.sugerido.total_centavos) } : l
    )));
  }

  const subtotal = linhas.reduce((soma, l) => soma + (paraCentavos(l.valor) || 0), 0);
  const total = Math.max(0, subtotal - (paraCentavos(descontoTexto) || 0));

  return (
    <div className="campos-servicos">
      <fieldset>
        <legend>Serviços</legend>
        {TIPOS_SERVICO.map((tipo) => {
          const linha = linhas.find((l) => l.tipo === tipo);
          const ehPlacas = tipo === 'placas_nfc';
          const sugeridoDiferente = ehPlacas && linha?.manual && linha.sugerido
            && paraCentavos(linha.valor) !== linha.sugerido.total_centavos;
          const etiqueta = ehPlacas && linha ? etiquetaPlacas(linha) : null;
          return (
            <div className="campos-servicos__linha" key={tipo}>
              <label>
                <input type="checkbox" checked={Boolean(linha)} onChange={(e) => alternar(tipo, e.target.checked)} />{' '}
                {ROTULO_TIPO_SERVICO[tipo]}
              </label>
              {linha && ehPlacas && (
                <>
                  <select aria-label="Modelo da placa" value={linha.modelo_id} onChange={(e) => alterarLinha(tipo, 'modelo_id', e.target.value)}>
                    <option value="">Selecione…</option>
                    {apenasAtivos(modelos, linha.modelo_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <input aria-label="Quantidade de placas" type="number" min="1" value={linha.quantidade} onChange={(e) => alterarLinha(tipo, 'quantidade', e.target.value)} />
                </>
              )}
              {linha && (
                <input
                  aria-label={ehPlacas ? 'Valor total das placas' : `Valor de ${ROTULO_TIPO_SERVICO[tipo]}`}
                  inputMode="decimal"
                  value={linha.valor}
                  onChange={(e) => alterarLinha(tipo, 'valor', e.target.value)}
                />
              )}
              {sugeridoDiferente && (
                <button type="button" className="btn btn--fantasma btn--pequeno" onClick={usarSugerido}>
                  {`usar preço sugerido (${formatarDinheiro(linha.sugerido.total_centavos)})`}
                </button>
              )}
              {etiqueta && <span className="campos-servicos__etiqueta">{etiqueta}</span>}
            </div>
          );
        })}
      </fieldset>
      <div className="campos-servicos__linha">
        <label htmlFor="campos-servicos-desconto">Desconto (R$)</label>
        <input id="campos-servicos-desconto" inputMode="decimal" value={descontoTexto} onChange={(e) => aplicar(linhasRef.current, e.target.value)} />
      </div>
      <p className="campos-servicos__total">Subtotal: {formatarDinheiro(subtotal)} — Total: {formatarDinheiro(total)}</p>
    </div>
  );
}
```

Notas:
- `formatarDinheiro` usa `Intl` pt-BR, que separa "R$" e o número com espaço não separável (` `). Se os testes por nome do botão/texto falharem só por isso, ajuste as expectativas para regex (`/usar preço sugerido \(R\$\s180,00\)/`), como o teste de subtotal já faz.
- Trocar de modelo **não** muda mais o valor diretamente: a consulta de preço do modelo novo faz isso (se a linha não estiver em modo manual).

Em `web/src/components/FormOportunidade.jsx`, no `<CamposServicos`, adicionar a prop:

```jsx
        clienteId={valores.cliente_id && valores.cliente_id !== 'novo' ? Number(valores.cliente_id) : null}
```

Em `web/src/pages/projeto/AbaGeral.jsx`:
- Linha 33: incluir `valor_total_centavos: s.valor_total_centavos` no objeto mapeado (fica `{ tipo, modelo_id, quantidade, valor_unitario_centavos, valor_total_centavos }`).
- No `<CamposServicos`, adicionar `clienteId={Number(valores.cliente_id) || null}` e `projetoId={projeto.id}`.

Se `valor_total_centavos` for `null` (serviços que não são placas), o objeto enviado no PUT leva `valor_total_centavos: null`, o que o backend ignora (`!= null`). Se o teste existente de Projeto (linha 117) comparar `toEqual` com `{ tipo: 'google_meu_negocio', valor_unitario_centavos: 20000 }`, isso continua valendo porque esse corpo sai do `CamposServicos` (que só manda `valor_unitario_centavos` para não-placas). Se algum teste comparar o corpo inicial de saas vindo direto do mapeamento da linha 33, inclua `valor_total_centavos: null` só nesse objeto — ou mapeie a linha 33 com `...(s.tipo === 'placas_nfc' ? { valor_total_centavos: s.valor_total_centavos } : {})` para não mudar o formato dos outros tipos (preferível).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS (inclusive `Funil.test.jsx` e `Projeto.test.jsx` existentes; consultas de preço sem mock caem no 404 e são ignoradas).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/CamposServicos.jsx web/src/components/CamposServicos.test.jsx web/src/components/FormOportunidade.jsx web/src/pages/projeto/AbaGeral.jsx web/src/pages/projeto/Projeto.test.jsx
git commit -m "feat: oportunidade sugere preco de pack ou recompra na linha de placas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificação final e ativação

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa**

Run: `npm test`
Expected: todos os testes de `server` e `web` passando, 0 falhas.

- [ ] **Step 2: Reiniciar a API (pm2 sem watch)**

Run: `pm2 restart crm-madia-api`
Expected: processo `online`; migration `014_placas_packs.sql` aplicada (conferir com `pm2 logs crm-madia-api --lines 20 --nostream` sem erro de SQL).

- [ ] **Step 3: Conferência manual no app**

1. Placas → Modelos → editar "Placa 10x10 PVC": packs 2 = 140,00 e 3 = 200,00. Prévia deve mostrar `1ª: R$ 80,00 · 2ª: R$ 60,00 · 3ª em diante: R$ 60,00`.
2. Mesmo para "10x15 Acrílico": 2 = 180,00, 3 = 250,00 → `1ª: R$ 100,00 · 2ª: R$ 80,00 · 3ª em diante: R$ 70,00`.
3. Funil → nova oportunidade para um cliente sem vendas de placa, Placas NFC 10x15 × 2 → valor R$ 180,00, etiqueta "Preço de pack".
4. Mesma coisa para um cliente que já tem venda de placa → valor de recompra e etiqueta "Cliente já comprou N placas — preço de recompra".
