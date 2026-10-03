# Placas de Avaliação Google Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Lucca um subsistema dentro do CRM-Madia para controlar a produção e venda das placas físicas de avaliação Google (QR + tag NFC): cadastro de materiais, lotes de compra (com estoque sempre calculado), modelos vendáveis (receita + preço), vendas (com comprador cadastrado ou avulso) e um resumo comparando lucro previsto x lucro real.

**Architecture:** Segue exatamente os padrões já usados no projeto — SQLite puro (`node:sqlite`) com migrations incrementais, repos genéricos (`criarRepo`) mais métodos customizados, rotas Express testadas via `supertest` (`ctx.http`), funções de domínio puras e testáveis (como `financeiro.js`), e páginas React com `useCarregar`/`useEnvio`/`useFormulario` + componentes `Campo`/`Aviso`/`Modal`, organizadas em abas (mesmo padrão de `pages/projeto/Projeto.jsx`).

**Tech Stack:** Node (`node:sqlite`, Express), React 19 + react-router, Vitest + Testing Library + Supertest.

## Global Constraints

- Backend é testado só via rotas HTTP com `ctx.http` (supertest) — sem testes unitários de repo isolados; é o padrão já usado em todo o projeto (nenhum arquivo em `server/repos/*.test.js` existe hoje), exceto as funções puras de domínio, que têm teste unitário próprio (mesmo padrão de `financeiro.test.js`).
- Custo unitário de um material = custo do **último lote comprado** daquele material (maior `data_compra`, desempate por `id`), nunca uma média histórica (spec, "Decisões confirmadas com o Lucca").
- Estoque de um material é **sempre derivado** (soma de `quantidade` dos lotes − consumo pelas vendas via receita do modelo), nunca um campo mutável salvo no banco (spec, "Modelo de dados").
- Vendas dão baixa automática no estoque (por ser sempre recalculado) e **nunca bloqueiam** por estoque insuficiente — apenas avisam via `avisos_estoque` na resposta do `POST /placas/vendas` (spec, "Decisões confirmadas com o Lucca").
- Cada lote de compra é **por material, independente** — nunca exigir que um lote inclua todos os materiais de um modelo; nem todo lote de placa vem acompanhado de um lote de adesivo (spec, "Decisões confirmadas com o Lucca").
- `placas_vendas.custo_unitario_centavos` é sempre um **snapshot** gravado na criação da venda — nunca recalculado depois, mesmo que o custo do material mude (spec, "Modelo de dados").
- Uma venda tem exatamente um comprador: `cliente_id` (cadastrado) **ou** `comprador_nome` (avulso) — nunca os dois, nunca nenhum (spec, "Rotas").
- Seguir as convenções de nomes em português já usadas no projeto (arquivos, variáveis, mensagens de erro, rótulos), e os formatos monetários (`*_centavos` inteiro, `formatarDinheiro`/`paraCentavos`/`centavosParaTexto`).

## File Structure

**Backend:**
- `server/db/migrations/008_placas.sql` — schema das 5 tabelas novas.
- `server/domain/placas.js` + `.test.js` — funções puras de custo, estoque e lucro.
- `server/repos/placas.js` — 5 repos finos (`criarRepo` + filtros customizados).
- `server/routes/placas.js` + `.test.js` — todas as rotas `/api/placas/*`, construído incrementalmente (Tasks 2-6).
- `server/app.js` — modificado para montar `rotasPlacas`.

**Frontend:**
- `web/src/pages/Placas.jsx` + `.test.jsx` — shell com abas, construído incrementalmente (Tasks 7-11).
- `web/src/pages/placas/AbaResumo.jsx`, `AbaMateriais.jsx`, `AbaLotes.jsx`, `AbaModelos.jsx`, `AbaVendas.jsx`.
- `web/src/components/FormPlacaMaterial.jsx`, `FormPlacaLote.jsx`, `FormPlacaModelo.jsx`, `FormPlacaVenda.jsx`.
- `web/src/App.jsx` — modificado para adicionar navegação e rota `/placas`.

---

### Task 1: Schema das tabelas + funções de domínio (custo, estoque, lucro)

**Files:**
- Create: `server/db/migrations/008_placas.sql`
- Create: `server/domain/placas.js`
- Create: `server/domain/placas.test.js`

**Interfaces:**
- Produces: tabelas `placas_materiais`, `placas_lotes`, `placas_modelos`, `placas_modelos_itens`, `placas_vendas` — consumidas pelas Tasks 2-6 (via repos).
- Produces (de `server/domain/placas.js`): `custoUnitarioLote(lote)` → `number`; `custoAtualMaterial(materialId, lotes)` → `number | null`; `totalCompradoMaterial(materialId, lotes)` → `number`; `quantidadeConsumidaMaterial(materialId, vendas, itensModelo)` → `number`; `estoqueMaterial(materialId, lotes, vendas, itensModelo)` → `number`; `custoReceitaModelo(modeloId, itensModelo, lotes)` → `number | null`; `lucroPrevisto(modelo, custoReceitaCentavos)` → `number | null`; `lucroRealVenda(venda)` → `number`; `resumoLucroReal(vendas)` → `Array<{modelo_id, quantidade, lucro_total_centavos, lucro_medio_centavos}>`; `materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo)` → `Array<material & {estoque_atual}>`. Todas consumidas pelas Tasks 2-6.

- [ ] **Step 1: Escrever os testes de domínio (falhando)**

Criar `server/domain/placas.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  custoUnitarioLote, custoAtualMaterial, estoqueMaterial, custoReceitaModelo,
  lucroPrevisto, lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
} from './placas.js';

const PLACA = 1;
const ADESIVO_10x10 = 2;
const TAG_NFC = 3;
const PLACA_10x15 = 4;
const ADESIVO_10x15 = 5;
const MODELO_10x10 = 10;
const MODELO_10x15 = 20;

const lotes = [
  { id: 1, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' },
  { id: 2, material_id: ADESIVO_10x10, quantidade: 81, valor_kit_centavos: 3000, valor_frete_centavos: 0, data_compra: '2026-09-01' },
  { id: 3, material_id: TAG_NFC, quantidade: 50, valor_kit_centavos: 4497, valor_frete_centavos: 0, data_compra: '2026-09-01' },
  { id: 4, material_id: PLACA_10x15, quantidade: 10, valor_kit_centavos: 15000, valor_frete_centavos: 4092, data_compra: '2026-09-01' },
  { id: 5, material_id: ADESIVO_10x15, quantidade: 54, valor_kit_centavos: 3000, valor_frete_centavos: 0, data_compra: '2026-09-01' },
];

const itensModelo = [
  { id: 1, modelo_id: MODELO_10x10, material_id: PLACA, quantidade: 1 },
  { id: 2, modelo_id: MODELO_10x10, material_id: ADESIVO_10x10, quantidade: 1 },
  { id: 3, modelo_id: MODELO_10x10, material_id: TAG_NFC, quantidade: 1 },
  { id: 4, modelo_id: MODELO_10x15, material_id: PLACA_10x15, quantidade: 1 },
  { id: 5, modelo_id: MODELO_10x15, material_id: ADESIVO_10x15, quantidade: 1 },
  { id: 6, modelo_id: MODELO_10x15, material_id: TAG_NFC, quantidade: 1 },
];

describe('custoUnitarioLote', () => {
  it('divide kit + frete pela quantidade, arredondando', () => {
    expect(custoUnitarioLote({ quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0 })).toBe(249);
    expect(custoUnitarioLote({ quantidade: 81, valor_kit_centavos: 3000, valor_frete_centavos: 0 })).toBe(37);
    expect(custoUnitarioLote({ quantidade: 10, valor_kit_centavos: 15000, valor_frete_centavos: 4092 })).toBe(1909);
  });
});

describe('custoAtualMaterial', () => {
  it('usa o lote mais recente por data_compra', () => {
    const doisLotes = [
      { id: 1, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' },
      { id: 2, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2600, valor_frete_centavos: 0, data_compra: '2026-10-01' },
    ];
    expect(custoAtualMaterial(PLACA, doisLotes)).toBe(260);
  });

  it('desempata por id quando a data é igual', () => {
    const doisLotes = [
      { id: 1, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' },
      { id: 2, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2600, valor_frete_centavos: 0, data_compra: '2026-09-01' },
    ];
    expect(custoAtualMaterial(PLACA, doisLotes)).toBe(260);
  });

  it('retorna null quando o material não tem lote', () => {
    expect(custoAtualMaterial(999, lotes)).toBeNull();
  });
});

describe('estoqueMaterial', () => {
  it('soma os lotes e subtrai o consumo das vendas', () => {
    const vendas = [{ modelo_id: MODELO_10x10, quantidade: 3 }];
    expect(estoqueMaterial(ADESIVO_10x10, lotes, vendas, itensModelo)).toBe(81 - 3);
  });

  it('fica negativo quando vende mais do que o estoque', () => {
    const vendas = [{ modelo_id: MODELO_10x10, quantidade: 15 }];
    expect(estoqueMaterial(PLACA, lotes, vendas, itensModelo)).toBe(10 - 15);
  });

  it('ignora vendas de modelo que não usa o material', () => {
    const vendas = [{ modelo_id: MODELO_10x15, quantidade: 5 }];
    expect(estoqueMaterial(PLACA, lotes, vendas, itensModelo)).toBe(10);
  });
});

describe('custoReceitaModelo', () => {
  it('reproduz o custo montado da planilha: placa 10x10 = R$ 3,76', () => {
    expect(custoReceitaModelo(MODELO_10x10, itensModelo, lotes)).toBe(376);
  });

  it('reproduz o custo montado da planilha: placa 10x15 = R$ 20,55', () => {
    expect(custoReceitaModelo(MODELO_10x15, itensModelo, lotes)).toBe(2055);
  });

  it('retorna null se algum material da receita não tem lote', () => {
    const itensSemLote = [{ modelo_id: 99, material_id: 999, quantidade: 1 }];
    expect(custoReceitaModelo(99, itensSemLote, lotes)).toBeNull();
  });

  it('retorna null se o modelo não tem receita', () => {
    expect(custoReceitaModelo(999, itensModelo, lotes)).toBeNull();
  });
});

describe('lucroPrevisto', () => {
  it('reproduz o lucro previsto da planilha: placa 10x10 = R$ 76,24', () => {
    const modelo = { preco_venda_centavos: 8000 };
    expect(lucroPrevisto(modelo, custoReceitaModelo(MODELO_10x10, itensModelo, lotes))).toBe(7624);
  });

  it('reproduz o lucro previsto da planilha: placa 10x15 = R$ 79,45', () => {
    const modelo = { preco_venda_centavos: 10000 };
    expect(lucroPrevisto(modelo, custoReceitaModelo(MODELO_10x15, itensModelo, lotes))).toBe(7945);
  });

  it('retorna null quando o custo não é calculável', () => {
    expect(lucroPrevisto({ preco_venda_centavos: 8000 }, null)).toBeNull();
  });
});

describe('lucroRealVenda e resumoLucroReal', () => {
  const vendas = [
    { modelo_id: MODELO_10x10, quantidade: 1, preco_vendido_centavos: 8000, custo_unitario_centavos: 376 },
    { modelo_id: MODELO_10x10, quantidade: 2, preco_vendido_centavos: 7500, custo_unitario_centavos: 376 },
    { modelo_id: MODELO_10x15, quantidade: 1, preco_vendido_centavos: 10000, custo_unitario_centavos: 2055 },
  ];

  it('lucroRealVenda multiplica pela quantidade', () => {
    expect(lucroRealVenda(vendas[1])).toBe((7500 - 376) * 2);
  });

  it('resumoLucroReal agrupa por modelo com total e média por unidade', () => {
    const resumo = resumoLucroReal(vendas);
    const do10x10 = resumo.find((r) => r.modelo_id === MODELO_10x10);
    expect(do10x10.quantidade).toBe(3);
    expect(do10x10.lucro_total_centavos).toBe((8000 - 376) + (7500 - 376) * 2);
    expect(do10x10.lucro_medio_centavos).toBe(Math.round(do10x10.lucro_total_centavos / 3));

    const do10x15 = resumo.find((r) => r.modelo_id === MODELO_10x15);
    expect(do10x15.quantidade).toBe(1);
    expect(do10x15.lucro_total_centavos).toBe(10000 - 2055);
  });
});

describe('materiaisComEstoqueNegativo', () => {
  it('lista só os materiais com estoque abaixo de zero', () => {
    const materiais = [{ id: PLACA, nome: 'Placa 10x10 PVC' }, { id: ADESIVO_10x10, nome: 'Adesivo 10x10' }];
    const vendas = [{ modelo_id: MODELO_10x10, quantidade: 15 }];
    const resultado = materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo);
    expect(resultado.map((m) => m.id)).toEqual([PLACA]);
    expect(resultado[0].estoque_atual).toBe(10 - 15);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/domain/placas.test.js`
Esperado: FAIL — `Cannot find module './placas.js'`.

- [ ] **Step 3: Criar a migration**

Criar `server/db/migrations/008_placas.sql`:

```sql
CREATE TABLE placas_materiais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE placas_lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES placas_materiais(id),
  nome_lote TEXT,
  quantidade INTEGER NOT NULL,
  valor_kit_centavos INTEGER NOT NULL,
  valor_frete_centavos INTEGER NOT NULL DEFAULT 0,
  data_compra TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE placas_modelos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  preco_venda_centavos INTEGER NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE placas_modelos_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id),
  material_id INTEGER NOT NULL REFERENCES placas_materiais(id),
  quantidade INTEGER NOT NULL
);

CREATE TABLE placas_vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_vendido_centavos INTEGER NOT NULL,
  custo_unitario_centavos INTEGER NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id),
  comprador_nome TEXT,
  data_venda TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
```

- [ ] **Step 4: Implementar as funções de domínio**

Criar `server/domain/placas.js`:

```js
export function custoUnitarioLote(lote) {
  return Math.round((lote.valor_kit_centavos + lote.valor_frete_centavos) / lote.quantidade);
}

export function custoAtualMaterial(materialId, lotes) {
  const doMaterial = lotes.filter((l) => l.material_id === materialId);
  if (!doMaterial.length) return null;
  const maisRecente = doMaterial.reduce((a, b) => {
    if (a.data_compra !== b.data_compra) return a.data_compra > b.data_compra ? a : b;
    return a.id > b.id ? a : b;
  });
  return custoUnitarioLote(maisRecente);
}

export function totalCompradoMaterial(materialId, lotes) {
  return lotes.filter((l) => l.material_id === materialId).reduce((soma, l) => soma + l.quantidade, 0);
}

export function quantidadeConsumidaMaterial(materialId, vendas, itensModelo) {
  return vendas.reduce((soma, venda) => {
    const porUnidade = itensModelo
      .filter((i) => i.modelo_id === venda.modelo_id && i.material_id === materialId)
      .reduce((s, i) => s + i.quantidade, 0);
    return soma + porUnidade * venda.quantidade;
  }, 0);
}

export function estoqueMaterial(materialId, lotes, vendas, itensModelo) {
  return totalCompradoMaterial(materialId, lotes) - quantidadeConsumidaMaterial(materialId, vendas, itensModelo);
}

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

export function lucroPrevisto(modelo, custoReceitaCentavos) {
  if (custoReceitaCentavos === null) return null;
  return modelo.preco_venda_centavos - custoReceitaCentavos;
}

export function lucroRealVenda(venda) {
  return (venda.preco_vendido_centavos - venda.custo_unitario_centavos) * venda.quantidade;
}

export function resumoLucroReal(vendas) {
  const porModelo = new Map();
  for (const venda of vendas) {
    const atual = porModelo.get(venda.modelo_id) ?? { modelo_id: venda.modelo_id, quantidade: 0, lucro_total_centavos: 0 };
    atual.quantidade += venda.quantidade;
    atual.lucro_total_centavos += lucroRealVenda(venda);
    porModelo.set(venda.modelo_id, atual);
  }
  return [...porModelo.values()].map((r) => ({ ...r, lucro_medio_centavos: Math.round(r.lucro_total_centavos / r.quantidade) }));
}

export function materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo) {
  return materiais
    .map((m) => ({ ...m, estoque_atual: estoqueMaterial(m.id, lotes, vendas, itensModelo) }))
    .filter((m) => m.estoque_atual < 0);
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Rodar: `npx vitest run server/domain/placas.test.js`
Esperado: PASS (14 testes).

- [ ] **Step 6: Rodar a suíte completa (confirma que a migration aplica sem erro)**

Rodar: `npx vitest run`
Esperado: PASS — `server/db/connection.test.js` continua passando, confirmando que a migration 008 é aplicada sem quebrar o schema existente.

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/008_placas.sql server/domain/placas.js server/domain/placas.test.js
git commit -m "feat: schema e cálculos de custo/estoque/lucro das placas de avaliação"
```

---

### Task 2: Repos + rotas de Materiais

**Files:**
- Create: `server/repos/placas.js`
- Create: `server/routes/placas.js`
- Create: `server/routes/placas.test.js`
- Modify: `server/app.js`

**Interfaces:**
- Consumes: `custoAtualMaterial`, `estoqueMaterial` (Task 1).
- Produces (de `server/repos/placas.js`): `repoPlacasMateriais(db)`, `repoPlacasLotes(db)`, `repoPlacasModelos(db)`, `repoPlacasModelosItens(db)`, `repoPlacasVendas(db)` — consumidos pelas Tasks 3-6. `repoPlacasModelosItens(db)` expõe `removerPorModelo(modeloId)`, consumido pela Task 4.
- Produces: `rotasPlacas({ db })` montada em `/api` — rotas `GET/POST/PUT/DELETE /placas/materiais[/:id]`. A mesma função e o mesmo `Router` (`r`) são estendidos nas Tasks 3-6.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `server/routes/placas.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

async function criarMaterial(overrides = {}) {
  return (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa 10x10 PVC', ...overrides }).expect(201)).body;
}

describe('/api/placas/materiais', () => {
  it('cria e lista com estoque zerado e sem custo', async () => {
    await criarMaterial();
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: null });
  });

  it('exige nome', async () => {
    const res = await ctx.http.post('/api/placas/materiais').send({}).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
  });

  it('atualiza o nome', async () => {
    const material = await criarMaterial();
    const res = await ctx.http.put(`/api/placas/materiais/${material.id}`).send({ nome: 'Placa PVC 10x10' }).expect(200);
    expect(res.body.nome).toBe('Placa PVC 10x10');
  });

  it('responde 404 ao atualizar id inexistente', async () => {
    await ctx.http.put('/api/placas/materiais/999').send({ nome: 'X' }).expect(404);
  });

  it('exclui material sem vínculo', async () => {
    const material = await criarMaterial();
    await ctx.http.delete(`/api/placas/materiais/${material.id}`).expect(204);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body).toEqual([]);
  });

  it('responde 404 ao excluir id inexistente', async () => {
    await ctx.http.delete('/api/placas/materiais/999').expect(404);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: FAIL — `Cannot find module '../repos/placas.js'`.

- [ ] **Step 3: Criar os repos**

Criar `server/repos/placas.js`:

```js
import { criarRepo } from './crud.js';

export const CAMPOS_MATERIAL = ['nome'];
export function repoPlacasMateriais(db) {
  const base = criarRepo(db, 'placas_materiais', CAMPOS_MATERIAL);
  return { ...base, listar: () => base.listar({}, 'nome COLLATE NOCASE') };
}

export const CAMPOS_LOTE = ['material_id', 'nome_lote', 'quantidade', 'valor_kit_centavos', 'valor_frete_centavos', 'data_compra'];
export function repoPlacasLotes(db) {
  const base = criarRepo(db, 'placas_lotes', CAMPOS_LOTE);
  return {
    ...base,
    listar({ material_id } = {}) {
      const filtro = {};
      if (material_id) filtro.material_id = Number(material_id);
      return base.listar(filtro, 'data_compra DESC, id DESC');
    },
  };
}

export const CAMPOS_MODELO = ['nome', 'preco_venda_centavos'];
export function repoPlacasModelos(db) {
  const base = criarRepo(db, 'placas_modelos', CAMPOS_MODELO);
  return { ...base, listar: () => base.listar({}, 'nome COLLATE NOCASE') };
}

export const CAMPOS_ITEM = ['modelo_id', 'material_id', 'quantidade'];
export function repoPlacasModelosItens(db) {
  const base = criarRepo(db, 'placas_modelos_itens', CAMPOS_ITEM);
  return {
    ...base,
    listar({ modelo_id } = {}) {
      const filtro = {};
      if (modelo_id) filtro.modelo_id = Number(modelo_id);
      return base.listar(filtro, 'id');
    },
    removerPorModelo(modeloId) {
      db.prepare('DELETE FROM placas_modelos_itens WHERE modelo_id = ?').run(modeloId);
    },
  };
}

export const CAMPOS_VENDA = [
  'modelo_id', 'quantidade', 'preco_vendido_centavos', 'custo_unitario_centavos',
  'cliente_id', 'comprador_nome', 'data_venda',
];
export function repoPlacasVendas(db) {
  const base = criarRepo(db, 'placas_vendas', CAMPOS_VENDA);
  return { ...base, listar: () => base.listar({}, 'data_venda DESC, id DESC') };
}
```

- [ ] **Step 4: Criar as rotas de materiais**

Criar `server/routes/placas.js`:

```js
import { Router } from 'express';
import { repoPlacasMateriais, repoPlacasLotes, repoPlacasModelosItens, repoPlacasVendas } from '../repos/placas.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { estoqueMaterial, custoAtualMaterial } from '../domain/placas.js';

const REGRAS_MATERIAL = {
  nome: { tipo: 'texto', obrigatorio: true },
};

export function rotasPlacas({ db }) {
  const materiais = repoPlacasMateriais(db);
  const lotes = repoPlacasLotes(db);
  const itensModelo = repoPlacasModelosItens(db);
  const vendas = repoPlacasVendas(db);
  const r = Router();

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

  r.get('/placas/materiais', (req, res) => {
    res.json(materiais.listar().map(comCalculo));
  });

  r.post('/placas/materiais', (req, res) => {
    const dados = validar(req.body, REGRAS_MATERIAL);
    res.status(201).json(comCalculo(materiais.criar(dados)));
  });

  r.put('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_MATERIAL, { parcial: true });
    const atualizado = materiais.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });

  r.delete('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!materiais.obter(id)) throw naoEncontrado('Material');
    if (lotes.listar({ material_id: id }).length) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
    }
    if (itensModelo.listar().some((i) => i.material_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material está usado na receita de um modelo' }]);
    }
    materiais.remover(id);
    res.status(204).end();
  });

  return r;
}
```

- [ ] **Step 5: Registrar a rota em `app.js`**

Em `server/app.js`, adicionar o import junto dos outros:

```js
import { rotasPlacas } from './routes/placas.js';
```

E a montagem junto das outras (logo após `rotasQrcodes`):

```js
  app.use('/api', rotasQrcodes(ctx));
  app.use('/api', rotasPlacas(ctx));
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: PASS (6 testes).

- [ ] **Step 7: Commit**

```bash
git add server/repos/placas.js server/routes/placas.js server/routes/placas.test.js server/app.js
git commit -m "feat: cadastro de materiais das placas de avaliação"
```

---

### Task 3: Rotas de Lotes de compra

**Files:**
- Modify: `server/routes/placas.js`
- Modify: `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `repoPlacasLotes(db)`, `rotasPlacas({ db })` (Task 2).
- Produces: `REGRAS_LOTE`, `GET/POST/PUT/DELETE /placas/lotes[/:id]` (filtro `?material_id=`) — consumidos pela Task 9 (frontend) e reaproveitados pelas Tasks 4-6 (mesma instância `lotes`).

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar em `server/routes/placas.test.js`, depois do `describe('/api/placas/materiais', ...)`:

```js
async function criarLote(materialId, overrides = {}) {
  return (await ctx.http.post('/api/placas/lotes').send({
    material_id: materialId, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0,
    data_compra: '2026-09-01', ...overrides,
  }).expect(201)).body;
}

describe('/api/placas/lotes', () => {
  it('cria e lista, calculando custo e estoque do material', async () => {
    const material = await criarMaterial();
    await criarLote(material.id);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body[0]).toMatchObject({ estoque_atual: 10, custo_unitario_atual: 249 });
  });

  it('aceita frete zero quando o campo não é informado', async () => {
    const material = await criarMaterial();
    const res = await ctx.http.post('/api/placas/lotes').send({
      material_id: material.id, quantidade: 10, valor_kit_centavos: 2490, data_compra: '2026-09-01',
    }).expect(201);
    expect(res.body.valor_frete_centavos).toBe(0);
  });

  it('recusa material_id inexistente', async () => {
    const res = await ctx.http.post('/api/placas/lotes').send({
      material_id: 999, quantidade: 10, valor_kit_centavos: 2490, data_compra: '2026-09-01',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'material_id', mensagem: 'Material não encontrado' }]);
  });

  it('filtra por material_id', async () => {
    const material = await criarMaterial();
    const outro = await criarMaterial({ nome: 'Adesivo 10x10' });
    const lote = await criarLote(material.id);
    await criarLote(outro.id);
    const res = await ctx.http.get(`/api/placas/lotes?material_id=${material.id}`).expect(200);
    expect(res.body.map((l) => l.id)).toEqual([lote.id]);
  });

  it('atualiza valores', async () => {
    const material = await criarMaterial();
    const lote = await criarLote(material.id);
    const res = await ctx.http.put(`/api/placas/lotes/${lote.id}`).send({ valor_frete_centavos: 500 }).expect(200);
    expect(res.body.valor_frete_centavos).toBe(500);
  });

  it('exclui o lote', async () => {
    const material = await criarMaterial();
    const lote = await criarLote(material.id);
    await ctx.http.delete(`/api/placas/lotes/${lote.id}`).expect(204);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body[0].estoque_atual).toBe(0);
  });

  it('responde 404 ao excluir id inexistente', async () => {
    await ctx.http.delete('/api/placas/lotes/999').expect(404);
  });
});

describe('/api/placas/materiais exclusão bloqueada por lote', () => {
  it('não exclui material com lote vinculado', async () => {
    const material = await criarMaterial();
    await criarLote(material.id);
    const res = await ctx.http.delete(`/api/placas/materiais/${material.id}`).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: FAIL — `POST /api/placas/lotes` não existe (404).

- [ ] **Step 3: Adicionar as rotas de lotes**

Em `server/routes/placas.js`, arquivo completo:

```js
import { Router } from 'express';
import { repoPlacasMateriais, repoPlacasLotes, repoPlacasModelosItens, repoPlacasVendas } from '../repos/placas.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { estoqueMaterial, custoAtualMaterial } from '../domain/placas.js';

const REGRAS_MATERIAL = {
  nome: { tipo: 'texto', obrigatorio: true },
};

const REGRAS_LOTE = {
  material_id: { tipo: 'inteiro', obrigatorio: true },
  nome_lote: { tipo: 'texto' },
  quantidade: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  valor_kit_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
  valor_frete_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  data_compra: { tipo: 'data', obrigatorio: true },
};

export function rotasPlacas({ db }) {
  const materiais = repoPlacasMateriais(db);
  const lotes = repoPlacasLotes(db);
  const itensModelo = repoPlacasModelosItens(db);
  const vendas = repoPlacasVendas(db);
  const r = Router();

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

  function exigirMaterial(materialId) {
    if (!materiais.obter(materialId)) {
      throw new ErroValidacao([{ campo: 'material_id', mensagem: 'Material não encontrado' }]);
    }
  }

  r.get('/placas/materiais', (req, res) => {
    res.json(materiais.listar().map(comCalculo));
  });

  r.post('/placas/materiais', (req, res) => {
    const dados = validar(req.body, REGRAS_MATERIAL);
    res.status(201).json(comCalculo(materiais.criar(dados)));
  });

  r.put('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_MATERIAL, { parcial: true });
    const atualizado = materiais.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });

  r.delete('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!materiais.obter(id)) throw naoEncontrado('Material');
    if (lotes.listar({ material_id: id }).length) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
    }
    if (itensModelo.listar().some((i) => i.material_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material está usado na receita de um modelo' }]);
    }
    materiais.remover(id);
    res.status(204).end();
  });

  r.get('/placas/lotes', (req, res) => {
    res.json(lotes.listar({ material_id: req.query.material_id }));
  });

  r.post('/placas/lotes', (req, res) => {
    const dados = validar(req.body, REGRAS_LOTE);
    exigirMaterial(dados.material_id);
    res.status(201).json(lotes.criar(dados));
  });

  r.put('/placas/lotes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_LOTE, { parcial: true });
    if (dados.material_id !== undefined) exigirMaterial(dados.material_id);
    const atualizado = lotes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Lote');
    res.json(atualizado);
  });

  r.delete('/placas/lotes/:id', (req, res) => {
    if (!lotes.remover(lerId(req.params.id))) throw naoEncontrado('Lote');
    res.status(204).end();
  });

  return r;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add server/routes/placas.js server/routes/placas.test.js
git commit -m "feat: lançamento de lotes de compra das placas de avaliação"
```

---

### Task 4: Rotas de Modelos (receita, custo e lucro previstos)

**Files:**
- Modify: `server/routes/placas.js`
- Modify: `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `repoPlacasModelos(db)`, `repoPlacasModelosItens(db).removerPorModelo` (Task 2); `custoReceitaModelo`, `lucroPrevisto` (Task 1); `emTransacao(db, fn)` (`server/repos/crud.js`, já existente no projeto).
- Produces: `REGRAS_MODELO`, `GET/POST/PUT/DELETE /placas/modelos[/:id]` (corpo aceita `itens: [{material_id, quantidade}]`, resposta inclui `itens`, `custo_previsto_centavos`, `lucro_previsto_centavos`) — consumidos pela Task 10 (frontend) e pela Task 5 (vendas usa a mesma instância `modelos`).

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar em `server/routes/placas.test.js`, depois do `describe('/api/placas/materiais exclusão bloqueada por lote', ...)`:

```js
async function criarModelo(itens, overrides = {}) {
  return (await ctx.http.post('/api/placas/modelos').send({
    nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, itens, ...overrides,
  }).expect(201)).body;
}

describe('/api/placas/modelos', () => {
  it('cria com receita e calcula custo/lucro previstos como na planilha', async () => {
    const placa = await criarMaterial({ nome: 'Placa 10x10 PVC' });
    const adesivo = await criarMaterial({ nome: 'Adesivo 10x10' });
    const tag = await criarMaterial({ nome: 'Tag NFC' });
    await criarLote(placa.id, { quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0 });
    await criarLote(adesivo.id, { quantidade: 81, valor_kit_centavos: 3000, valor_frete_centavos: 0 });
    await criarLote(tag.id, { quantidade: 50, valor_kit_centavos: 4497, valor_frete_centavos: 0 });

    const modelo = await criarModelo([
      { material_id: placa.id, quantidade: 1 },
      { material_id: adesivo.id, quantidade: 1 },
      { material_id: tag.id, quantidade: 1 },
    ]);
    expect(modelo.custo_previsto_centavos).toBe(376);
    expect(modelo.lucro_previsto_centavos).toBe(7624);
    expect(modelo.itens).toHaveLength(3);
  });

  it('custo previsto é null quando falta lote de algum material da receita', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    expect(modelo.custo_previsto_centavos).toBeNull();
    expect(modelo.lucro_previsto_centavos).toBeNull();
  });

  it('recusa item com material inexistente', async () => {
    const res = await ctx.http.post('/api/placas/modelos').send({
      nome: 'X', preco_venda_centavos: 100, itens: [{ material_id: 999, quantidade: 1 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'itens[0].material_id', mensagem: 'Material inválido' }]);
  });

  it('recusa item com quantidade menor que 1', async () => {
    const placa = await criarMaterial();
    const res = await ctx.http.post('/api/placas/modelos').send({
      nome: 'X', preco_venda_centavos: 100, itens: [{ material_id: placa.id, quantidade: 0 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'itens[0].quantidade', mensagem: 'Deve ser no mínimo 1' }]);
  });

  it('atualiza substituindo a receita inteira', async () => {
    const placa = await criarMaterial({ nome: 'Placa' });
    const outro = await criarMaterial({ nome: 'Outro material' });
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const res = await ctx.http.put(`/api/placas/modelos/${modelo.id}`).send({
      itens: [{ material_id: outro.id, quantidade: 2 }],
    }).expect(200);
    expect(res.body.itens).toEqual([expect.objectContaining({ material_id: outro.id, quantidade: 2 })]);
  });

  it('não exclui material usado na receita de um modelo', async () => {
    const placa = await criarMaterial();
    await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const res = await ctx.http.delete(`/api/placas/materiais/${placa.id}`).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'id', mensagem: 'Material está usado na receita de um modelo' }]);
  });

  it('exclui modelo sem vendas', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    await ctx.http.delete(`/api/placas/modelos/${modelo.id}`).expect(204);
  });

  it('responde 404 ao excluir modelo inexistente', async () => {
    await ctx.http.delete('/api/placas/modelos/999').expect(404);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: FAIL — `POST /api/placas/modelos` não existe (404).

- [ ] **Step 3: Adicionar as rotas de modelos**

Em `server/routes/placas.js`, arquivo completo:

```js
import { Router } from 'express';
import { repoPlacasMateriais, repoPlacasLotes, repoPlacasModelos, repoPlacasModelosItens, repoPlacasVendas } from '../repos/placas.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto } from '../domain/placas.js';

const REGRAS_MATERIAL = {
  nome: { tipo: 'texto', obrigatorio: true },
};

const REGRAS_LOTE = {
  material_id: { tipo: 'inteiro', obrigatorio: true },
  nome_lote: { tipo: 'texto' },
  quantidade: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  valor_kit_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
  valor_frete_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  data_compra: { tipo: 'data', obrigatorio: true },
};

const REGRAS_MODELO = {
  nome: { tipo: 'texto', obrigatorio: true },
  preco_venda_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
};

export function rotasPlacas({ db }) {
  const materiais = repoPlacasMateriais(db);
  const lotes = repoPlacasLotes(db);
  const modelos = repoPlacasModelos(db);
  const itensModelo = repoPlacasModelosItens(db);
  const vendas = repoPlacasVendas(db);
  const r = Router();

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

  function exigirMaterial(materialId) {
    if (!materiais.obter(materialId)) {
      throw new ErroValidacao([{ campo: 'material_id', mensagem: 'Material não encontrado' }]);
    }
  }

  function validarItens(itensBrutos) {
    if (!Array.isArray(itensBrutos)) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Deve ser uma lista' }]);
    return itensBrutos.map((item, i) => {
      const materialId = Number(item.material_id);
      const quantidade = Number(item.quantidade);
      if (!Number.isInteger(materialId) || materialId <= 0 || !materiais.obter(materialId)) {
        throw new ErroValidacao([{ campo: `itens[${i}].material_id`, mensagem: 'Material inválido' }]);
      }
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        throw new ErroValidacao([{ campo: `itens[${i}].quantidade`, mensagem: 'Deve ser no mínimo 1' }]);
      }
      return { material_id: materialId, quantidade };
    });
  }

  function montarModelo(modelo) {
    const todosItens = itensModelo.listar();
    const custoReceita = custoReceitaModelo(modelo.id, todosItens, lotes.listar());
    return {
      ...modelo,
      itens: todosItens.filter((i) => i.modelo_id === modelo.id),
      custo_previsto_centavos: custoReceita,
      lucro_previsto_centavos: lucroPrevisto(modelo, custoReceita),
    };
  }

  r.get('/placas/materiais', (req, res) => {
    res.json(materiais.listar().map(comCalculo));
  });

  r.post('/placas/materiais', (req, res) => {
    const dados = validar(req.body, REGRAS_MATERIAL);
    res.status(201).json(comCalculo(materiais.criar(dados)));
  });

  r.put('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_MATERIAL, { parcial: true });
    const atualizado = materiais.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });

  r.delete('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!materiais.obter(id)) throw naoEncontrado('Material');
    if (lotes.listar({ material_id: id }).length) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
    }
    if (itensModelo.listar().some((i) => i.material_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material está usado na receita de um modelo' }]);
    }
    materiais.remover(id);
    res.status(204).end();
  });

  r.get('/placas/lotes', (req, res) => {
    res.json(lotes.listar({ material_id: req.query.material_id }));
  });

  r.post('/placas/lotes', (req, res) => {
    const dados = validar(req.body, REGRAS_LOTE);
    exigirMaterial(dados.material_id);
    res.status(201).json(lotes.criar(dados));
  });

  r.put('/placas/lotes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_LOTE, { parcial: true });
    if (dados.material_id !== undefined) exigirMaterial(dados.material_id);
    const atualizado = lotes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Lote');
    res.json(atualizado);
  });

  r.delete('/placas/lotes/:id', (req, res) => {
    if (!lotes.remover(lerId(req.params.id))) throw naoEncontrado('Lote');
    res.status(204).end();
  });

  r.get('/placas/modelos', (req, res) => {
    res.json(modelos.listar().map(montarModelo));
  });

  r.post('/placas/modelos', (req, res) => {
    const dados = validar(req.body, REGRAS_MODELO);
    const itens = validarItens(req.body.itens ?? []);
    const criado = emTransacao(db, () => {
      const modelo = modelos.criar(dados);
      for (const item of itens) itensModelo.criar({ ...item, modelo_id: modelo.id });
      return modelo;
    });
    res.status(201).json(montarModelo(criado));
  });

  r.put('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!modelos.obter(id)) throw naoEncontrado('Modelo');
    const dados = validar(req.body, REGRAS_MODELO, { parcial: true });
    const itens = req.body.itens !== undefined ? validarItens(req.body.itens) : null;
    emTransacao(db, () => {
      if (Object.keys(dados).length) modelos.atualizar(id, dados);
      if (itens) {
        itensModelo.removerPorModelo(id);
        for (const item of itens) itensModelo.criar({ ...item, modelo_id: id });
      }
    });
    res.json(montarModelo(modelos.obter(id)));
  });

  r.delete('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!modelos.obter(id)) throw naoEncontrado('Modelo');
    if (vendas.listar().some((v) => v.modelo_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Modelo tem vendas vinculadas' }]);
    }
    emTransacao(db, () => {
      itensModelo.removerPorModelo(id);
      modelos.remover(id);
    });
    res.status(204).end();
  });

  return r;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: PASS (21 testes).

- [ ] **Step 5: Commit**

```bash
git add server/routes/placas.js server/routes/placas.test.js
git commit -m "feat: cadastro de modelos de placa com receita e custo/lucro previstos"
```

---

### Task 5: Rotas de Vendas (custo snapshot, comprador, aviso de estoque)

**Files:**
- Modify: `server/routes/placas.js`
- Modify: `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `repoPlacasVendas(db)` (Task 2); `custoAtualMaterial`, `lucroRealVenda`, `materiaisComEstoqueNegativo` (Task 1); `repoClientes(db)` (`server/repos/clientes.js`, já existente).
- Produces: `REGRAS_VENDA`, `GET/POST/PUT/DELETE /placas/vendas[/:id]`. `POST` responde `{ venda, avisos_estoque }`, onde `venda` inclui `lucro_real_centavos`. `GET` responde itens com `lucro_real_centavos`, `modelo_nome`, `cliente_nome` — consumidos pela Task 11 (frontend).

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar em `server/routes/placas.test.js`, depois do `describe('/api/placas/modelos', ...)`:

```js
async function montarModeloCompleto() {
  const placa = await criarMaterial({ nome: 'Placa 10x10 PVC' });
  await criarLote(placa.id, { quantidade: 2, valor_kit_centavos: 2490, valor_frete_centavos: 0 });
  return criarModelo([{ material_id: placa.id, quantidade: 1 }], { preco_venda_centavos: 8000 });
}

describe('/api/placas/vendas', () => {
  it('cria venda calculando o custo snapshot e o lucro real', async () => {
    const modelo = await montarModeloCompleto();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, cliente_id: cliente.id, data_venda: '2026-09-23',
    }).expect(201);
    expect(res.body.venda).toMatchObject({ custo_unitario_centavos: 249, quantidade: 1, lucro_real_centavos: 8000 - 249 });
    expect(res.body.avisos_estoque).toEqual([]);
  });

  it('aceita comprador avulso sem cliente cadastrado', async () => {
    const modelo = await montarModeloCompleto();
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano do Instagram', data_venda: '2026-09-23',
    }).expect(201);
    expect(res.body.venda.comprador_nome).toBe('Fulano do Instagram');
    expect(res.body.venda.cliente_id).toBeNull();
  });

  it('recusa quando não informa cliente nem nome avulso', async () => {
    const modelo = await montarModeloCompleto();
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, data_venda: '2026-09-23',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'comprador_nome', mensagem: 'Informe um cliente cadastrado ou um nome avulso (não os dois)' }]);
  });

  it('recusa quando informa cliente e nome avulso ao mesmo tempo', async () => {
    const modelo = await montarModeloCompleto();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, cliente_id: cliente.id, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'comprador_nome', mensagem: 'Informe um cliente cadastrado ou um nome avulso (não os dois)' }]);
  });

  it('avisa sem bloquear quando o estoque fica negativo', async () => {
    const modelo = await montarModeloCompleto();
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, quantidade: 3, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201);
    expect(res.body.avisos_estoque).toHaveLength(1);
    expect(res.body.avisos_estoque[0]).toMatchObject({ nome: 'Placa 10x10 PVC', estoque_atual: -1 });
  });

  it('recusa quando o modelo não tem lote comprado para a receita', async () => {
    const placa = await criarMaterial();
    const modelo = await criarModelo([{ material_id: placa.id, quantidade: 1 }]);
    const res = await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'modelo_id', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
  });

  it('lista vendas com nomes do modelo e do cliente', async () => {
    const modelo = await montarModeloCompleto();
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, cliente_id: cliente.id, data_venda: '2026-09-23',
    }).expect(201);
    const res = await ctx.http.get('/api/placas/vendas').expect(200);
    expect(res.body[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', cliente_nome: 'Ana' });
  });

  it('edita preço vendido', async () => {
    const modelo = await montarModeloCompleto();
    const criada = (await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201)).body.venda;
    const res = await ctx.http.put(`/api/placas/vendas/${criada.id}`).send({ preco_vendido_centavos: 7500 }).expect(200);
    expect(res.body.preco_vendido_centavos).toBe(7500);
  });

  it('exclui venda', async () => {
    const modelo = await montarModeloCompleto();
    const criada = (await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201)).body.venda;
    await ctx.http.delete(`/api/placas/vendas/${criada.id}`).expect(204);
  });

  it('responde 404 ao editar ou excluir venda inexistente', async () => {
    await ctx.http.put('/api/placas/vendas/999').send({ preco_vendido_centavos: 100 }).expect(404);
    await ctx.http.delete('/api/placas/vendas/999').expect(404);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: FAIL — `POST /api/placas/vendas` não existe (404).

- [ ] **Step 3: Adicionar as rotas de vendas**

Em `server/routes/placas.js`, arquivo completo:

```js
import { Router } from 'express';
import { repoPlacasMateriais, repoPlacasLotes, repoPlacasModelos, repoPlacasModelosItens, repoPlacasVendas } from '../repos/placas.js';
import { repoClientes } from '../repos/clientes.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, materiaisComEstoqueNegativo,
} from '../domain/placas.js';

const REGRAS_MATERIAL = {
  nome: { tipo: 'texto', obrigatorio: true },
};

const REGRAS_LOTE = {
  material_id: { tipo: 'inteiro', obrigatorio: true },
  nome_lote: { tipo: 'texto' },
  quantidade: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  valor_kit_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
  valor_frete_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  data_compra: { tipo: 'data', obrigatorio: true },
};

const REGRAS_MODELO = {
  nome: { tipo: 'texto', obrigatorio: true },
  preco_venda_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
};

const REGRAS_VENDA = {
  modelo_id: { tipo: 'inteiro', obrigatorio: true },
  quantidade: { tipo: 'inteiro', min: 1 },
  preco_vendido_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
  cliente_id: { tipo: 'inteiro' },
  comprador_nome: { tipo: 'texto' },
  data_venda: { tipo: 'data', obrigatorio: true },
};

export function rotasPlacas({ db }) {
  const materiais = repoPlacasMateriais(db);
  const lotes = repoPlacasLotes(db);
  const modelos = repoPlacasModelos(db);
  const itensModelo = repoPlacasModelosItens(db);
  const vendas = repoPlacasVendas(db);
  const clientes = repoClientes(db);
  const r = Router();

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

  function exigirMaterial(materialId) {
    if (!materiais.obter(materialId)) {
      throw new ErroValidacao([{ campo: 'material_id', mensagem: 'Material não encontrado' }]);
    }
  }

  function validarItens(itensBrutos) {
    if (!Array.isArray(itensBrutos)) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Deve ser uma lista' }]);
    return itensBrutos.map((item, i) => {
      const materialId = Number(item.material_id);
      const quantidade = Number(item.quantidade);
      if (!Number.isInteger(materialId) || materialId <= 0 || !materiais.obter(materialId)) {
        throw new ErroValidacao([{ campo: `itens[${i}].material_id`, mensagem: 'Material inválido' }]);
      }
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        throw new ErroValidacao([{ campo: `itens[${i}].quantidade`, mensagem: 'Deve ser no mínimo 1' }]);
      }
      return { material_id: materialId, quantidade };
    });
  }

  function montarModelo(modelo) {
    const todosItens = itensModelo.listar();
    const custoReceita = custoReceitaModelo(modelo.id, todosItens, lotes.listar());
    return {
      ...modelo,
      itens: todosItens.filter((i) => i.modelo_id === modelo.id),
      custo_previsto_centavos: custoReceita,
      lucro_previsto_centavos: lucroPrevisto(modelo, custoReceita),
    };
  }

  r.get('/placas/materiais', (req, res) => {
    res.json(materiais.listar().map(comCalculo));
  });

  r.post('/placas/materiais', (req, res) => {
    const dados = validar(req.body, REGRAS_MATERIAL);
    res.status(201).json(comCalculo(materiais.criar(dados)));
  });

  r.put('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_MATERIAL, { parcial: true });
    const atualizado = materiais.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });

  r.delete('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!materiais.obter(id)) throw naoEncontrado('Material');
    if (lotes.listar({ material_id: id }).length) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
    }
    if (itensModelo.listar().some((i) => i.material_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material está usado na receita de um modelo' }]);
    }
    materiais.remover(id);
    res.status(204).end();
  });

  r.get('/placas/lotes', (req, res) => {
    res.json(lotes.listar({ material_id: req.query.material_id }));
  });

  r.post('/placas/lotes', (req, res) => {
    const dados = validar(req.body, REGRAS_LOTE);
    exigirMaterial(dados.material_id);
    res.status(201).json(lotes.criar(dados));
  });

  r.put('/placas/lotes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_LOTE, { parcial: true });
    if (dados.material_id !== undefined) exigirMaterial(dados.material_id);
    const atualizado = lotes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Lote');
    res.json(atualizado);
  });

  r.delete('/placas/lotes/:id', (req, res) => {
    if (!lotes.remover(lerId(req.params.id))) throw naoEncontrado('Lote');
    res.status(204).end();
  });

  r.get('/placas/modelos', (req, res) => {
    res.json(modelos.listar().map(montarModelo));
  });

  r.post('/placas/modelos', (req, res) => {
    const dados = validar(req.body, REGRAS_MODELO);
    const itens = validarItens(req.body.itens ?? []);
    const criado = emTransacao(db, () => {
      const modelo = modelos.criar(dados);
      for (const item of itens) itensModelo.criar({ ...item, modelo_id: modelo.id });
      return modelo;
    });
    res.status(201).json(montarModelo(criado));
  });

  r.put('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!modelos.obter(id)) throw naoEncontrado('Modelo');
    const dados = validar(req.body, REGRAS_MODELO, { parcial: true });
    const itens = req.body.itens !== undefined ? validarItens(req.body.itens) : null;
    emTransacao(db, () => {
      if (Object.keys(dados).length) modelos.atualizar(id, dados);
      if (itens) {
        itensModelo.removerPorModelo(id);
        for (const item of itens) itensModelo.criar({ ...item, modelo_id: id });
      }
    });
    res.json(montarModelo(modelos.obter(id)));
  });

  r.delete('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!modelos.obter(id)) throw naoEncontrado('Modelo');
    if (vendas.listar().some((v) => v.modelo_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Modelo tem vendas vinculadas' }]);
    }
    emTransacao(db, () => {
      itensModelo.removerPorModelo(id);
      modelos.remover(id);
    });
    res.status(204).end();
  });

  r.get('/placas/vendas', (req, res) => {
    const modelosTodos = modelos.listar();
    const clientesTodos = clientes.listar();
    res.json(vendas.listar().map((v) => ({
      ...v,
      lucro_real_centavos: lucroRealVenda(v),
      modelo_nome: modelosTodos.find((m) => m.id === v.modelo_id)?.nome ?? '—',
      cliente_nome: v.cliente_id ? (clientesTodos.find((c) => c.id === v.cliente_id)?.nome ?? '—') : null,
    })));
  });

  r.post('/placas/vendas', (req, res) => {
    const dados = validar(req.body, REGRAS_VENDA);
    const temCliente = dados.cliente_id !== undefined && dados.cliente_id !== null;
    const temNome = typeof dados.comprador_nome === 'string' && dados.comprador_nome.trim() !== '';
    if (temCliente === temNome) {
      throw new ErroValidacao([{ campo: 'comprador_nome', mensagem: 'Informe um cliente cadastrado ou um nome avulso (não os dois)' }]);
    }
    if (temCliente && !clientes.obter(dados.cliente_id)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
    const modelo = modelos.obter(dados.modelo_id);
    if (!modelo) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo não encontrado' }]);

    const itensDoModelo = itensModelo.listar({ modelo_id: modelo.id });
    if (!itensDoModelo.length) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo sem receita cadastrada' }]);

    const lotesTodos = lotes.listar();
    let custoUnitario = 0;
    for (const item of itensDoModelo) {
      const custo = custoAtualMaterial(item.material_id, lotesTodos);
      if (custo === null) {
        throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
      }
      custoUnitario += custo * item.quantidade;
    }

    const venda = vendas.criar({
      modelo_id: modelo.id,
      quantidade: dados.quantidade ?? 1,
      preco_vendido_centavos: dados.preco_vendido_centavos,
      custo_unitario_centavos: custoUnitario,
      cliente_id: temCliente ? dados.cliente_id : null,
      comprador_nome: temNome ? dados.comprador_nome.trim() : null,
      data_venda: dados.data_venda,
    });

    const vendasTodas = vendas.listar();
    const todosItensModelo = itensModelo.listar();
    const materiaisAfetados = itensDoModelo.map((i) => materiais.obter(i.material_id));
    const avisosEstoque = materiaisComEstoqueNegativo(materiaisAfetados, lotesTodos, vendasTodas, todosItensModelo)
      .map((m) => ({ material_id: m.id, nome: m.nome, estoque_atual: m.estoque_atual }));

    res.status(201).json({ venda: { ...venda, lucro_real_centavos: lucroRealVenda(venda) }, avisos_estoque: avisosEstoque });
  });

  r.put('/placas/vendas/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_VENDA, { parcial: true });
    const atualizada = vendas.atualizar(id, dados);
    if (!atualizada) throw naoEncontrado('Venda');
    res.json({ ...atualizada, lucro_real_centavos: lucroRealVenda(atualizada) });
  });

  r.delete('/placas/vendas/:id', (req, res) => {
    if (!vendas.remover(lerId(req.params.id))) throw naoEncontrado('Venda');
    res.status(204).end();
  });

  return r;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: PASS (30 testes).

- [ ] **Step 5: Commit**

```bash
git add server/routes/placas.js server/routes/placas.test.js
git commit -m "feat: lançamento de vendas de placas com custo snapshot e aviso de estoque"
```

---

### Task 6: Rota de Resumo (lucro previsto x real, estoque)

**Files:**
- Modify: `server/routes/placas.js`
- Modify: `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `custoReceitaModelo`, `lucroPrevisto`, `resumoLucroReal`, `estoqueMaterial` (Task 1); instâncias `materiais`, `modelos`, `lotes`, `vendas`, `itensModelo` já criadas na Task 5.
- Produces: `GET /placas/resumo` → `{ lucro_previsto_por_modelo, lucro_real_por_modelo, materiais }` — consumido pela Task 12 (frontend, `AbaResumo`).

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar em `server/routes/placas.test.js`, no fim do arquivo:

```js
describe('/api/placas/resumo', () => {
  it('agrega lucro previsto, lucro real e estoque', async () => {
    const modelo = await montarModeloCompleto();
    await ctx.http.post('/api/placas/vendas').send({
      modelo_id: modelo.id, preco_vendido_centavos: 8000, comprador_nome: 'Fulano', data_venda: '2026-09-23',
    }).expect(201);
    const res = await ctx.http.get('/api/placas/resumo').expect(200);
    expect(res.body.lucro_previsto_por_modelo[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', lucro_previsto_centavos: 8000 - 249 });
    expect(res.body.lucro_real_por_modelo[0]).toMatchObject({ modelo_nome: 'Placa 10x10 PVC', quantidade: 1, lucro_total_centavos: 8000 - 249 });
    expect(res.body.materiais[0]).toMatchObject({ nome: 'Placa 10x10 PVC', estoque_atual: 1 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run server/routes/placas.test.js -t "agrega lucro"`
Esperado: FAIL — `GET /api/placas/resumo` não existe (404).

- [ ] **Step 3: Adicionar a rota de resumo**

Em `server/routes/placas.js`, adicionar o import de `resumoLucroReal` (completar a linha de import de `../domain/placas.js`):

```js
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
} from '../domain/placas.js';
```

E adicionar a rota, logo antes do `return r;` final:

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

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npx vitest run server/routes/placas.test.js`
Esperado: PASS (31 testes).

- [ ] **Step 5: Rodar a suíte completa do backend**

Rodar: `npx vitest run server`
Esperado: PASS — nenhuma regressão nas rotas existentes.

- [ ] **Step 6: Commit**

```bash
git add server/routes/placas.js server/routes/placas.test.js
git commit -m "feat: resumo de lucro previsto x real e estoque das placas de avaliação"
```

---

### Task 7: Navegação `/placas` + aba Resumo

**Files:**
- Create: `web/src/pages/Placas.jsx`
- Create: `web/src/pages/Placas.test.jsx`
- Create: `web/src/pages/placas/AbaResumo.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/placas/resumo` (Task 6).
- Produces: componente `Placas`, montado em `/placas`, com array `ABAS` (estendido pelas Tasks 8-11) e `aba`/`setAba` (`useState`); componente `AbaResumo` (sem props).

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `web/src/pages/Placas.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Placas } from './Placas.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('Placas', () => {
  it('mostra o resumo de lucro previsto, lucro real e estoque', async () => {
    mockApi({
      'GET /placas/resumo': {
        lucro_previsto_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, custo_previsto_centavos: 376, lucro_previsto_centavos: 7624 },
        ],
        lucro_real_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', quantidade: 2, lucro_total_centavos: 15000, lucro_medio_centavos: 7500 },
        ],
        materiais: [{ material_id: 1, nome: 'Placa 10x10 PVC', estoque_atual: -1 }],
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    expect(await screen.findByRole('heading', { name: 'Placas de avaliação' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*76,24/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*75,00/)).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: FAIL — `Cannot find module './Placas.jsx'`.

- [ ] **Step 3: Criar `AbaResumo.jsx`**

Criar `web/src/pages/placas/AbaResumo.jsx`:

```jsx
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';

export function AbaResumo() {
  const { dados: resumo, erro } = useCarregar(() => api('/placas/resumo'), []);

  return (
    <section>
      <Aviso erro={erro} />
      {resumo && (
        <>
          <section className="cartao">
            <h2>Lucro previsto por modelo</h2>
            {resumo.lucro_previsto_por_modelo.length ? (
              <table className="tabela">
                <thead><tr><th>Modelo</th><th className="num">Preço de venda</th><th className="num">Custo previsto</th><th className="num">Lucro previsto</th></tr></thead>
                <tbody>
                  {resumo.lucro_previsto_por_modelo.map((m) => (
                    <tr key={m.modelo_id}>
                      <td>{m.modelo_nome}</td>
                      <td className="num">{formatarDinheiro(m.preco_venda_centavos)}</td>
                      <td className="num">{m.custo_previsto_centavos === null ? '—' : formatarDinheiro(m.custo_previsto_centavos)}</td>
                      <td className="num">{m.lucro_previsto_centavos === null ? '—' : formatarDinheiro(m.lucro_previsto_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhum modelo cadastrado.</p>}
          </section>

          <section className="cartao">
            <h2>Lucro real por modelo</h2>
            {resumo.lucro_real_por_modelo.length ? (
              <table className="tabela">
                <thead><tr><th>Modelo</th><th className="num">Quantidade vendida</th><th className="num">Lucro total</th><th className="num">Lucro médio</th></tr></thead>
                <tbody>
                  {resumo.lucro_real_por_modelo.map((m) => (
                    <tr key={m.modelo_id}>
                      <td>{m.modelo_nome}</td>
                      <td className="num">{m.quantidade}</td>
                      <td className="num">{formatarDinheiro(m.lucro_total_centavos)}</td>
                      <td className="num">{formatarDinheiro(m.lucro_medio_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhuma venda lançada ainda.</p>}
          </section>

          <section className="cartao">
            <h2>Estoque de materiais</h2>
            {resumo.materiais.length ? (
              <table className="tabela">
                <thead><tr><th>Material</th><th className="num">Estoque atual</th></tr></thead>
                <tbody>
                  {resumo.materiais.map((m) => (
                    <tr key={m.material_id}>
                      <td>{m.nome}</td>
                      <td className="num">
                        {m.estoque_atual < 0
                          ? <span className="etiqueta etiqueta--atrasada">{m.estoque_atual}</span>
                          : m.estoque_atual}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhum material cadastrado.</p>}
          </section>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Criar `Placas.jsx`**

Criar `web/src/pages/Placas.jsx`:

```jsx
import { useState } from 'react';
import { AbaResumo } from './placas/AbaResumo.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
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
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Registrar a rota e o item de navegação**

Em `web/src/App.jsx`, adicionar o import:

```js
import { Placas } from './pages/Placas.jsx';
```

Adicionar ao array `NAVEGACAO` (depois de `QR Codes`):

```js
  { para: '/placas', rotulo: 'Placas' },
```

Adicionar à lista de `Routes` (depois de `/qrcodes/:id`):

```jsx
          <Route path="/placas" element={<Placas />} />
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: PASS (1 teste).

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/Placas.jsx web/src/pages/Placas.test.jsx web/src/pages/placas/AbaResumo.jsx web/src/App.jsx
git commit -m "feat: navegação e aba de resumo das placas de avaliação"
```

---

### Task 8: Aba Materiais (CRUD)

**Files:**
- Create: `web/src/components/FormPlacaMaterial.jsx`
- Create: `web/src/pages/placas/AbaMateriais.jsx`
- Modify: `web/src/pages/Placas.jsx`
- Modify: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/placas/materiais` (Task 2); `ABAS`/`Placas` (Task 7).
- Produces: `FormPlacaMaterial({ inicial, rotuloBotao, onSalvar })`; componente `AbaMateriais` (sem props).

- [ ] **Step 1: Escrever o teste (falhando)**

Trocar a linha de import do `@testing-library/react` para incluir `waitFor`, e adicionar o import de `userEvent`, no topo de `web/src/pages/Placas.test.jsx`:

```jsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

E adicionar, dentro do `describe('Placas', ...)`, depois do teste de resumo:

```jsx
  it('cria material na aba Materiais', async () => {
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [],
      'POST /placas/materiais': { id: 1, nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: null },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Materiais' }));
    await user.click(await screen.findByRole('button', { name: '+ Material' }));
    await user.type(screen.getByLabelText('Nome'), 'Placa 10x10 PVC');
    await user.click(screen.getByRole('button', { name: 'Criar material' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ nome: 'Placa 10x10 PVC' });
  });
```

Nota: a lista não é reconsultada de verdade nesse teste (o mock de `GET /placas/materiais` é estático), então a prova de que o salvamento funcionou é o modal fechar (`dialog` some) + o corpo do `POST` capturado — mesmo princípio dos testes seguintes (Lotes, Modelos).

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: FAIL — não existe a aba "Materiais" (o `findByRole('tab', { name: 'Materiais' })` nunca resolve).

- [ ] **Step 3: Criar `FormPlacaMaterial.jsx`**

Criar `web/src/components/FormPlacaMaterial.jsx`:

```jsx
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';

export function FormPlacaMaterial({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { valores, campo } = useFormulario({ nome: inicial.nome ?? '' });
  const { erros, erro, enviando, executar } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    executar(() => onSalvar({ nome: valores.nome }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Criar `AbaMateriais.jsx`**

Criar `web/src/pages/placas/AbaMateriais.jsx`:

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
            {materiais.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td className="num">
                  {m.estoque_atual < 0 ? <span className="etiqueta etiqueta--atrasada">{m.estoque_atual}</span> : m.estoque_atual}
                </td>
                <td className="num">{m.custo_unitario_atual === null ? '—' : formatarDinheiro(m.custo_unitario_atual)}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(m)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button>
                </td>
              </tr>
            ))}
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

- [ ] **Step 5: Adicionar a aba em `Placas.jsx`**

Em `web/src/pages/Placas.jsx`, arquivo completo:

```jsx
import { useState } from 'react';
import { AbaResumo } from './placas/AbaResumo.jsx';
import { AbaMateriais } from './placas/AbaMateriais.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
  ['materiais', 'Materiais'],
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
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: PASS (2 testes).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/FormPlacaMaterial.jsx web/src/pages/placas/AbaMateriais.jsx web/src/pages/Placas.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: aba de materiais das placas de avaliação"
```

---

### Task 9: Aba Lotes (CRUD)

**Files:**
- Create: `web/src/components/FormPlacaLote.jsx`
- Create: `web/src/pages/placas/AbaLotes.jsx`
- Modify: `web/src/pages/Placas.jsx`
- Modify: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/placas/lotes`, `GET /api/placas/materiais` (Tasks 2-3); `ABAS`/`Placas` (Task 8).
- Produces: `FormPlacaLote({ inicial, rotuloBotao, onSalvar })`; componente `AbaLotes` (sem props).

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar em `web/src/pages/Placas.test.jsx`, dentro do `describe('Placas', ...)`, depois do teste "cria material na aba Materiais":

```jsx
  it('lança lote na aba Lotes', async () => {
    const material = { id: 1, nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: null };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [material],
      'GET /placas/lotes': [],
      'POST /placas/lotes': {
        id: 1, material_id: 1, nome_lote: '', quantidade: 10,
        valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-10-03',
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    await user.click(await screen.findByRole('button', { name: '+ Lote' }));
    await user.selectOptions(await screen.findByLabelText('Material'), '1');
    await user.type(screen.getByLabelText('Quantidade'), '10');
    await user.type(screen.getByLabelText('Valor do kit (R$)'), '24,90');
    await user.click(screen.getByRole('button', { name: 'Lançar lote' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/placas/lotes');
    expect(post.corpo).toMatchObject({ material_id: 1, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0 });
    expect(post.corpo.data_compra).toEqual(expect.any(String));
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: FAIL — não existe a aba "Lotes".

- [ ] **Step 3: Criar `FormPlacaLote.jsx`**

Criar `web/src/components/FormPlacaLote.jsx`:

```jsx
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { hojeISO } from '../lib/datas.js';

export function FormPlacaLote({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo } = useFormulario({
    material_id: inicial.material_id ? String(inicial.material_id) : '',
    nome_lote: inicial.nome_lote ?? '',
    quantidade: inicial.quantidade ? String(inicial.quantidade) : '',
    valor_kit: centavosParaTexto(inicial.valor_kit_centavos),
    valor_frete: centavosParaTexto(inicial.valor_frete_centavos ?? 0),
    data_compra: inicial.data_compra ?? hojeISO(),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    const valorKit = paraCentavos(valores.valor_kit);
    if (valorKit === null || Number.isNaN(valorKit)) {
      setErros([{ campo: 'valor_kit_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const valorFrete = valores.valor_frete ? paraCentavos(valores.valor_frete) : 0;
    if (Number.isNaN(valorFrete)) {
      setErros([{ campo: 'valor_frete_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(() => onSalvar({
      material_id: valores.material_id ? Number(valores.material_id) : null,
      nome_lote: valores.nome_lote,
      quantidade: valores.quantidade ? Number(valores.quantidade) : null,
      valor_kit_centavos: valorKit,
      valor_frete_centavos: valorFrete ?? 0,
      data_compra: valores.data_compra,
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Material" nome="material_id" erros={erros}>
        <select {...campo('material_id')}>
          <option value="">Selecione…</option>
          {(materiais ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Nome do lote (opcional)" nome="nome_lote" erros={erros} {...campo('nome_lote')} />
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Valor do kit (R$)" nome="valor_kit_centavos" erros={erros} inputMode="decimal" {...campo('valor_kit')} />
      <Campo rotulo="Valor do frete (R$)" nome="valor_frete_centavos" erros={erros} inputMode="decimal" {...campo('valor_frete')} />
      <Campo rotulo="Data da compra" nome="data_compra" erros={erros} type="date" {...campo('data_compra')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Criar `AbaLotes.jsx`**

Criar `web/src/pages/placas/AbaLotes.jsx`:

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaLote } from '../../components/FormPlacaLote.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export function AbaLotes() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { dados: lotes, erro, recarregar } = useCarregar(() => api('/placas/lotes'), []);

  function nomeMaterial(materialId) {
    return (materiais ?? []).find((m) => m.id === materialId)?.nome ?? '—';
  }

  async function criar(dados) {
    await api('/placas/lotes', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/lotes/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(lote) {
    if (!window.confirm(`Excluir este lote de ${nomeMaterial(lote.material_id)}?`)) return;
    await api(`/placas/lotes/${lote.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Lotes de compra</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Lote</button>
      </header>
      <Aviso erro={erro} />
      {lotes && (lotes.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Material</th><th>Lote</th><th className="num">Quantidade</th><th className="num">Kit</th><th className="num">Frete</th><th>Data</th><th></th></tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id}>
                <td>{nomeMaterial(l.material_id)}</td>
                <td>{l.nome_lote || '—'}</td>
                <td className="num">{l.quantidade}</td>
                <td className="num">{formatarDinheiro(l.valor_kit_centavos)}</td>
                <td className="num">{formatarDinheiro(l.valor_frete_centavos)}</td>
                <td>{formatarData(l.data_compra)}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(l)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(l)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum lote lançado ainda.</p>)}
      {criando && (
        <Modal titulo="Novo lote" onFechar={() => setCriando(false)}>
          <FormPlacaLote rotuloBotao="Lançar lote" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar lote" onFechar={() => setEditando(null)}>
          <FormPlacaLote inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Adicionar a aba em `Placas.jsx`**

Em `web/src/pages/Placas.jsx`, arquivo completo:

```jsx
import { useState } from 'react';
import { AbaResumo } from './placas/AbaResumo.jsx';
import { AbaMateriais } from './placas/AbaMateriais.jsx';
import { AbaLotes } from './placas/AbaLotes.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
  ['materiais', 'Materiais'],
  ['lotes', 'Lotes'],
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
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/FormPlacaLote.jsx web/src/pages/placas/AbaLotes.jsx web/src/pages/Placas.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: aba de lotes de compra das placas de avaliação"
```

---

### Task 10: Aba Modelos (receita, custo e lucro previstos)

**Files:**
- Create: `web/src/components/FormPlacaModelo.jsx`
- Create: `web/src/pages/placas/AbaModelos.jsx`
- Modify: `web/src/pages/Placas.jsx`
- Modify: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/placas/modelos`, `GET /api/placas/materiais` (Tasks 2, 4); `ABAS`/`Placas` (Task 9).
- Produces: `FormPlacaModelo({ inicial, rotuloBotao, onSalvar })`; componente `AbaModelos` (sem props).

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar em `web/src/pages/Placas.test.jsx`, dentro do `describe('Placas', ...)`, depois do teste "lança lote na aba Lotes":

```jsx
  it('cria modelo com um item de receita na aba Modelos', async () => {
    const material = { id: 1, nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: 249 };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/modelos': [],
      'GET /placas/materiais': [material],
      'POST /placas/modelos': {
        id: 1, nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000,
        itens: [{ id: 1, modelo_id: 1, material_id: 1, quantidade: 1 }],
        custo_previsto_centavos: 249, lucro_previsto_centavos: 7751,
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Modelos' }));
    await user.click(await screen.findByRole('button', { name: '+ Modelo' }));
    await user.type(screen.getByLabelText('Nome'), 'Placa 10x10 PVC');
    await user.type(screen.getByLabelText('Preço de venda (R$)'), '80');
    await user.click(screen.getByRole('button', { name: '+ Item da receita' }));
    await user.selectOptions(await screen.findByLabelText('Material do item 1'), '1');
    await user.click(screen.getByRole('button', { name: 'Criar modelo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/placas/modelos');
    expect(post.corpo).toEqual({
      nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, itens: [{ material_id: 1, quantidade: 1 }],
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: FAIL — não existe a aba "Modelos".

- [ ] **Step 3: Criar `FormPlacaModelo.jsx`**

Criar `web/src/components/FormPlacaModelo.jsx`:

```jsx
import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';

export function FormPlacaModelo({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo } = useFormulario({
    nome: inicial.nome ?? '',
    preco_venda: centavosParaTexto(inicial.preco_venda_centavos),
  });
  const [itens, setItens] = useState(
    (inicial.itens ?? []).map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) })),
  );
  const { erros, erro, enviando, executar, setErros } = useEnvio();

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
    const precoVenda = paraCentavos(valores.preco_venda);
    if (precoVenda === null || Number.isNaN(precoVenda)) {
      setErros([{ campo: 'preco_venda_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(() => onSalvar({
      nome: valores.nome,
      preco_venda_centavos: precoVenda,
      itens: itens.map((i) => ({ material_id: Number(i.material_id), quantidade: Number(i.quantidade) })),
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Preço de venda (R$)" nome="preco_venda_centavos" erros={erros} inputMode="decimal" {...campo('preco_venda')} />
      <fieldset>
        <legend>Receita (materiais usados)</legend>
        {itens.map((item, indice) => (
          <div className="form--linha" key={indice}>
            <select
              aria-label={`Material do item ${indice + 1}`}
              value={item.material_id}
              onChange={(e) => alterarItem(indice, 'material_id', e.target.value)}
            >
              <option value="">Selecione…</option>
              {(materiais ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
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
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Criar `AbaModelos.jsx`**

Criar `web/src/pages/placas/AbaModelos.jsx`:

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
            {modelos.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td className="num">{formatarDinheiro(m.preco_venda_centavos)}</td>
                <td className="num">{m.custo_previsto_centavos === null ? '—' : formatarDinheiro(m.custo_previsto_centavos)}</td>
                <td className="num">{m.lucro_previsto_centavos === null ? '—' : formatarDinheiro(m.lucro_previsto_centavos)}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(m)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button>
                </td>
              </tr>
            ))}
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

- [ ] **Step 5: Adicionar a aba em `Placas.jsx`**

Em `web/src/pages/Placas.jsx`, arquivo completo:

```jsx
import { useState } from 'react';
import { AbaResumo } from './placas/AbaResumo.jsx';
import { AbaMateriais } from './placas/AbaMateriais.jsx';
import { AbaLotes } from './placas/AbaLotes.jsx';
import { AbaModelos } from './placas/AbaModelos.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
  ['materiais', 'Materiais'],
  ['lotes', 'Lotes'],
  ['modelos', 'Modelos'],
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
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: PASS (4 testes).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/FormPlacaModelo.jsx web/src/pages/placas/AbaModelos.jsx web/src/pages/Placas.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: aba de modelos das placas de avaliação, com receita e custo/lucro previstos"
```

---

### Task 11: Aba Vendas (comprador cadastrado ou avulso, aviso de estoque)

**Files:**
- Create: `web/src/components/FormPlacaVenda.jsx`
- Create: `web/src/pages/placas/AbaVendas.jsx`
- Modify: `web/src/pages/Placas.jsx`
- Modify: `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/placas/vendas`, `GET /api/placas/modelos`, `GET /api/clientes` (Tasks 2, 5); `ABAS`/`Placas` (Task 10).
- Produces: `FormPlacaVenda({ inicial, rotuloBotao, onSalvar })`; componente `AbaVendas` (sem props). Fecha o subsistema.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar em `web/src/pages/Placas.test.jsx`, dentro do `describe('Placas', ...)`, depois do teste "cria modelo com um item de receita na aba Modelos":

```jsx
  it('lança venda e mostra aviso de estoque negativo', async () => {
    const modelo = { id: 1, nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, custo_previsto_centavos: 249, lucro_previsto_centavos: 7751, itens: [] };
    const ana = { id: 1, nome: 'Ana' };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/vendas': [],
      'GET /placas/modelos': [modelo],
      'GET /clientes': [ana],
      'POST /placas/vendas': {
        venda: {
          id: 1, modelo_id: 1, quantidade: 1, preco_vendido_centavos: 8000, custo_unitario_centavos: 249,
          cliente_id: 1, comprador_nome: null, data_venda: '2026-10-03', lucro_real_centavos: 7751,
        },
        avisos_estoque: [{ material_id: 1, nome: 'Placa 10x10 PVC', estoque_atual: -1 }],
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Vendas' }));
    await user.click(await screen.findByRole('button', { name: '+ Venda' }));
    await user.selectOptions(await screen.findByLabelText('Modelo'), '1');
    await user.selectOptions(screen.getByLabelText('Comprador'), '1');
    await user.click(screen.getByRole('button', { name: 'Lançar venda' }));
    expect(await screen.findByText(/Estoque negativo após esta venda/)).toBeInTheDocument();
    const post = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/placas/vendas');
    expect(post.corpo).toMatchObject({ modelo_id: 1, quantidade: 1, preco_vendido_centavos: 8000, cliente_id: 1, comprador_nome: null });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: FAIL — não existe a aba "Vendas".

- [ ] **Step 3: Criar `FormPlacaVenda.jsx`**

Criar `web/src/components/FormPlacaVenda.jsx`:

```jsx
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { hojeISO } from '../lib/datas.js';

export function FormPlacaVenda({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { valores, campo, setValores } = useFormulario({
    modelo_id: inicial.modelo_id ? String(inicial.modelo_id) : '',
    quantidade: String(inicial.quantidade ?? 1),
    preco_vendido: centavosParaTexto(inicial.preco_vendido_centavos),
    comprador: inicial.cliente_id ? String(inicial.cliente_id) : (inicial.comprador_nome ? 'avulso' : ''),
    comprador_nome: inicial.comprador_nome ?? '',
    data_venda: inicial.data_venda ?? hojeISO(),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const compradorAvulso = valores.comprador === 'avulso';

  function selecionarModelo(e) {
    const modeloId = e.target.value;
    const modelo = (modelos ?? []).find((m) => String(m.id) === modeloId);
    setValores((v) => ({
      ...v,
      modelo_id: modeloId,
      preco_vendido: v.preco_vendido || centavosParaTexto(modelo?.preco_venda_centavos),
    }));
  }

  function enviar(e) {
    e.preventDefault();
    const precoVendido = paraCentavos(valores.preco_vendido);
    if (precoVendido === null || Number.isNaN(precoVendido)) {
      setErros([{ campo: 'preco_vendido_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(() => onSalvar({
      modelo_id: valores.modelo_id ? Number(valores.modelo_id) : null,
      quantidade: valores.quantidade ? Number(valores.quantidade) : 1,
      preco_vendido_centavos: precoVendido,
      cliente_id: compradorAvulso || !valores.comprador ? null : Number(valores.comprador),
      comprador_nome: compradorAvulso ? valores.comprador_nome : null,
      data_venda: valores.data_venda,
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Modelo" nome="modelo_id" erros={erros}>
        <select value={valores.modelo_id} onChange={selecionarModelo}>
          <option value="">Selecione…</option>
          {(modelos ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Preço vendido (R$)" nome="preco_vendido_centavos" erros={erros} inputMode="decimal" {...campo('preco_vendido')} />
      <Campo rotulo="Comprador" nome="comprador" erros={erros}>
        <select {...campo('comprador')}>
          <option value="">Selecione…</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="avulso">Comprador avulso (sem cadastro)</option>
        </select>
      </Campo>
      {compradorAvulso && (
        <Campo rotulo="Nome do comprador avulso" nome="comprador_nome" erros={erros} {...campo('comprador_nome')} />
      )}
      <Campo rotulo="Data da venda" nome="data_venda" erros={erros} type="date" {...campo('data_venda')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Criar `AbaVendas.jsx`**

Criar `web/src/pages/placas/AbaVendas.jsx`:

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaVenda } from '../../components/FormPlacaVenda.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export function AbaVendas() {
  const [criando, setCriando] = useState(false);
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const { dados: vendas, erro, recarregar } = useCarregar(() => api('/placas/vendas'), []);

  async function criar(dados) {
    const res = await api('/placas/vendas', { method: 'POST', body: dados });
    setCriando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    recarregar();
  }

  async function remover(venda) {
    if (!window.confirm(`Excluir esta venda de ${venda.modelo_nome}?`)) return;
    await api(`/placas/vendas/${venda.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Vendas</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Venda</button>
      </header>
      <Aviso erro={erro} />
      {avisosEstoque.length > 0 && (
        <p className="aviso aviso--erro" role="alert">
          Estoque negativo após esta venda: {avisosEstoque.map((a) => `${a.nome} (${a.estoque_atual})`).join(', ')}
        </p>
      )}
      {vendas && (vendas.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Modelo</th><th>Comprador</th><th className="num">Qtd.</th><th className="num">Vendido</th><th className="num">Lucro real</th><th></th></tr>
          </thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.id}>
                <td>{formatarData(v.data_venda)}</td>
                <td>{v.modelo_nome}</td>
                <td>{v.cliente_nome ?? v.comprador_nome}</td>
                <td className="num">{v.quantidade}</td>
                <td className="num">{formatarDinheiro(v.preco_vendido_centavos)}</td>
                <td className="num">{formatarDinheiro(v.lucro_real_centavos)}</td>
                <td><button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(v)}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhuma venda lançada ainda.</p>)}
      {criando && (
        <Modal titulo="Nova venda" onFechar={() => setCriando(false)}>
          <FormPlacaVenda rotuloBotao="Lançar venda" onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Adicionar a aba em `Placas.jsx`**

Em `web/src/pages/Placas.jsx`, arquivo completo:

```jsx
import { useState } from 'react';
import { AbaResumo } from './placas/AbaResumo.jsx';
import { AbaMateriais } from './placas/AbaMateriais.jsx';
import { AbaLotes } from './placas/AbaLotes.jsx';
import { AbaModelos } from './placas/AbaModelos.jsx';
import { AbaVendas } from './placas/AbaVendas.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
  ['materiais', 'Materiais'],
  ['lotes', 'Lotes'],
  ['modelos', 'Modelos'],
  ['vendas', 'Vendas'],
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
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Rodar: `npx vitest run web/src/pages/Placas.test.jsx`
Esperado: PASS (5 testes).

- [ ] **Step 7: Rodar a suíte completa do projeto**

Rodar: `npx vitest run`
Esperado: PASS — todos os testes do backend e do frontend, sem regressões.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/FormPlacaVenda.jsx web/src/pages/placas/AbaVendas.jsx web/src/pages/Placas.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: aba de vendas das placas de avaliação, com comprador e aviso de estoque"
```

---

## Depois de implementado

Testar manualmente o fluxo completo (`npm start`, acessar `/placas`):
1. Cadastrar os materiais (Placa 10x10 PVC, Adesivo 10x10, Tag NFC, Placa 10x15, Adesivo 10x15).
2. Lançar um lote de cada material com os valores da planilha de referência.
3. Criar os dois modelos (10x10 e 10x15) com suas receitas e preços de venda — conferir que o custo/lucro previstos batem com a planilha (R$ 3,76 / R$ 76,24 e R$ 20,55 / R$ 79,45).
4. Lançar algumas vendas (cliente cadastrado e avulso) e conferir o lucro real e a comparação com o previsto na aba Resumo.
