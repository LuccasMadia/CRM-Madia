# Serviços por oportunidade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar um ou mais serviços (Placas NFC, Sistemas, SaaS, Google Meu Negócio) numa oportunidade do Funil, calcular o valor da oportunidade automaticamente a partir deles (com desconto), e — no caso de Placas NFC — criar de verdade a venda em `placas_vendas` quando a oportunidade é entregue.

**Architecture:** Nova tabela `projetos_servicos` (0..N linhas por projeto) + coluna `desconto_centavos` em `projetos`. Backend (`server/domain/servicos.js`, `server/repos/servicos.js`, `server/routes/projetos.js`) valida e persiste os serviços, recalcula `valor_total_centavos` no servidor (fonte da verdade), e dispara a criação da venda de placas na transição de etapa para `entregue`, reaproveitando o cálculo de custo já usado em `POST /placas/vendas` (extraído para `calcularCustoUnitarioModelo` em `server/domain/placas.js`). Frontend: componente compartilhado `CamposServicos.jsx` (autocontido, busca seus próprios dados) usado em `FormOportunidade.jsx` e `AbaGeral.jsx`, substituindo o campo manual "Valor (R$)" quando há ao menos um serviço marcado.

**Tech Stack:** Node.js + Express, `node:sqlite` (`DatabaseSync`, não `better-sqlite3`), Vitest + Supertest (backend), React + Vite, Vitest + Testing Library + `userEvent` (frontend).

## Global Constraints

- Banco de dados é `node:sqlite` (`DatabaseSync`), migrations em `server/db/migrations/NNN_nome.sql`, aplicadas em ordem alfabética e rastreadas em `schema_migrations` — a próxima é `013_projetos_servicos.sql`.
- Todo texto de UI, mensagem de erro e nome de variável em português, seguindo o estilo do resto do projeto (sem acentos em identificadores de código, com acentos em strings/rótulos).
- Catálogo de serviços fixo no código (`TIPOS_SERVICO` com 4 valores) — não é uma tela de CRUD configurável.
- Venda em `placas_vendas` só é criada quando a etapa realmente transiciona **para** `'entregue'` (nunca antes).
- Sem serviço nenhum na oportunidade, `valor_total_centavos` continua sendo um campo manual, exatamente como hoje — comportamento 100% preservado.
- Todo teste novo segue os padrões já existentes no repo: backend via `criarContexto()` + `ctx.http` (Supertest), frontend via `mockApi()` + `renderizar()` + `@testing-library/user-event`.
- Rodar a suíte de testes (`npm test` nas pastas `server/` e `web/`, conforme o `package.json` de cada uma) ao final de cada tarefa antes de prosseguir.
- A Task 3 (preços padrão em `/config`) precisa ser feita **antes** da Task 4 (POST /projetos com serviços), porque um dos testes da Task 4 depende de `PUT /config` já aceitar `preco_servico_sistemas_centavos`.

---

## Antes de começar

Leia estes arquivos existentes para ter o contexto de convenções (todos já seguidos neste plano, mas úteis para o engenheiro confirmar o estilo antes de editar):
- `server/repos/crud.js` — `criarRepo`, `emTransacao`, `linha`.
- `server/domain/placas.js` e `server/routes/placas.js` — padrão de domínio puro + rotas.
- `server/routes/projetos.js`, `server/repos/projetos.js`, `server/domain/regras.js` — onde este plano mexe mais.
- `server/http/validar.js` — motor de validação genérico (`validar(corpo, regras, { parcial })`).
- `web/src/components/FormPlacaAvaria.jsx` + `.test.jsx` — padrão de componente com linhas dinâmicas e fetch próprio via `useCarregar`.
- `web/src/pages/Config.jsx` — padrão da seção "Repositório" que a nova seção de preços vai espelhar.

---

### Task 1: Migration + domínio puro de cálculo de serviços

**Files:**
- Create: `server/db/migrations/013_projetos_servicos.sql`
- Create: `server/domain/servicos.js`
- Test: `server/domain/servicos.test.js`

**Interfaces:**
- Produces: tabela `projetos_servicos(id, projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, venda_id, criado_em, atualizado_em)`; coluna `projetos.desconto_centavos`; `TIPOS_SERVICO: string[]` (`['placas_nfc', 'sistemas', 'saas', 'google_meu_negocio']`), `valorLinhaServico(servico): number`, `calcularValorTotal(servicos, descontoCentavos): number` exportados de `server/domain/servicos.js`.

- [ ] **Step 1: Criar a migration**

Crie `server/db/migrations/013_projetos_servicos.sql`:

```sql
CREATE TABLE projetos_servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('placas_nfc', 'sistemas', 'saas', 'google_meu_negocio')),
  modelo_id INTEGER REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  valor_unitario_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_unitario_centavos >= 0),
  venda_id INTEGER REFERENCES placas_vendas(id),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_projetos_servicos_projeto ON projetos_servicos(projeto_id);

ALTER TABLE projetos ADD COLUMN desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0);
```

- [ ] **Step 2: Escrever o teste do domínio (falhando)**

Crie `server/domain/servicos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { calcularValorTotal, valorLinhaServico, TIPOS_SERVICO } from './servicos.js';

describe('TIPOS_SERVICO', () => {
  it('tem os 4 tipos fixos, nessa ordem', () => {
    expect(TIPOS_SERVICO).toEqual(['placas_nfc', 'sistemas', 'saas', 'google_meu_negocio']);
  });
});

describe('valorLinhaServico', () => {
  it('multiplica valor unitário pela quantidade', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 1000, quantidade: 3 })).toBe(3000);
  });

  it('assume quantidade 1 quando omitida', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 1500 })).toBe(1500);
  });
});

describe('calcularValorTotal', () => {
  it('soma as linhas e aplica o desconto', () => {
    const servicos = [
      { valor_unitario_centavos: 10000, quantidade: 2 },
      { valor_unitario_centavos: 5000, quantidade: 1 },
    ];
    expect(calcularValorTotal(servicos, 3000)).toBe(22000);
  });

  it('nunca fica negativo quando o desconto é maior que a soma', () => {
    const servicos = [{ valor_unitario_centavos: 1000, quantidade: 1 }];
    expect(calcularValorTotal(servicos, 5000)).toBe(0);
  });

  it('sem serviços e sem desconto, o total é zero', () => {
    expect(calcularValorTotal([], 0)).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd server && npx vitest run domain/servicos.test.js`
Expected: FAIL — `Cannot find module './servicos.js'` (ou `TIPOS_SERVICO is not a function`/`is undefined`).

- [ ] **Step 4: Implementar `server/domain/servicos.js`**

```js
export const TIPOS_SERVICO = ['placas_nfc', 'sistemas', 'saas', 'google_meu_negocio'];

export function valorLinhaServico(servico) {
  return servico.valor_unitario_centavos * (servico.quantidade ?? 1);
}

export function calcularValorTotal(servicos, descontoCentavos) {
  const soma = servicos.reduce((total, s) => total + valorLinhaServico(s), 0);
  return Math.max(0, soma - descontoCentavos);
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd server && npx vitest run domain/servicos.test.js`
Expected: PASS (7 testes).

- [ ] **Step 6: Rodar a suíte completa do backend (migration não pode quebrar nada)**

Run: `cd server && npm test`
Expected: PASS — todos os testes existentes continuam passando (a migration nova é aplicada automaticamente por `openDb(':memory:')` em todo `criarContexto()`).

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/013_projetos_servicos.sql server/domain/servicos.js server/domain/servicos.test.js
git commit -m "feat: tabela projetos_servicos e cálculo de valor por serviços"
```

---

### Task 2: Extrair `calcularCustoUnitarioModelo` e repositório de serviços

**Files:**
- Modify: `server/domain/placas.js`
- Modify: `server/domain/placas.test.js`
- Modify: `server/routes/placas.js:259-291` (handler `POST /placas/vendas`)
- Create: `server/repos/servicos.js`

**Interfaces:**
- Consumes: `custoAtualMaterial(materialId, lotes)` (já existe em `server/domain/placas.js`); `criarRepo`, `linha` de `server/repos/crud.js`.
- Produces: `calcularCustoUnitarioModelo(modeloId, itensModelo, lotes): { erro: 'sem_receita' } | { erro: 'sem_lote' } | { custoUnitarioCentavos: number }` em `server/domain/placas.js`; `repoProjetosServicos(db)` com `{ obter, listar(projetoId), criar, atualizar, remover, removerPorProjetoSemVenda(projetoId), listarPlacasPendentes(projetoId) }` em `server/repos/servicos.js`.

- [ ] **Step 1: Escrever o teste de `calcularCustoUnitarioModelo` (falhando)**

Em `server/domain/placas.test.js`, adicione ao final do arquivo (reaproveitando os fixtures `lotes`/`itensModelo`/`MODELO_10x10`/`MODELO_10x15` já definidos no topo do arquivo):

```js
describe('calcularCustoUnitarioModelo', () => {
  it('reproduz o custo da receita: placa 10x10 = R$ 3,76', () => {
    expect(calcularCustoUnitarioModelo(MODELO_10x10, itensModelo, lotes)).toEqual({ custoUnitarioCentavos: 376 });
  });

  it('retorna erro sem_receita quando o modelo não tem itens', () => {
    expect(calcularCustoUnitarioModelo(999, itensModelo, lotes)).toEqual({ erro: 'sem_receita' });
  });

  it('retorna erro sem_lote quando algum material da receita não tem lote comprado', () => {
    const itensSemLote = [{ modelo_id: 999, material_id: 888, quantidade: 1 }];
    expect(calcularCustoUnitarioModelo(999, itensSemLote, lotes)).toEqual({ erro: 'sem_lote' });
  });
});
```

E atualize o import no topo do arquivo, de:
```js
import {
  custoUnitarioLote, custoAtualMaterial, estoqueMaterial, custoReceitaModelo,
  lucroPrevisto, lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
  custoItensAvaria, quantidadeConsumidaAvariaMaterial, resumoPrejuizoAvarias,
} from './placas.js';
```
para:
```js
import {
  custoUnitarioLote, custoAtualMaterial, estoqueMaterial, custoReceitaModelo,
  lucroPrevisto, lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
  custoItensAvaria, quantidadeConsumidaAvariaMaterial, resumoPrejuizoAvarias,
  calcularCustoUnitarioModelo,
} from './placas.js';
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx vitest run domain/placas.test.js`
Expected: FAIL — `calcularCustoUnitarioModelo is not a function`.

- [ ] **Step 3: Adicionar `calcularCustoUnitarioModelo` em `server/domain/placas.js`**

Adicione esta função ao final do arquivo `server/domain/placas.js` (não remova nada existente):

```js
export function calcularCustoUnitarioModelo(modeloId, itensModelo, lotes) {
  const itens = itensModelo.filter((i) => i.modelo_id === modeloId);
  if (!itens.length) return { erro: 'sem_receita' };
  let custoUnitarioCentavos = 0;
  for (const item of itens) {
    const custo = custoAtualMaterial(item.material_id, lotes);
    if (custo === null) return { erro: 'sem_lote' };
    custoUnitarioCentavos += custo * item.quantidade;
  }
  return { custoUnitarioCentavos };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npx vitest run domain/placas.test.js`
Expected: PASS (todos os testes existentes + os 3 novos).

- [ ] **Step 5: Reaproveitar a função em `POST /placas/vendas`, preservando as mensagens de erro atuais**

Em `server/routes/placas.js`, troque o import do domínio de:
```js
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
  custoItensAvaria, resumoPrejuizoAvarias,
} from '../domain/placas.js';
```
para:
```js
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
  custoItensAvaria, resumoPrejuizoAvarias, calcularCustoUnitarioModelo,
} from '../domain/placas.js';
```

E substitua este trecho de `r.post('/placas/vendas', ...)` (as linhas que calculam `custoUnitario`):

```js
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
```

por:

```js
    const lotesTodos = lotes.listar();
    const resultadoCusto = calcularCustoUnitarioModelo(modelo.id, itensModelo.listar(), lotesTodos);
    if (resultadoCusto.erro === 'sem_receita') {
      throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo sem receita cadastrada' }]);
    }
    if (resultadoCusto.erro === 'sem_lote') {
      throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
    }
    const custoUnitario = resultadoCusto.custoUnitarioCentavos;
```

(O resto da rota — criação da venda, cálculo de `avisosEstoque` — fica igual, pois `itensDoModelo` só era usado para esse loop; confirme com uma busca por `itensDoModelo` no arquivo que não sobrou nenhuma outra referência além da removida.)

- [ ] **Step 6: Rodar a suíte de rotas de placas e confirmar que nada quebrou**

Run: `cd server && npx vitest run routes/placas.test.js`
Expected: PASS — inclui o teste `recusa quando o modelo não tem lote comprado para a receita` com a mensagem exata preservada.

- [ ] **Step 7: Criar `server/repos/servicos.js`**

```js
import { criarRepo, linha } from './crud.js';

export const CAMPOS_SERVICO = ['projeto_id', 'tipo', 'modelo_id', 'quantidade', 'valor_unitario_centavos', 'venda_id'];

export function repoProjetosServicos(db) {
  const base = criarRepo(db, 'projetos_servicos', CAMPOS_SERVICO);
  return {
    ...base,
    listar(projetoId) {
      return base.listar({ projeto_id: projetoId }, 'id');
    },
    removerPorProjetoSemVenda(projetoId) {
      db.prepare('DELETE FROM projetos_servicos WHERE projeto_id = ? AND venda_id IS NULL').run(projetoId);
    },
    listarPlacasPendentes(projetoId) {
      return db
        .prepare("SELECT * FROM projetos_servicos WHERE projeto_id = ? AND tipo = 'placas_nfc' AND venda_id IS NULL")
        .all(projetoId)
        .map(linha);
    },
  };
}
```

Este repositório não tem teste isolado (como nenhum outro repo do projeto tem — são exercitados via testes de rota nas Tasks 4-6).

- [ ] **Step 8: Rodar a suíte completa do backend**

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/domain/placas.js server/domain/placas.test.js server/routes/placas.js server/repos/servicos.js
git commit -m "refactor: extrai calcularCustoUnitarioModelo e cria repoProjetosServicos"
```

---

### Task 3: Preços padrão de serviços em `/config`

**Files:**
- Modify: `server/routes/publicacao.js`
- Modify: `server/routes/publicacao.test.js`

**Interfaces:**
- Produces: `GET /api/config` e `PUT /api/config` passam a aceitar/devolver `preco_servico_sistemas_centavos`, `preco_servico_saas_centavos`, `preco_servico_google_meu_negocio_centavos` (inteiros ≥ 0, chave/valor na tabela `config` existente).

- [ ] **Step 1: Escrever os testes (falhando)**

Em `server/routes/publicacao.test.js`, adicione ao `describe('configuração', ...)`:

```js
  it('salva e devolve os preços padrão de serviço', async () => {
    await ctx.http.put('/api/config').send({
      preco_servico_sistemas_centavos: 150000,
      preco_servico_saas_centavos: 9900,
      preco_servico_google_meu_negocio_centavos: 20000,
    }).expect(200);
    const res = await ctx.http.get('/api/config').expect(200);
    expect(res.body).toMatchObject({
      preco_servico_sistemas_centavos: 150000,
      preco_servico_saas_centavos: 9900,
      preco_servico_google_meu_negocio_centavos: 20000,
    });
  });

  it('sem configurar ainda, os preços padrão de serviço vêm como 0', async () => {
    const res = await ctx.http.get('/api/config').expect(200);
    expect(res.body).toMatchObject({
      preco_servico_sistemas_centavos: 0,
      preco_servico_saas_centavos: 0,
      preco_servico_google_meu_negocio_centavos: 0,
    });
  });

  it('recusa preço de serviço negativo', async () => {
    const res = await ctx.http.put('/api/config').send({ preco_servico_saas_centavos: -100 }).expect(400);
    expect(res.body.erros[0].campo).toBe('preco_servico_saas_centavos');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx vitest run routes/publicacao.test.js -t "preços padrão"`
Expected: FAIL — `GET /config` não devolve essas chaves; `PUT /config` as ignora silenciosamente.

- [ ] **Step 3: Implementar em `server/routes/publicacao.js`**

Troque:
```js
const CHAVE_REPO = 'portfolio_repo_path';
```
por:
```js
const CHAVE_REPO = 'portfolio_repo_path';
const CHAVES_PRECO_SERVICO = [
  'preco_servico_sistemas_centavos',
  'preco_servico_saas_centavos',
  'preco_servico_google_meu_negocio_centavos',
];
```

Troque:
```js
  r.get('/config', (req, res) => res.json({
    portfolio_repo_path: obterConfig(db, CHAVE_REPO),
  }));

  r.put('/config', (req, res) => {
    const corpo = req.body ?? {};
    const erros = [];
    if ('portfolio_repo_path' in corpo) {
      const caminho = typeof corpo.portfolio_repo_path === 'string' ? corpo.portfolio_repo_path.trim() : '';
      const errosRepo = validarRepo(caminho);
      if (errosRepo.length) erros.push(...errosRepo.map((mensagem) => ({ campo: CHAVE_REPO, mensagem })));
      else definirConfig(db, CHAVE_REPO, caminho);
    }
    if (erros.length) throw new ErroValidacao(erros);
    res.json({ portfolio_repo_path: obterConfig(db, CHAVE_REPO) });
  });
```
por:
```js
  r.get('/config', (req, res) => res.json({
    portfolio_repo_path: obterConfig(db, CHAVE_REPO),
    ...Object.fromEntries(CHAVES_PRECO_SERVICO.map((chave) => [chave, Number(obterConfig(db, chave) ?? 0)])),
  }));

  r.put('/config', (req, res) => {
    const corpo = req.body ?? {};
    const erros = [];
    if ('portfolio_repo_path' in corpo) {
      const caminho = typeof corpo.portfolio_repo_path === 'string' ? corpo.portfolio_repo_path.trim() : '';
      const errosRepo = validarRepo(caminho);
      if (errosRepo.length) erros.push(...errosRepo.map((mensagem) => ({ campo: CHAVE_REPO, mensagem })));
      else definirConfig(db, CHAVE_REPO, caminho);
    }
    for (const chave of CHAVES_PRECO_SERVICO) {
      if (!(chave in corpo)) continue;
      const valor = Number(corpo[chave]);
      if (!Number.isInteger(valor) || valor < 0) {
        erros.push({ campo: chave, mensagem: 'Deve ser um número inteiro maior ou igual a zero' });
        continue;
      }
      definirConfig(db, chave, String(valor));
    }
    if (erros.length) throw new ErroValidacao(erros);
    res.json({
      portfolio_repo_path: obterConfig(db, CHAVE_REPO),
      ...Object.fromEntries(CHAVES_PRECO_SERVICO.map((chave) => [chave, Number(obterConfig(db, chave) ?? 0)])),
    });
  });
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd server && npx vitest run routes/publicacao.test.js`
Expected: PASS — inclui os 3 testes novos e todos os existentes (a assinatura antiga `{ portfolio_repo_path }` continua funcionando, só ganha 3 chaves extras).

Nota: o teste existente `recusa caminho inválido e salva caminho válido` usa `toEqual({ portfolio_repo_path: repo })` no `GET /config` — isso agora vai falhar porque a resposta ganhou 3 chaves novas. Ajuste esse teste específico (já existente) para `toEqual({ portfolio_repo_path: repo, preco_servico_sistemas_centavos: 0, preco_servico_saas_centavos: 0, preco_servico_google_meu_negocio_centavos: 0 })`.

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/publicacao.js server/routes/publicacao.test.js
git commit -m "feat: preco padrao de servicos (sistemas, saas, GMN) em /config"
```

---

### Task 4: `POST /projetos` aceita serviços e calcula o valor

**Files:**
- Modify: `server/repos/projetos.js:3-8` (array `CAMPOS_PROJETO`)
- Modify: `server/routes/projetos.js`
- Modify: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: `TIPOS_SERVICO`, `calcularValorTotal` de `server/domain/servicos.js`; `repoProjetosServicos` de `server/repos/servicos.js`; `repoPlacasModelos` de `server/repos/placas.js`; `obterConfig` de `server/repos/config.js`; `PUT /api/config` com `preco_servico_*_centavos` (Task 3).
- Produces: `POST /api/projetos` e `GET /api/projetos`/`GET /api/projetos/:id` passam a devolver `servicos: [{ id, tipo, modelo_id, quantidade, valor_unitario_centavos, venda_id, modelo_nome }]` e `desconto_centavos` em todo projeto. Função interna `validarServicos(servicosBrutos, { modelosRepo, db })` e `comServicos(projeto)`, usadas também pelas Tasks 5 e 6.

- [ ] **Step 1: Adicionar `desconto_centavos` ao repositório de projetos**

Em `server/repos/projetos.js`, troque:
```js
export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
  'postou_instagram', 'ficticio',
];
```
por:
```js
export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos', 'desconto_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
  'postou_instagram', 'ficticio',
];
```

- [ ] **Step 2: Escrever os testes de `POST /projetos` com serviços (falhando)**

Em `server/routes/projetos.test.js`, adicione este `describe` ao final do arquivo (dentro do mesmo `beforeEach` que já cria `cliente`):

```js
describe('/api/projetos com serviços', () => {
  async function criarModeloDePlaca(precoVendaCentavos = 8000) {
    return (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa 10x10 PVC', preco_venda_centavos: precoVendaCentavos }).expect(201)).body;
  }

  it('cria com 1 serviço de placas e calcula o valor a partir do preço do modelo', async () => {
    const modelo = await criarModeloDePlaca(8000);
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Placa pra loja',
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(16000);
    expect(res.body.desconto_centavos).toBe(0);
    expect(res.body.servicos).toEqual([
      expect.objectContaining({ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_unitario_centavos: 8000, venda_id: null, modelo_nome: 'Placa 10x10 PVC' }),
    ]);
  });

  it('cria com 2 serviços (placas + saas) somando os dois, com valor customizado por linha', async () => {
    const modelo = await criarModeloDePlaca(8000);
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site + placa',
      servicos: [
        { tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 },
        { tipo: 'saas', valor_unitario_centavos: 15000 },
      ],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(23000);
    expect(res.body.servicos.map((s) => s.tipo).sort()).toEqual(['placas_nfc', 'saas']);
  });

  it('serviço sem valor_unitario_centavos usa o preço padrão configurado', async () => {
    await ctx.http.put('/api/config').send({ preco_servico_sistemas_centavos: 50000 }).expect(200);
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Sistema sob medida', servicos: [{ tipo: 'sistemas' }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(50000);
    expect(res.body.servicos[0]).toMatchObject({ tipo: 'sistemas', modelo_id: null, quantidade: 1, valor_unitario_centavos: 50000 });
  });

  it('desconto reduz o total, nunca ficando negativo', async () => {
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Com desconto',
      servicos: [{ tipo: 'saas', valor_unitario_centavos: 10000 }], desconto_centavos: 30000,
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(0);
  });

  it('sem servicos no corpo, mantém o comportamento atual de valor manual', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Simples', valor_total_centavos: 12000 }).expect(201);
    expect(res.body.valor_total_centavos).toBe(12000);
    expect(res.body.servicos).toEqual([]);
  });

  it('valida tipo de serviço desconhecido', async () => {
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'X', servicos: [{ tipo: 'inexistente' }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].tipo', mensagem: 'Tipo de serviço inválido' }]);
  });

  it('placas_nfc exige modelo_id válido', async () => {
    const res = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'X', servicos: [{ tipo: 'placas_nfc', modelo_id: 999, quantidade: 1 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].modelo_id', mensagem: 'Modelo de placa não encontrado' }]);
  });

  it('funciona também no fluxo de criar com novo_cliente', async () => {
    const res = await ctx.http.post('/api/projetos').send({
      titulo: 'Loja nova', novo_cliente: { nome: 'Diego' }, servicos: [{ tipo: 'google_meu_negocio', valor_unitario_centavos: 20000 }],
    }).expect(201);
    expect(res.body.valor_total_centavos).toBe(20000);
    expect(res.body.cliente_nome).toBe('Diego');
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd server && npx vitest run routes/projetos.test.js -t "com serviços"`
Expected: FAIL — `servicos` undefined na resposta, ou erro de validação não reconhecido (o corpo `servicos` é simplesmente ignorado pelo código atual, então os totais ficam errados/zerados).

- [ ] **Step 4: Implementar o suporte a serviços em `server/routes/projetos.js`**

No topo do arquivo, troque os imports de:
```js
import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { ETAPAS, aplicarRegrasProjeto } from '../domain/regras.js';
import { REGRAS_CLIENTE } from './clientes.js';
```
por:
```js
import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoProjetosServicos } from '../repos/servicos.js';
import { repoPlacasModelos, repoPlacasModelosItens, repoPlacasLotes, repoPlacasVendas } from '../repos/placas.js';
import { obterConfig } from '../repos/config.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { ETAPAS, aplicarRegrasProjeto } from '../domain/regras.js';
import { TIPOS_SERVICO, calcularValorTotal } from '../domain/servicos.js';
import { calcularCustoUnitarioModelo } from '../domain/placas.js';
import { REGRAS_CLIENTE } from './clientes.js';
```

Troque `REGRAS_PROJETO` de:
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
para (só acrescenta `desconto_centavos`):
```js
const REGRAS_PROJETO = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  descricao: { tipo: 'texto' },
  etapa: { tipo: 'enum', valores: ETAPAS, padrao: 'contato' },
  valor_total_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  desconto_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
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

Depois de `exigirDadosMensalidade`, adicione a função de validação de serviços:

```js
function validarServicos(servicosBrutos, { modelosRepo, db }) {
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
      const valorUnitario = s.valor_unitario_centavos ?? modelo.preco_venda_centavos;
      if (!Number.isInteger(valorUnitario) || valorUnitario < 0) {
        throw new ErroValidacao([{ campo: `servicos[${i}].valor_unitario_centavos`, mensagem: 'Valor inválido' }]);
      }
      return { tipo: s.tipo, modelo_id: modeloId, quantidade, valor_unitario_centavos: valorUnitario };
    }
    const precoPadrao = Number(obterConfig(db, `preco_servico_${s.tipo}_centavos`) ?? 0);
    const valorUnitario = s.valor_unitario_centavos ?? precoPadrao;
    if (!Number.isInteger(valorUnitario) || valorUnitario < 0) {
      throw new ErroValidacao([{ campo: `servicos[${i}].valor_unitario_centavos`, mensagem: 'Valor inválido' }]);
    }
    return { tipo: s.tipo, modelo_id: null, quantidade: 1, valor_unitario_centavos: valorUnitario };
  });
}
```

Dentro de `export function rotasProjetos({ db, hoje })`, logo depois de `const projetos = repoProjetos(db);`, adicione as instâncias dos repositórios novos e os helpers compartilhados:

```js
  const projetosServicos = repoProjetosServicos(db);
  const modelos = repoPlacasModelos(db);
  const itensModelo = repoPlacasModelosItens(db);
  const lotes = repoPlacasLotes(db);
  const vendas = repoPlacasVendas(db);

  function comServicos(projeto) {
    const modelosTodos = modelos.listar();
    return {
      ...projeto,
      servicos: projetosServicos.listar(projeto.id).map((s) => ({
        ...s,
        modelo_nome: s.tipo === 'placas_nfc' ? (modelosTodos.find((m) => m.id === s.modelo_id)?.nome ?? '—') : null,
      })),
    };
  }

  function criarServicosDoProjeto(projetoId, servicosValidados) {
    for (const s of servicosValidados) projetosServicos.criar({ ...s, projeto_id: projetoId });
  }
```

Troque `r.get('/', ...)` de:
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
para:
```js
  r.get('/', (req, res) => {
    res.json(projetos.listarComCliente({
      etapa: req.query.etapa,
      cliente_id: req.query.cliente_id,
      postou_instagram: req.query.postou_instagram,
      ficticio: req.query.ficticio,
    }).map(comServicos));
  });
```

Troque `r.get('/:id', ...)` de:
```js
  r.get('/:id', (req, res) => {
    const projeto = projetos.obterComCliente(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    res.json(projeto);
  });
```
para:
```js
  r.get('/:id', (req, res) => {
    const projeto = projetos.obterComCliente(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    res.json(comServicos(projeto));
  });
```

Troque o handler `r.post('/', ...)` inteiro de:
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
para:
```js
  r.post('/', (req, res) => {
    const corpo = req.body ?? {};
    const temServicos = corpo.servicos !== undefined;
    const servicosValidados = temServicos ? validarServicos(corpo.servicos, { modelosRepo: modelos, db }) : null;

    function comValorDosServicos(dados) {
      if (!temServicos) return dados;
      const descontoCentavos = dados.desconto_centavos ?? 0;
      return { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(servicosValidados, descontoCentavos) };
    }

    if (corpo.novo_cliente) {
      let dadosCliente;
      try {
        dadosCliente = validar(corpo.novo_cliente, REGRAS_CLIENTE);
      } catch (erro) {
        if (!(erro instanceof ErroValidacao)) throw erro;
        throw new ErroValidacao(erro.erros.map((e) => ({ ...e, campo: `novo_cliente.${e.campo}` })));
      }
      const { cliente_id: _ignorado, ...regrasSemCliente } = REGRAS_PROJETO;
      const dados = comValorDosServicos(aplicarRegrasProjeto(null, validar(corpo, regrasSemCliente), hoje()));
      exigirDadosMensalidade(null, dados);
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        const projeto = projetos.criar({ ...dados, cliente_id: cliente.id });
        if (temServicos) criarServicosDoProjeto(projeto.id, servicosValidados);
        return projeto;
      });
      return res.status(201).json(comServicos(projetos.obterComCliente(criado.id)));
    }
    const dados = comValorDosServicos(aplicarRegrasProjeto(null, validar(corpo, REGRAS_PROJETO), hoje()));
    exigirDadosMensalidade(null, dados);
    exigirCliente(dados.cliente_id);
    const criado = temServicos
      ? emTransacao(db, () => {
          const projeto = projetos.criar(dados);
          criarServicosDoProjeto(projeto.id, servicosValidados);
          return projeto;
        })
      : projetos.criar(dados);
    res.status(201).json(comServicos(projetos.obterComCliente(criado.id)));
  });
```

- [ ] **Step 5: Rodar os testes novos e confirmar que passam**

Run: `cd server && npx vitest run routes/projetos.test.js`
Expected: PASS — inclui todos os testes antigos (sem regressão) e o novo `describe('/api/projetos com serviços', ...)`.

- [ ] **Step 6: Commit**

```bash
git add server/repos/projetos.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: POST /projetos aceita servicos e calcula valor_total_centavos"
```

---

### Task 5: `PUT /projetos/:id` edita serviços e recalcula o total

**Files:**
- Modify: `server/routes/projetos.js` (handler `r.put('/:id', ...)`)
- Modify: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: `validarServicos`, `comServicos`, `criarServicosDoProjeto` (Task 4); `projetosServicos.removerPorProjetoSemVenda(projetoId)` (Task 2).
- Produces: `PUT /api/projetos/:id` aceita `servicos`/`desconto_centavos` opcionais; preserva linhas de `placas_nfc` já vendidas (`venda_id` não nulo).

- [ ] **Step 1: Escrever os testes (falhando)**

Adicione ao `describe('/api/projetos com serviços', ...)` criado na Task 4:

```js
  it('atualizar trocando os serviços recalcula o total', async () => {
    const res1 = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servicos: [{ tipo: 'saas', valor_unitario_centavos: 10000 }],
    }).expect(201);
    const res2 = await ctx.http.put(`/api/projetos/${res1.body.id}`).send({
      servicos: [{ tipo: 'google_meu_negocio', valor_unitario_centavos: 7000 }], desconto_centavos: 1000,
    }).expect(200);
    expect(res2.body.valor_total_centavos).toBe(6000);
    expect(res2.body.servicos).toEqual([
      expect.objectContaining({ tipo: 'google_meu_negocio', valor_unitario_centavos: 7000 }),
    ]);
  });

  it('atualizar sem servicos no corpo não toca em projetos_servicos', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servicos: [{ tipo: 'saas', valor_unitario_centavos: 10000 }],
    })).body;
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({ titulo: 'Projeto renomeado' }).expect(200);
    expect(res.body.titulo).toBe('Projeto renomeado');
    expect(res.body.valor_total_centavos).toBe(10000);
    expect(res.body.servicos).toHaveLength(1);
  });

  it('atualizar preserva linha de placas_nfc já vendida (com venda_id) ao trocar os serviços', async () => {
    const modelo = await criarModeloDePlaca(8000);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    })).body;
    const material = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa' })).body;
    await ctx.http.post('/api/placas/lotes').send({ material_id: material.id, quantidade: 10, valor_kit_centavos: 1000, data_compra: '2026-09-01' });
    await ctx.http.put(`/api/placas/modelos/${modelo.id}`).send({ itens: [{ material_id: material.id, quantidade: 1 }] });
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);

    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({ servicos: [{ tipo: 'saas', valor_unitario_centavos: 5000 }] }).expect(200);
    const tipos = res.body.servicos.map((s) => s.tipo).sort();
    expect(tipos).toEqual(['placas_nfc', 'saas']);
    expect(res.body.valor_total_centavos).toBe(8000 + 5000);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx vitest run routes/projetos.test.js -t "atualizar"`
Expected: FAIL — `PUT` ignora `servicos`, o total não muda.

- [ ] **Step 3: Implementar no handler `PUT /:id`**

Troque:
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
por:
```js
  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = projetos.obter(id);
    if (!atual) throw naoEncontrado('Projeto');
    const corpo = req.body ?? {};
    const temServicos = corpo.servicos !== undefined;
    const servicosValidados = temServicos ? validarServicos(corpo.servicos, { modelosRepo: modelos, db }) : null;

    const dadosBase = aplicarRegrasProjeto(atual, validar(corpo, REGRAS_PROJETO, { parcial: true }), hoje());
    exigirDadosMensalidade(atual, dadosBase);
    if (dadosBase.cliente_id !== undefined) exigirCliente(dadosBase.cliente_id);

    emTransacao(db, () => {
      let dados = dadosBase;
      if (temServicos) {
        projetosServicos.removerPorProjetoSemVenda(id);
        criarServicosDoProjeto(id, servicosValidados);
        const descontoCentavos = dados.desconto_centavos ?? atual.desconto_centavos ?? 0;
        dados = { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(projetosServicos.listar(id), descontoCentavos) };
      }
      projetos.atualizar(id, dados);
    });
    res.json(comServicos(projetos.obterComCliente(id)));
  });
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd server && npx vitest run routes/projetos.test.js`
Expected: PASS — todos os testes, incluindo os de mensalidade/postou_instagram/ficticio já existentes (nenhuma regressão).

- [ ] **Step 5: Commit**

```bash
git add server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: PUT /projetos/:id edita servicos preservando linhas já vendidas"
```

---

### Task 6: Entrega com serviço de Placas NFC cria a venda

**Files:**
- Modify: `server/routes/projetos.js` (handler `r.put('/:id', ...)`)
- Modify: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: `calcularCustoUnitarioModelo` (Task 2); `projetosServicos.listarPlacasPendentes(projetoId)` (Task 2); `criarServicosDoProjeto` (Task 4); `vendas.criar(...)` de `repoPlacasVendas`.
- Produces: ao transicionar a etapa para `'entregue'`, cria 1 linha em `placas_vendas` por linha de serviço `placas_nfc` pendente e grava `venda_id` nela; bloqueia a transição com `ErroValidacao` se a receita do modelo estiver incompleta.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicione ao `describe('/api/projetos com serviços', ...)`:

```js
  async function prepararReceita(modeloId) {
    const material = (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa' })).body;
    await ctx.http.post('/api/placas/lotes').send({ material_id: material.id, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' });
    await ctx.http.put(`/api/placas/modelos/${modeloId}`).send({ itens: [{ material_id: material.id, quantidade: 1 }] });
  }

  it('mudar etapa para entregue com serviço de placas cria a venda e marca venda_id', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2 }],
    })).body;

    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    expect(res.body.servicos[0].venda_id).not.toBeNull();

    const vendas = (await ctx.http.get('/api/placas/vendas')).body;
    expect(vendas).toHaveLength(1);
    expect(vendas[0]).toMatchObject({ modelo_id: modelo.id, quantidade: 2, preco_vendido_centavos: 8000, cliente_id: cliente.id, custo_unitario_centavos: 249 });
  });

  it('mudar etapa para entregue de novo não duplica a venda (idempotência)', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'proposta' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);

    const vendas = (await ctx.http.get('/api/placas/vendas')).body;
    expect(vendas).toHaveLength(1);
  });

  it('modelo sem receita bloqueia a transição para entregue com erro claro', async () => {
    const modelo = await criarModeloDePlaca(8000);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Projeto', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    })).body;

    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Modelo de placa sem receita cadastrada, não é possível registrar a venda' }]);
    expect((await ctx.http.get(`/api/projetos/${criado.id}`)).body.etapa).toBe('contato');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx vitest run routes/projetos.test.js -t "entregue"`
Expected: FAIL — nenhuma venda é criada, `GET /placas/vendas` fica vazio.

- [ ] **Step 3: Implementar a criação da venda na transição para `entregue`**

No `server/routes/projetos.js`, depois da função `criarServicosDoProjeto` (Task 4), adicione:

```js
  function processarEntregaDePlacas(atual, dados, projetoId) {
    const vaiEntregar = atual.etapa !== 'entregue' && dados.etapa === 'entregue';
    if (!vaiEntregar) return;
    const pendentes = projetosServicos.listarPlacasPendentes(projetoId);
    if (!pendentes.length) return;
    const itensModeloTodos = itensModelo.listar();
    const lotesTodos = lotes.listar();
    for (const linhaServico of pendentes) {
      const resultado = calcularCustoUnitarioModelo(linhaServico.modelo_id, itensModeloTodos, lotesTodos);
      if (resultado.erro === 'sem_receita') {
        throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Modelo de placa sem receita cadastrada, não é possível registrar a venda' }]);
      }
      if (resultado.erro === 'sem_lote') {
        throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
      }
      const venda = vendas.criar({
        modelo_id: linhaServico.modelo_id,
        quantidade: linhaServico.quantidade,
        preco_vendido_centavos: linhaServico.valor_unitario_centavos,
        custo_unitario_centavos: resultado.custoUnitarioCentavos,
        cliente_id: atual.cliente_id,
        comprador_nome: null,
        data_venda: hoje(),
      });
      projetosServicos.atualizar(linhaServico.id, { venda_id: venda.id });
    }
  }
```

E, dentro de `r.put('/:id', ...)`, chame essa função logo antes de `projetos.atualizar(id, dados)`, dentro do bloco `emTransacao`:

```js
    emTransacao(db, () => {
      let dados = dadosBase;
      if (temServicos) {
        projetosServicos.removerPorProjetoSemVenda(id);
        criarServicosDoProjeto(id, servicosValidados);
        const descontoCentavos = dados.desconto_centavos ?? atual.desconto_centavos ?? 0;
        dados = { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(projetosServicos.listar(id), descontoCentavos) };
      }
      processarEntregaDePlacas(atual, dados, id);
      projetos.atualizar(id, dados);
    });
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd server && npx vitest run routes/projetos.test.js`
Expected: PASS — inclui os 3 testes novos de entrega e todos os anteriores (a regra de `data_entrega` auto-preenchida continua funcionando, pois `aplicarRegrasProjeto` não foi alterada).

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: entregar oportunidade com placas NFC cria a venda em placas_vendas"
```

---

### Task 7: Rótulos + componente `CamposServicos`

**Files:**
- Modify: `web/src/lib/rotulos.js`
- Modify: `web/src/lib/rotulos.test.js`
- Create: `web/src/components/CamposServicos.jsx`
- Create: `web/src/components/CamposServicos.test.jsx`

**Interfaces:**
- Consumes: `api` de `web/src/api/client.js`; `useCarregar` de `web/src/hooks/useCarregar.js`; `apenasAtivos` de `web/src/lib/ativos.js`; `paraCentavos`, `centavosParaTexto`, `formatarDinheiro` de `web/src/lib/dinheiro.js`.
- Produces: `ROTULO_TIPO_SERVICO: Record<string,string>`, `TIPOS_SERVICO: string[]` em `web/src/lib/rotulos.js`. Componente `<CamposServicos servicos desconto onChange />` em `web/src/components/CamposServicos.jsx`, onde `onChange({ servicos, desconto_centavos })` é chamado a cada mudança com o array/valor já prontos para ir no corpo da requisição (`servicos: [{ tipo, modelo_id?, quantidade?, valor_unitario_centavos }]`).

- [ ] **Step 1: Adicionar os rótulos (com teste)**

Em `web/src/lib/rotulos.js`, adicione ao final do arquivo:

```js
export const ROTULO_TIPO_SERVICO = {
  placas_nfc: 'Placas NFC',
  sistemas: 'Sistemas',
  saas: 'SaaS',
  google_meu_negocio: 'Google Meu Negócio',
};
export const TIPOS_SERVICO = Object.keys(ROTULO_TIPO_SERVICO);
```

Em `web/src/lib/rotulos.test.js`, adicione ao final do arquivo (ajustando o import no topo para incluir `TIPOS_SERVICO, ROTULO_TIPO_SERVICO`):

```js
describe('rótulos de serviço', () => {
  it('tem os 4 tipos fixos, cada um com rótulo', () => {
    expect(TIPOS_SERVICO).toEqual(['placas_nfc', 'sistemas', 'saas', 'google_meu_negocio']);
    for (const tipo of TIPOS_SERVICO) expect(ROTULO_TIPO_SERVICO[tipo]).toBeTruthy();
  });
});
```

Run: `cd web && npx vitest run src/lib/rotulos.test.js`
Expected: PASS.

- [ ] **Step 2: Escrever o teste de `CamposServicos` (falhando)**

Crie `web/src/components/CamposServicos.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CamposServicos } from './CamposServicos.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('CamposServicos', () => {
  it('marcar "Placas NFC" adiciona a linha com o primeiro modelo ativo e o preço dele', async () => {
    mockApi({
      'GET /placas/modelos': [{ id: 1, nome: 'Placa 10x10 PVC', ativo: 1, preco_venda_centavos: 8000 }],
      'GET /config': {},
    });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={(v) => emitidos.push(v)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    expect(screen.getByLabelText('Modelo da placa')).toHaveValue('1');
    expect(screen.getByLabelText('Valor de Placas NFC')).toHaveValue('80,00');
    expect(emitidos.at(-1)).toEqual({
      servicos: [{ tipo: 'placas_nfc', modelo_id: 1, quantidade: 1, valor_unitario_centavos: 8000 }],
      desconto_centavos: 0,
    });
  });

  it('marcar "SaaS" usa o preço padrão configurado', async () => {
    mockApi({ 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 } });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={(v) => emitidos.push(v)} />);
    await userEvent.setup().click(await screen.findByLabelText('SaaS'));
    expect(screen.getByLabelText('Valor de SaaS')).toHaveValue('150,00');
    expect(emitidos.at(-1).servicos).toEqual([{ tipo: 'saas', valor_unitario_centavos: 15000 }]);
  });

  it('trocar o modelo de placas atualiza o valor sugerido', async () => {
    mockApi({
      'GET /placas/modelos': [
        { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, preco_venda_centavos: 8000 },
        { id: 2, nome: 'Placa 10x15 Acrílico', ativo: 1, preco_venda_centavos: 10000 },
      ],
      'GET /config': {},
    });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    await user.selectOptions(screen.getByLabelText('Modelo da placa'), '2');
    expect(screen.getByLabelText('Valor de Placas NFC')).toHaveValue('100,00');
  });

  it('desmarcar remove a linha', async () => {
    mockApi({ 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 } });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={(v) => emitidos.push(v)} />);
    const user = userEvent.setup();
    const checkbox = await screen.findByLabelText('SaaS');
    await user.click(checkbox);
    await user.click(checkbox);
    expect(screen.queryByLabelText('Valor de SaaS')).not.toBeInTheDocument();
    expect(emitidos.at(-1)).toEqual({ servicos: [], desconto_centavos: 0 });
  });

  it('subtotal, desconto e total calculam certo na tela', async () => {
    mockApi({ 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 10000 } });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('SaaS'));
    expect(screen.getByText(/Subtotal: R\$ 100,00/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Desconto (R$)'), '20');
    expect(screen.getByText(/Total: R\$ 80,00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd web && npx vitest run src/components/CamposServicos.test.jsx`
Expected: FAIL — `Cannot find module './CamposServicos.jsx'`.

- [ ] **Step 4: Implementar `web/src/components/CamposServicos.jsx`**

```jsx
import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO } from '../lib/rotulos.js';
import { apenasAtivos } from '../lib/ativos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function linhaInicial(tipo, modelos, config) {
  if (tipo === 'placas_nfc') {
    const modelo = apenasAtivos(modelos)[0];
    return { tipo, modelo_id: modelo ? String(modelo.id) : '', quantidade: '1', valor: modelo ? centavosParaTexto(modelo.preco_venda_centavos) : '0,00' };
  }
  const precoPadrao = config?.[`preco_servico_${tipo}_centavos`] ?? 0;
  return { tipo, modelo_id: '', quantidade: '1', valor: centavosParaTexto(precoPadrao) };
}

function paraSaida(linhas, descontoTexto) {
  return {
    servicos: linhas.map((l) => (
      l.tipo === 'placas_nfc'
        ? { tipo: l.tipo, modelo_id: Number(l.modelo_id) || null, quantidade: Number(l.quantidade) || 1, valor_unitario_centavos: paraCentavos(l.valor) || 0 }
        : { tipo: l.tipo, valor_unitario_centavos: paraCentavos(l.valor) || 0 }
    )),
    desconto_centavos: paraCentavos(descontoTexto) || 0,
  };
}

export function CamposServicos({ servicos, desconto, onChange }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: config } = useCarregar(() => api('/config'), []);
  const [linhas, setLinhas] = useState(
    (servicos ?? []).map((s) => ({
      tipo: s.tipo,
      modelo_id: s.modelo_id ? String(s.modelo_id) : '',
      quantidade: String(s.quantidade ?? 1),
      valor: centavosParaTexto(s.valor_unitario_centavos ?? 0),
    })),
  );
  const [descontoTexto, setDescontoTexto] = useState(centavosParaTexto(desconto ?? 0));

  function alternar(tipo, marcado) {
    const proximas = marcado ? [...linhas, linhaInicial(tipo, modelos, config)] : linhas.filter((l) => l.tipo !== tipo);
    setLinhas(proximas);
    onChange(paraSaida(proximas, descontoTexto));
  }

  function alterarLinha(tipo, campo, valor) {
    const proximas = linhas.map((l) => {
      if (l.tipo !== tipo) return l;
      if (campo === 'modelo_id') {
        const modelo = (modelos ?? []).find((m) => String(m.id) === valor);
        return { ...l, modelo_id: valor, valor: modelo ? centavosParaTexto(modelo.preco_venda_centavos) : l.valor };
      }
      return { ...l, [campo]: valor };
    });
    setLinhas(proximas);
    onChange(paraSaida(proximas, descontoTexto));
  }

  function alterarDesconto(valor) {
    setDescontoTexto(valor);
    onChange(paraSaida(linhas, valor));
  }

  const subtotal = linhas.reduce((soma, l) => soma + (paraCentavos(l.valor) || 0) * (l.tipo === 'placas_nfc' ? (Number(l.quantidade) || 1) : 1), 0);
  const total = Math.max(0, subtotal - (paraCentavos(descontoTexto) || 0));

  return (
    <div className="campos-servicos">
      <fieldset>
        <legend>Serviços</legend>
        {TIPOS_SERVICO.map((tipo) => {
          const linha = linhas.find((l) => l.tipo === tipo);
          return (
            <div className="campos-servicos__linha" key={tipo}>
              <label>
                <input type="checkbox" checked={Boolean(linha)} onChange={(e) => alternar(tipo, e.target.checked)} />{' '}
                {ROTULO_TIPO_SERVICO[tipo]}
              </label>
              {linha && tipo === 'placas_nfc' && (
                <>
                  <select aria-label="Modelo da placa" value={linha.modelo_id} onChange={(e) => alterarLinha(tipo, 'modelo_id', e.target.value)}>
                    <option value="">Selecione…</option>
                    {apenasAtivos(modelos, linha.modelo_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <input aria-label="Quantidade de placas" type="number" min="1" value={linha.quantidade} onChange={(e) => alterarLinha(tipo, 'quantidade', e.target.value)} />
                </>
              )}
              {linha && (
                <input aria-label={`Valor de ${ROTULO_TIPO_SERVICO[tipo]}`} inputMode="decimal" value={linha.valor} onChange={(e) => alterarLinha(tipo, 'valor', e.target.value)} />
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="campos-servicos__linha">
        <label htmlFor="campos-servicos-desconto">Desconto (R$)</label>
        <input id="campos-servicos-desconto" inputMode="decimal" value={descontoTexto} onChange={(e) => alterarDesconto(e.target.value)} />
      </div>
      <p className="campos-servicos__total">Subtotal: {formatarDinheiro(subtotal)} — Total: {formatarDinheiro(total)}</p>
    </div>
  );
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd web && npx vitest run src/components/CamposServicos.test.jsx`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/rotulos.js web/src/lib/rotulos.test.js web/src/components/CamposServicos.jsx web/src/components/CamposServicos.test.jsx
git commit -m "feat: componente CamposServicos (selecao de servicos da oportunidade)"
```

---

### Task 8: Integrar `CamposServicos` em `FormOportunidade`

**Files:**
- Modify: `web/src/components/FormOportunidade.jsx`
- Modify: `web/src/pages/Funil.test.jsx`

**Interfaces:**
- Consumes: `<CamposServicos servicos desconto onChange />` (Task 7).
- Produces: `POST /projetos` passa a incluir `servicos`/`desconto_centavos` no corpo quando há ao menos 1 serviço marcado; sem serviço, comportamento 100% preservado (`valor_total_centavos` manual).

- [ ] **Step 1: Atualizar os mocks dos testes existentes de `Funil` (para não gerar chamadas sem mock)**

Em `web/src/pages/Funil.test.jsx`, em **todos** os `mockApi({...})` que abrem o modal "+ Oportunidade" (ou seja, todo teste que chama `abrir()` seguido de clicar em `'+ Oportunidade'`), adicione as duas chaves `'GET /placas/modelos': []` e `'GET /config': {}`. Concretamente, troque cada uma destas 4 chamadas:

```js
mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [] });
```
```js
const { chamadas } = mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 } });
```
```js
mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [] });
```
```js
const { chamadas } = mockApi({
  'GET /projetos?ficticio=0': [], 'GET /projetos?ficticio=1': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
});
```

por (mesma ordem, só com as 2 chaves novas adicionadas):

```js
mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [], 'GET /placas/modelos': [], 'GET /config': {} });
```
```js
const { chamadas } = mockApi({
  'GET /projetos?ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 }, 'GET /placas/modelos': [], 'GET /config': {},
});
```
```js
mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [], 'GET /placas/modelos': [], 'GET /config': {} });
```
```js
const { chamadas } = mockApi({
  'GET /projetos?ficticio=0': [], 'GET /projetos?ficticio=1': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
  'GET /placas/modelos': [], 'GET /config': {},
});
```

- [ ] **Step 2: Escrever os novos testes de serviço (falhando)**

Adicione ao final do `describe('Funil', ...)` em `web/src/pages/Funil.test.jsx`:

```js
  it('nova oportunidade com serviço marcado esconde o campo Valor manual e envia servicos', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
      'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 },
    });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.selectOptions(screen.getByLabelText('Cliente'), '3');
    await user.click(await screen.findByLabelText('SaaS'));
    expect(screen.queryByLabelText('Valor (R$)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    const corpo = chamadas.find((c) => c.metodo === 'POST').corpo;
    expect(corpo).toEqual({
      titulo: 'Site', etapa: 'contato', prazo_entrega: '', ficticio: false, cliente_id: 3,
      servicos: [{ tipo: 'saas', valor_unitario_centavos: 15000 }], desconto_centavos: 0,
    });
    expect(corpo).not.toHaveProperty('valor_total_centavos');
  });

  it('desmarcar o único serviço volta a mostrar o campo Valor manual', async () => {
    mockApi({
      'GET /projetos?ficticio=0': [], 'GET /clientes': [], 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 },
    });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    const checkboxSaas = await screen.findByLabelText('SaaS');
    await user.click(checkboxSaas);
    expect(screen.queryByLabelText('Valor (R$)')).not.toBeInTheDocument();
    await user.click(checkboxSaas);
    expect(screen.getByLabelText('Valor (R$)')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd web && npx vitest run src/pages/Funil.test.jsx -t "serviço"`
Expected: FAIL — `CamposServicos` ainda não está integrado ao `FormOportunidade`, então não há checkbox "SaaS" no formulário.

- [ ] **Step 4: Integrar em `web/src/components/FormOportunidade.jsx`**

Substitua o arquivo inteiro por:

```jsx
import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { CamposServicos } from './CamposServicos.jsx';
import { paraCentavos } from '../lib/dinheiro.js';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA } from '../lib/rotulos.js';

export function FormOportunidade({ onSalvar, ficticioFixo = false }) {
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { valores, campo, setValores } = useFormulario({
    titulo: '', cliente_id: '', novo_cliente_nome: '', valor: '', prazo_entrega: '',
    etapa: ficticioFixo ? 'andamento' : 'contato', ficticio: ficticioFixo,
  });
  const [servicos, setServicos] = useState([]);
  const [descontoCentavos, setDescontoCentavos] = useState(0);
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const clienteNovo = valores.cliente_id === 'novo';
  const etapasDisponiveis = valores.ficticio ? ETAPAS_FICTICIO : ETAPAS;

  function alternarFicticio(marcado) {
    setValores((v) => ({
      ...v,
      ficticio: marcado,
      etapa: marcado ? 'andamento' : 'contato',
    }));
  }

  function enviar(e) {
    e.preventDefault();
    const corpo = { titulo: valores.titulo, etapa: valores.etapa, prazo_entrega: valores.prazo_entrega, ficticio: valores.ficticio };
    if (servicos.length) {
      corpo.servicos = servicos;
      corpo.desconto_centavos = descontoCentavos;
    } else {
      const valor = paraCentavos(valores.valor);
      if (Number.isNaN(valor)) {
        setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
        return;
      }
      corpo.valor_total_centavos = valor ?? 0;
    }
    if (clienteNovo) corpo.novo_cliente = { nome: valores.novo_cliente_nome };
    else corpo.cliente_id = valores.cliente_id ? Number(valores.cliente_id) : null;
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Título" nome="titulo" erros={erros} {...campo('titulo')} />
      <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
        <select {...campo('cliente_id')}>
          <option value="">Selecione…</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="novo">+ Novo cliente</option>
        </select>
      </Campo>
      {clienteNovo && (
        <Campo rotulo="Nome do novo cliente" nome="novo_cliente.nome" erros={erros} {...campo('novo_cliente_nome')} />
      )}
      <Campo rotulo="Etapa" nome="etapa" erros={erros}>
        <select {...campo('etapa')}>
          {etapasDisponiveis.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
        </select>
      </Campo>
      <CamposServicos
        servicos={servicos}
        desconto={descontoCentavos}
        onChange={({ servicos: proximos, desconto_centavos: proximoDesconto }) => {
          setServicos(proximos);
          setDescontoCentavos(proximoDesconto);
        }}
      />
      {servicos.length === 0 && (
        <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" placeholder="0,00" {...campo('valor')} />
      )}
      <Campo rotulo="Prazo de entrega" nome="prazo_entrega" erros={erros} type="date" {...campo('prazo_entrega')} />
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.ficticio)}
            disabled={ficticioFixo}
            onChange={(e) => alternarFicticio(e.target.checked)}
          />{' '}
          Projeto fictício (só portfólio)
        </label>
      </div>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Criar oportunidade</button></div>
    </form>
  );
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd web && npx vitest run src/pages/Funil.test.jsx`
Expected: PASS — todos os testes antigos (com os mocks atualizados no Step 1) e os 2 novos.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/FormOportunidade.jsx web/src/pages/Funil.test.jsx
git commit -m "feat: FormOportunidade usa CamposServicos ao marcar servico"
```

---

### Task 9: Integrar `CamposServicos` em `AbaGeral`

**Files:**
- Modify: `web/src/pages/projeto/AbaGeral.jsx`
- Modify: `web/src/pages/projeto/Projeto.test.jsx`

**Interfaces:**
- Consumes: `<CamposServicos servicos desconto onChange />` (Task 7); `projeto.servicos`/`projeto.desconto_centavos` vindos do backend (Task 4).
- Produces: `PUT /projetos/:id` passa a incluir `servicos`/`desconto_centavos` quando há ao menos 1 serviço; sem serviço, comportamento preservado.

- [ ] **Step 1: Escrever os testes novos (falhando)**

Em `web/src/pages/projeto/Projeto.test.jsx`, adicione ao final do `describe('Projeto', ...)` (e inclua `'GET /placas/modelos': []` e `'GET /config': {}` nos mocks dos 2 testes novos):

```js
  it('projeto com serviços existentes mostra o bloco de serviços e some o campo Valor manual', async () => {
    const projetoComServico = {
      ...projetoExemplo,
      valor_total_centavos: 15000,
      desconto_centavos: 0,
      servicos: [{ id: 1, tipo: 'saas', modelo_id: null, quantidade: 1, valor_unitario_centavos: 15000, venda_id: null, modelo_nome: null }],
    };
    mockApi({
      'GET /projetos/5': projetoComServico, 'GET /clientes': [{ id: 1, nome: 'Ana' }],
      'GET /placas/modelos': [], 'GET /config': {},
    });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    expect(await screen.findByLabelText('SaaS')).toBeChecked();
    expect(screen.queryByLabelText('Valor (R$)')).not.toBeInTheDocument();
  });

  it('trocar os serviços e salvar envia servicos/desconto, sem valor_total_centavos manual', async () => {
    const projetoComServico = {
      ...projetoExemplo,
      valor_total_centavos: 15000,
      desconto_centavos: 0,
      servicos: [{ id: 1, tipo: 'saas', modelo_id: null, quantidade: 1, valor_unitario_centavos: 15000, venda_id: null, modelo_nome: null }],
    };
    const { chamadas } = mockApi({
      'GET /projetos/5': projetoComServico, 'GET /clientes': [{ id: 1, nome: 'Ana' }],
      'GET /placas/modelos': [], 'GET /config': { preco_servico_google_meu_negocio_centavos: 20000 },
      'PUT /projetos/5': { ...projetoComServico, atualizado_em: 'T2' },
    });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('SaaS'));
    await user.click(screen.getByLabelText('Google Meu Negócio'));
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo.servicos).toEqual([{ tipo: 'google_meu_negocio', valor_unitario_centavos: 20000 }]);
    expect(put.corpo).not.toHaveProperty('valor_total_centavos');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd web && npx vitest run src/pages/projeto/Projeto.test.jsx -t "serviços"`
Expected: FAIL — `AbaGeral` não tem checkbox "SaaS"/"Google Meu Negócio" nem esconde o campo "Valor (R$)".

- [ ] **Step 3: Integrar em `web/src/pages/projeto/AbaGeral.jsx`**

No topo do arquivo, troque:
```jsx
import { useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { centavosParaTexto, paraCentavos } from '../../lib/dinheiro.js';
import { ETAPAS, ROTULO_ETAPA } from '../../lib/rotulos.js';
```
por:
```jsx
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { CamposServicos } from '../../components/CamposServicos.jsx';
import { centavosParaTexto, paraCentavos } from '../../lib/dinheiro.js';
import { ETAPAS, ROTULO_ETAPA } from '../../lib/rotulos.js';
```

Logo depois da declaração de `valores`/`campo`/`setValores` (depois do `useFormulario({...})`), adicione:
```jsx
  const [servicos, setServicos] = useState(
    (projeto.servicos ?? []).map((s) => ({ tipo: s.tipo, modelo_id: s.modelo_id, quantidade: s.quantidade, valor_unitario_centavos: s.valor_unitario_centavos })),
  );
  const [descontoCentavos, setDescontoCentavos] = useState(projeto.desconto_centavos ?? 0);
```

Troque a função `salvar` de:
```jsx
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
por:
```jsx
  function salvar(e) {
    e.preventDefault();
    const mensalidadeValorCentavos = valores.mensalidade_ativa ? paraCentavos(valores.mensalidade_valor) : 0;
    if (valores.mensalidade_ativa && (mensalidadeValorCentavos === null || Number.isNaN(mensalidadeValorCentavos))) {
      setErros([{ campo: 'mensalidade_valor_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const corpoValor = {};
    if (servicos.length) {
      corpoValor.servicos = servicos;
      corpoValor.desconto_centavos = descontoCentavos;
    } else {
      const valorCentavos = paraCentavos(valores.valor);
      if (Number.isNaN(valorCentavos)) {
        setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
        return;
      }
      corpoValor.valor_total_centavos = valorCentavos ?? 0;
    }
    const { valor: _valor, mensalidade_valor: _mensalidadeValor, ...resto } = valores;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, {
        method: 'PUT',
        body: {
          ...resto,
          ...corpoValor,
          cliente_id: Number(resto.cliente_id),
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

E, no JSX, troque:
```jsx
      <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" {...campo('valor')} />
```
por:
```jsx
      <CamposServicos
        servicos={servicos}
        desconto={descontoCentavos}
        onChange={({ servicos: proximos, desconto_centavos: proximoDesconto }) => {
          setServicos(proximos);
          setDescontoCentavos(proximoDesconto);
        }}
      />
      {servicos.length === 0 && (
        <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" {...campo('valor')} />
      )}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd web && npx vitest run src/pages/projeto/Projeto.test.jsx`
Expected: PASS — todos os testes antigos (nenhum deles marca um serviço, então continuam no modo manual) e os 2 novos.

Nota: os testes antigos de `Projeto.test.jsx` que não mockam `GET /placas/modelos`/`GET /config` vão gerar uma resposta sintética 404 "Sem mock" interna ao `CamposServicos`, tratada silenciosamente pelo `useCarregar` (sem quebrar o teste). Se preferir deixar a suíte sem esse ruído, adicione as mesmas duas chaves vazias (`'GET /placas/modelos': []`, `'GET /config': {}`) aos `mockApi({...})` dos testes antigos também.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/projeto/AbaGeral.jsx web/src/pages/projeto/Projeto.test.jsx
git commit -m "feat: AbaGeral usa CamposServicos ao marcar servico"
```

---

### Task 10: Preços padrão de serviço na tela de Configurações

**Files:**
- Modify: `web/src/pages/Config.jsx`
- Modify: `web/src/pages/Config.test.jsx`

**Interfaces:**
- Consumes: `GET /config`/`PUT /config` com `preco_servico_*_centavos` (Task 3).
- Produces: nova seção "Preços padrão de serviços" na tela `/config`.

- [ ] **Step 1: Escrever o teste (falhando)**

Em `web/src/pages/Config.test.jsx`, adicione ao final do `describe('Config', ...)`:

```js
  it('salva os preços padrão de serviço', async () => {
    const { chamadas } = mockApi({
      'GET /config': { portfolio_repo_path: null, preco_servico_sistemas_centavos: 0, preco_servico_saas_centavos: 0, preco_servico_google_meu_negocio_centavos: 0 },
      'PUT /config': { preco_servico_sistemas_centavos: 150000, preco_servico_saas_centavos: 9900, preco_servico_google_meu_negocio_centavos: 20000 },
    });
    renderizar(<Config />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Sistemas (R$)'), '1500');
    await user.type(screen.getByLabelText('SaaS (R$)'), '99');
    await user.type(screen.getByLabelText('Google Meu Negócio (R$)'), '200');
    await user.click(screen.getByRole('button', { name: 'Salvar preços' }));
    expect(await screen.findByText('Preços salvos.')).toBeInTheDocument();
    const put = chamadas.find((c) => c.caminho === '/config' && c.metodo === 'PUT');
    expect(put.corpo).toEqual({
      preco_servico_sistemas_centavos: 150000, preco_servico_saas_centavos: 9900, preco_servico_google_meu_negocio_centavos: 20000,
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd web && npx vitest run src/pages/Config.test.jsx -t "preços padrão"`
Expected: FAIL — não existe o rótulo "Sistemas (R$)" na tela.

- [ ] **Step 3: Implementar em `web/src/pages/Config.jsx`**

Troque o import de:
```jsx
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from '../components/Campo.jsx';
import { Aviso } from '../components/Aviso.jsx';
```
por:
```jsx
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from '../components/Campo.jsx';
import { Aviso } from '../components/Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
```

Troque o corpo de `export function Config()` de:
```jsx
export function Config() {
  const { dados: config, erro } = useCarregar(() => api('/config'), []);
  return (
    <section>
      <header className="pagina__topo"><h1>Configurações</h1></header>
      <Aviso erro={erro} />
      {config && <Repositorio inicial={config} />}
      <Publicacao />
      <section className="cartao">
        <h2>Backup</h2>
        <p>Baixa um .zip com o banco de dados e todas as imagens enviadas.</p>
        <a className="btn" href="/api/backup" download>Exportar backup (.zip)</a>
      </section>
    </section>
  );
}
```
por:
```jsx
export function Config() {
  const { dados: config, erro } = useCarregar(() => api('/config'), []);
  return (
    <section>
      <header className="pagina__topo"><h1>Configurações</h1></header>
      <Aviso erro={erro} />
      {config && <Repositorio inicial={config} />}
      {config && <PrecosServicos inicial={config} />}
      <Publicacao />
      <section className="cartao">
        <h2>Backup</h2>
        <p>Baixa um .zip com o banco de dados e todas as imagens enviadas.</p>
        <a className="btn" href="/api/backup" download>Exportar backup (.zip)</a>
      </section>
    </section>
  );
}

function PrecosServicos({ inicial }) {
  const { valores, campo } = useFormulario({
    preco_sistemas: centavosParaTexto(inicial.preco_servico_sistemas_centavos ?? 0),
    preco_saas: centavosParaTexto(inicial.preco_servico_saas_centavos ?? 0),
    preco_gmn: centavosParaTexto(inicial.preco_servico_google_meu_negocio_centavos ?? 0),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const [salvo, setSalvo] = useState(false);

  function salvar(e) {
    e.preventDefault();
    setSalvo(false);
    const sistemas = paraCentavos(valores.preco_sistemas);
    const saas = paraCentavos(valores.preco_saas);
    const gmn = paraCentavos(valores.preco_gmn);
    if ([sistemas, saas, gmn].some((v) => v === null || Number.isNaN(v))) {
      setErros([{ campo: 'preco_servico_sistemas_centavos', mensagem: 'Valores inválidos' }]);
      return;
    }
    executar(async () => {
      await api('/config', {
        method: 'PUT',
        body: {
          preco_servico_sistemas_centavos: sistemas,
          preco_servico_saas_centavos: saas,
          preco_servico_google_meu_negocio_centavos: gmn,
        },
      });
      setSalvo(true);
    });
  }

  return (
    <section className="cartao">
      <h2>Preços padrão de serviços</h2>
      <form onSubmit={salvar} className="form" noValidate>
        <Campo rotulo="Sistemas (R$)" nome="preco_servico_sistemas_centavos" erros={erros} inputMode="decimal" {...campo('preco_sistemas')} />
        <Campo rotulo="SaaS (R$)" nome="preco_servico_saas_centavos" erros={erros} inputMode="decimal" {...campo('preco_saas')} />
        <Campo rotulo="Google Meu Negócio (R$)" nome="preco_servico_google_meu_negocio_centavos" erros={erros} inputMode="decimal" {...campo('preco_gmn')} />
        <Aviso erro={erro} />
        {salvo && <p className="aviso aviso--ok" role="status">Preços salvos.</p>}
        <div><button className="btn btn--primario" disabled={enviando}>Salvar preços</button></div>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd web && npx vitest run src/pages/Config.test.jsx`
Expected: PASS — todos os testes antigos (a chave `preco_servico_*` extra no `GET /config` desses testes antigos não quebra nada, pois `PrecosServicos` usa `?? 0` como default) e o novo.

- [ ] **Step 5: Rodar a suíte completa do frontend**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Config.jsx web/src/pages/Config.test.jsx
git commit -m "feat: tela de precos padrao de servico em Configuracoes"
```

---

## Verificação final

- [ ] Rodar `cd server && npm test` — tudo verde.
- [ ] Rodar `cd web && npm test` — tudo verde.
- [ ] Testar manualmente no navegador (`npm start` no server + `npm run dev` no web, ou o script combinado do projeto): criar uma oportunidade no Funil marcando "Placas NFC" com um modelo existente, confirmar que o valor calcula certo, mover a etapa para "Entregue" e confirmar em `/placas` que a venda apareceu com o cliente certo.
