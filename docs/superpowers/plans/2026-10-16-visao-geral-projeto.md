# Visão geral do projeto — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projeto de site/sistema ganha nicho, categorias (sem preço, ≥ 1), início configurável da mensalidade e uma Visão geral redesenhada com pré-visualização do site; etapa só muda pelo Funil.

**Architecture:** Migration 016 cria `categorias`, `nichos`, `projetos_categorias` e as colunas de nicho/início da mensalidade, convertendo as linhas Sistemas/SaaS em categorias. Regras de data da mensalidade ficam em funções puras (`server/domain/mensalidade.js`) usadas pelo servidor (geração de parcelas) e pela tela (frase "1ª mensalidade em …"). A Visão geral é reescrita em cartões com componentes pequenos (`SeletorCategorias`, `SeletorNicho`, `PreviaSite`).

**Tech Stack:** Node 24 (`node:sqlite`), Express 5, React 19, react-router 8, Vitest 5 + supertest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-16-visao-geral-projeto-design.md`

## Global Constraints

- Arquivos do projeto usam CRLF; edite com Edit/Write (que preservam) ou normalize/restaure ao usar scripts.
- Commits em Conventional Commits, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Textos de interface em português do Brasil, iguais aos da spec (ex.: "Escolha pelo menos uma categoria", "alterar no Funil", "+ novo nicho…").
- Tema escuro existente: use os tokens de `web/src/styles.css` (`--superficie`, `--borda`, `--primaria`, `--texto-suave`…) e as classes já existentes `.cartao`, `.pilula`, `.etapa`, `.campo`, `.btn`.
- Este plano roda sobre a branch `feat/sites-minimalista` (já tem `.pilula`, `.etapa`, `.selo-divulgacao`). Crie `feat/visao-geral-projeto` a partir dela.
- Não mexer em GMN e Placas além do necessário (mensalidade deles mantém o comportamento).
- `pm2` não recarrega o servidor sozinho: após mudanças de servidor/migration, `pm2 restart crm-madia-api`.
- Suíte completa: `npm test` (raiz). Arquivo único: `npx vitest run <caminho>`.

## Desvio da spec (Ruling já tomado ao planejar)

- **Categoria padrão no servidor:** criar projeto de site **sem** o campo `categorias` recebe a categoria "Site" (ou a primeira por ordem, se "Site" não existir). Mandar `categorias: []` continua 400 "Escolha pelo menos uma categoria". Motivo: ~80 testes e qualquer chamada antiga criam site sem categorias; a obrigatoriedade de escolher fica na interface (o formulário exige ≥ 1), e o invariante "todo site tem ≥ 1 categoria" se mantém. Custo se errado: um site criado por API sem escolha explícita vira "Site".
- **Mensalidade de GMN/Placas criada ou ligada depois da migration:** quando a mensalidade passa a ativa sem `mensalidade_inicio_data` no corpo, o servidor grava modo `data` com a data de hoje. Mantém o "cobra a partir de agora" de hoje.
- `categorias` e `nichos` ganham `atualizado_em` (o `criarRepo` grava os dois carimbos).

## Review Focus

1. Link do site sem protocolo (`pingou.com.br`) — o iframe e os botões devem usar `https://pingou.com.br`, nunca um caminho relativo dentro do CRM. (Task 9)
2. Mudar a data de início/modo depois que mensalidades já foram geradas — nada existente é apagado nem duplicado; meses que já têm mensalidade (inclusive com outro dia) não ganham segunda. (Task 5)
3. Nome de nicho/categoria repetido com outra caixa ("barbearia" vs "Barbearia") — 400 "Já existe", e a tela mostra o erro sem perder o texto digitado. (Tasks 3 e 7)
4. Desmarcar a última categoria na Visão geral — o salvar mostra "Escolha pelo menos uma categoria" no campo e não chama a API. (Task 8)
5. Excluir categoria/nicho em uso — 409 "Em uso por N projeto(s)" e a lista continua igual na tela. (Tasks 3 e 6)

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `server/db/migrations/016_categorias_nichos_mensalidade.sql` | criar | esquema + conversão |
| `server/db/connection.test.js` | modificar | teste da conversão |
| `server/domain/mensalidade.js` (+ `.test.js`) | criar | `inicioMensalidade`, `mensalidadesDevidas`, `MODOS_INICIO_MENSALIDADE` |
| `server/domain/regras.js` (+ teste) | modificar | `data_inicio` automática ao ir para andamento |
| `server/repos/categorias.js` | criar | repos de categorias, nichos e ligação projeto↔categoria |
| `server/routes/cadastros.js` (+ `.test.js`) | criar | `/api/categorias` e `/api/nichos` |
| `server/app.js` | modificar | registrar as rotas |
| `server/domain/servicos.js` (+ teste) | modificar | site sem linhas; `TIPOS_SERVICO` sem sistemas/saas |
| `server/repos/projetos.js` | modificar | campos novos e `nicho_nome` |
| `server/routes/projetos.js` (+ teste) | modificar | categorias, nicho, mensalidade |
| `server/routes/publicacao.js` (+ teste) | modificar | só preço de GMN no config |
| `server/repos/mensalidades.js` | criar | `gerarMensalidades`, `gerarTodasMensalidades` |
| `server/routes/parcelas.js`, `server/routes/painel.js` (+ testes) | modificar | chamar a geração |
| `web/src/pages/config/CadastroLista.jsx` (+ teste) | criar | lista genérica adicionar/renomear/excluir/ordenar |
| `web/src/pages/Config.jsx` (+ teste) | modificar | seções Categorias e Nichos; preços só GMN |
| `web/src/components/SeletorCategorias.jsx` (+ teste) | criar | pílulas de categoria |
| `web/src/components/SeletorNicho.jsx` (+ teste) | criar | select + "+ novo nicho…" |
| `web/src/components/FormOportunidade.jsx`, `web/src/pages/Funil.test.jsx` | modificar | categorias + valor |
| `web/src/components/CamposServicos.jsx` (+ teste) | apagar | substituído |
| `web/src/lib/rotulos.js` (+ teste) | modificar | tirar sistemas/saas |
| `web/src/pages/projeto/AbaGeral.jsx` | reescrever | nova Visão geral |
| `web/src/pages/projeto/CobrancaMensal.jsx` | criar | bloco de mensalidade + frase |
| `web/src/pages/projeto/PreviaSite.jsx` (+ teste) | criar | iframe/capa/aviso + botões |
| `web/src/pages/projeto/Projeto.jsx` (+ teste) | modificar | etapa com `.etapa` |
| `web/src/styles.css` | modificar | grade da Visão geral, prévia |

---

### Task 1: Migration 016 (esquema + conversão)

**Files:**
- Create: `server/db/migrations/016_categorias_nichos_mensalidade.sql`
- Test: `server/db/connection.test.js` (novo `describe` no fim)

**Interfaces:**
- Produces: tabelas `categorias(id, nome, ordem, criado_em, atualizado_em)`, `nichos(id, nome, criado_em, atualizado_em)`, `projetos_categorias(projeto_id, categoria_id)`; colunas `projetos.nicho_id`, `projetos.mensalidade_inicio_modo` (`'desenvolvimento'|'entrega'|'data'`, padrão `'entrega'`), `projetos.mensalidade_inicio_data`. Categorias iniciais: Site(1), Landing page(2), Sistema(3), SaaS(4) — ids 1..4 num banco novo.

- [ ] **Step 1: Escrever o teste da conversão** (no fim de `server/db/connection.test.js`, reaproveitando os imports já existentes no arquivo)

```js
describe('migration 016_categorias_nichos_mensalidade', () => {
  function bancoAte016() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('CREATE TABLE schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
    const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql') && f < '016').sort()) {
      db.exec(readFileSync(path.join(pasta, arquivo), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?, ?)').run(arquivo, 'x');
    }
    return db;
  }

  it('converte linhas em categorias, define início das mensalidades e apaga os preços', () => {
    const db = bancoAte016();
    const t = '2026-10-01T00:00:00.000Z';
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
    const projeto = (id, extra = '') => db.exec(`INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em${extra ? ', ' + extra.split('|')[0] : ''})
      VALUES (${id}, 1, 'P${id}', '2026-08-15T10:00:00.000Z', '${t}'${extra ? ', ' + extra.split('|')[1] : ''})`);
    projeto(1); // sem linhas → Site
    projeto(2); // sistemas + saas
    projeto(3, 'mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento|1, 5000, 5'); // ativa sem parcela
    projeto(4, 'mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento|1, 5000, 10'); // ativa com parcelas
    projeto(5, "servico, etapa, mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento|'google_meu_negocio', 'andamento', 1, 3000, 10");
    const linhaServico = db.prepare(`INSERT INTO projetos_servicos (projeto_id, tipo, valor_unitario_centavos, criado_em, atualizado_em) VALUES (?, ?, 100, '${t}', '${t}')`);
    linhaServico.run(2, 'sistemas');
    linhaServico.run(2, 'saas');
    const mensal = db.prepare(`INSERT INTO parcelas (projeto_id, descricao, valor_centavos, vencimento, mensalidade, criado_em, atualizado_em) VALUES (4, 'Mensalidade', 5000, ?, 1, '${t}', '${t}')`);
    mensal.run('2026-09-10');
    mensal.run('2026-08-10');
    db.prepare("INSERT INTO config (chave, valor) VALUES ('preco_servico_sistemas_centavos', '150000'), ('preco_servico_saas_centavos', '9900'), ('preco_servico_google_meu_negocio_centavos', '20000')").run();

    migrate(db);

    expect(db.prepare('SELECT nome FROM categorias ORDER BY ordem').all().map((c) => c.nome)).toEqual(['Site', 'Landing page', 'Sistema', 'SaaS']);
    const categoriasDe = (id) => db.prepare(`SELECT c.nome FROM projetos_categorias pc JOIN categorias c ON c.id = pc.categoria_id
      WHERE pc.projeto_id = ? ORDER BY c.ordem`).all(id).map((c) => c.nome);
    expect(categoriasDe(1)).toEqual(['Site']);
    expect(categoriasDe(2)).toEqual(['Sistema', 'SaaS']);
    expect(categoriasDe(5)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM projetos_servicos WHERE tipo IN ('sistemas', 'saas')").get().n).toBe(0);
    const inicio = (id) => ({ ...db.prepare('SELECT mensalidade_inicio_modo AS modo, mensalidade_inicio_data AS data FROM projetos WHERE id = ?').get(id) });
    expect(inicio(1)).toEqual({ modo: 'entrega', data: null });
    expect(inicio(3)).toEqual({ modo: 'entrega', data: null });
    expect(inicio(4)).toEqual({ modo: 'data', data: '2026-08-10' });
    expect(inicio(5)).toEqual({ modo: 'data', data: '2026-08-15' });
    expect(db.prepare('SELECT chave FROM config ORDER BY chave').all().map((c) => c.chave)).toEqual(['preco_servico_google_meu_negocio_centavos']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM nichos').get().n).toBe(0);
  });

  it('nome de categoria e nicho é único sem diferenciar maiúsculas', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO nichos (nome, criado_em, atualizado_em) VALUES ('Barbearia', 'x', 'x')").run();
    expect(() => db.prepare("INSERT INTO nichos (nome, criado_em, atualizado_em) VALUES ('barbearia', 'x', 'x')").run()).toThrow(/UNIQUE/);
    expect(() => db.prepare("INSERT INTO categorias (nome, criado_em, atualizado_em) VALUES ('site', 'x', 'x')").run()).toThrow(/UNIQUE/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/db/connection.test.js`
Expected: FAIL — `no such table: categorias`.

- [ ] **Step 3: Criar a migration**

`server/db/migrations/016_categorias_nichos_mensalidade.sql`:

```sql
CREATE TABLE categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE nichos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE projetos_categorias (
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  PRIMARY KEY (projeto_id, categoria_id)
);
CREATE INDEX idx_projetos_categorias_categoria ON projetos_categorias(categoria_id);

ALTER TABLE projetos ADD COLUMN nicho_id INTEGER REFERENCES nichos(id);
ALTER TABLE projetos ADD COLUMN mensalidade_inicio_modo TEXT NOT NULL DEFAULT 'entrega'
  CHECK (mensalidade_inicio_modo IN ('desenvolvimento', 'entrega', 'data'));
ALTER TABLE projetos ADD COLUMN mensalidade_inicio_data TEXT;

INSERT INTO categorias (nome, ordem, criado_em, atualizado_em) VALUES
  ('Site', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Landing page', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Sistema', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('SaaS', 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Linhas Sistemas/SaaS dos sites viram categorias.
INSERT INTO projetos_categorias (projeto_id, categoria_id)
  SELECT DISTINCT ps.projeto_id, c.id
  FROM projetos_servicos ps
  JOIN projetos p ON p.id = ps.projeto_id
  JOIN categorias c ON c.nome = CASE ps.tipo WHEN 'sistemas' THEN 'Sistema' ELSE 'SaaS' END
  WHERE ps.tipo IN ('sistemas', 'saas') AND p.servico = 'site_sistema';

-- Site sem linha nenhuma recebe "Site".
INSERT INTO projetos_categorias (projeto_id, categoria_id)
  SELECT p.id, (SELECT id FROM categorias WHERE nome = 'Site')
  FROM projetos p
  WHERE p.servico = 'site_sistema'
    AND NOT EXISTS (SELECT 1 FROM projetos_categorias pc WHERE pc.projeto_id = p.id);

DELETE FROM projetos_servicos WHERE tipo IN ('sistemas', 'saas');

-- Mensalidade que já gerou parcela: começa na primeira mensalidade existente.
UPDATE projetos
  SET mensalidade_inicio_modo = 'data',
      mensalidade_inicio_data = (SELECT MIN(pa.vencimento) FROM parcelas pa WHERE pa.projeto_id = projetos.id AND pa.mensalidade = 1)
  WHERE mensalidade_ativa = 1
    AND EXISTS (SELECT 1 FROM parcelas pa WHERE pa.projeto_id = projetos.id AND pa.mensalidade = 1);

-- GMN/placas com mensalidade e sem parcela: cobra desde a criação (comportamento antigo).
UPDATE projetos
  SET mensalidade_inicio_modo = 'data', mensalidade_inicio_data = substr(criado_em, 1, 10)
  WHERE servico <> 'site_sistema' AND mensalidade_ativa = 1 AND mensalidade_inicio_data IS NULL;

DELETE FROM config WHERE chave IN ('preco_servico_sistemas_centavos', 'preco_servico_saas_centavos');
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/db/connection.test.js`
Expected: PASS (todos do arquivo).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/016_categorias_nichos_mensalidade.sql server/db/connection.test.js
git commit -m "feat: migration de categorias, nichos e inicio da mensalidade"
```

---

### Task 2: Regras de data (mensalidade + início automático)

**Files:**
- Create: `server/domain/mensalidade.js`, `server/domain/mensalidade.test.js`
- Modify: `server/domain/regras.js`, `server/domain/regras.test.js`

**Interfaces:**
- Produces:
  - `MODOS_INICIO_MENSALIDADE: ['desenvolvimento', 'entrega', 'data']`
  - `inicioMensalidade(projeto) → 'AAAA-MM-DD' | null` (lê `mensalidade_inicio_modo` — padrão `'entrega'` —, `data_inicio`, `data_entrega`, `mensalidade_inicio_data`)
  - `mensalidadesDevidas(projeto, hoje) → string[]` (datas em ordem; vazio se `!mensalidade_ativa` ou sem início)
  - `aplicarRegrasProjeto(atual, mudancas, hoje)` passa a preencher `data_inicio` quando `etapa === 'andamento'` e ela está vazia.

- [ ] **Step 1: Testes do domínio**

`server/domain/mensalidade.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MODOS_INICIO_MENSALIDADE, inicioMensalidade, mensalidadesDevidas } from './mensalidade.js';

const base = {
  mensalidade_ativa: 1, mensalidade_dia_vencimento: 10, mensalidade_inicio_modo: 'entrega',
  data_inicio: '2026-07-01', data_entrega: '2026-08-15', mensalidade_inicio_data: '2026-09-05',
};

describe('inicioMensalidade', () => {
  it('lista os três modos na ordem da tela', () => {
    expect(MODOS_INICIO_MENSALIDADE).toEqual(['desenvolvimento', 'entrega', 'data']);
  });

  it('usa a data de cada modo', () => {
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'desenvolvimento' })).toBe('2026-07-01');
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'entrega' })).toBe('2026-08-15');
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'data' })).toBe('2026-09-05');
  });

  it('sem modo vale entrega; sem a data do modo, não começou', () => {
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: undefined })).toBe('2026-08-15');
    expect(inicioMensalidade({ ...base, data_entrega: null })).toBeNull();
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '' })).toBeNull();
  });
});

describe('mensalidadesDevidas', () => {
  it('a primeira vence na data do gatilho e as seguintes no dia escolhido, até o mês atual', () => {
    expect(mensalidadesDevidas(base, '2026-10-02')).toEqual(['2026-08-15', '2026-09-10', '2026-10-10']);
  });

  it('nada antes do início nem depois do mês de hoje', () => {
    expect(mensalidadesDevidas(base, '2026-07-31')).toEqual([]);
    expect(mensalidadesDevidas(base, '2026-08-01')).toEqual(['2026-08-15']);
  });

  it('dia 31 vira o último dia em meses curtos', () => {
    const p = { ...base, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-01-31', mensalidade_dia_vencimento: 31 };
    expect(mensalidadesDevidas(p, '2026-03-05')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('sem dia de vencimento usa o dia do início', () => {
    const p = { ...base, mensalidade_dia_vencimento: null };
    expect(mensalidadesDevidas(p, '2026-09-20')).toEqual(['2026-08-15', '2026-09-15']);
  });

  it('desativada ou sem início não gera nada', () => {
    expect(mensalidadesDevidas({ ...base, mensalidade_ativa: 0 }, '2026-10-02')).toEqual([]);
    expect(mensalidadesDevidas({ ...base, data_entrega: null }, '2026-10-02')).toEqual([]);
  });
});
```

Em `server/domain/regras.test.js`, acrescente (mantendo os imports do arquivo; adicione `aplicarRegrasProjeto` ao import se faltar):

```js
describe('aplicarRegrasProjeto — início automático', () => {
  it('ir para andamento preenche data_inicio vazia', () => {
    expect(aplicarRegrasProjeto({ data_inicio: null }, { etapa: 'andamento' }, '2026-10-16')).toEqual({ etapa: 'andamento', data_inicio: '2026-10-16' });
  });

  it('não sobrescreve data_inicio existente nem a enviada', () => {
    expect(aplicarRegrasProjeto({ data_inicio: '2026-09-01' }, { etapa: 'andamento' }, '2026-10-16')).toEqual({ etapa: 'andamento' });
    expect(aplicarRegrasProjeto(null, { etapa: 'andamento', data_inicio: '2026-01-02' }, '2026-10-16'))
      .toEqual({ etapa: 'andamento', data_inicio: '2026-01-02' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/domain/mensalidade.test.js server/domain/regras.test.js`
Expected: FAIL — módulo `./mensalidade.js` não existe; regras sem `data_inicio`.

- [ ] **Step 3: Implementar**

`server/domain/mensalidade.js`:

```js
import { dataNoMes, mesDe, somarMeses } from './datas.js';

export const MODOS_INICIO_MENSALIDADE = ['desenvolvimento', 'entrega', 'data'];

const CAMPO_DO_MODO = { desenvolvimento: 'data_inicio', entrega: 'data_entrega', data: 'mensalidade_inicio_data' };

// Data em que a cobrança começa; null enquanto o gatilho não aconteceu.
export function inicioMensalidade(projeto) {
  const campo = CAMPO_DO_MODO[projeto.mensalidade_inicio_modo] ?? CAMPO_DO_MODO.entrega;
  return projeto[campo] || null;
}

// A 1ª vence na data do gatilho; as seguintes, todo mês no dia escolhido, até o mês de `hoje`.
export function mensalidadesDevidas(projeto, hoje) {
  if (!projeto.mensalidade_ativa) return [];
  const inicio = inicioMensalidade(projeto);
  if (!inicio || mesDe(inicio) > mesDe(hoje)) return [];
  const dia = projeto.mensalidade_dia_vencimento || Number(inicio.slice(8, 10));
  const datas = [inicio];
  for (let i = 1; ; i++) {
    const mes = mesDe(somarMeses(`${mesDe(inicio)}-01`, i));
    if (mes > mesDe(hoje)) break;
    datas.push(dataNoMes(mes, dia));
  }
  return datas;
}
```

Em `server/domain/regras.js`, troque `aplicarRegrasProjeto` por:

```js
export function aplicarRegrasProjeto(atual, mudancas, hoje) {
  const comInicio = preencherData(atual, mudancas, { campo: 'etapa', valor: 'andamento', campoData: 'data_inicio' }, hoje);
  return preencherData(atual, comInicio, { campo: 'etapa', valor: 'entregue', campoData: 'data_entrega' }, hoje);
}
```

- [ ] **Step 4: Rodar e ver passar; depois a suíte do servidor**

Run: `npx vitest run server/domain` → PASS.
Run: `npx vitest run server` → se algum teste de rota esperava `data_inicio: null` após ir para andamento, ajuste o esperado para a data de hoje do contexto (`'2026-09-23'`) e registre no ledger.

- [ ] **Step 5: Commit**

```bash
git add server/domain/mensalidade.js server/domain/mensalidade.test.js server/domain/regras.js server/domain/regras.test.js
git commit -m "feat: regras de inicio da mensalidade e data de inicio automatica"
```

---

### Task 3: Cadastros de categorias e nichos (API)

**Files:**
- Create: `server/repos/categorias.js`, `server/routes/cadastros.js`, `server/routes/cadastros.test.js`
- Modify: `server/app.js`

**Interfaces:**
- Produces (repos):
  - `repoCategorias(db)` → `{ obter, criar, atualizar, remover, listarOrdenadas(), contarUso(id), idComNome(nome) , proximaOrdem() }`
  - `repoNichos(db)` → `{ obter, criar, atualizar, remover, listarOrdenadas(), contarUso(id), idComNome(nome) }`
  - `repoProjetosCategorias(db)` → `{ listar(projetoId) → [{ id, nome }], substituir(projetoId, ids) }`
- Produces (HTTP): `GET/POST /api/categorias`, `PUT/DELETE /api/categorias/:id`, idem `/api/nichos`. Respostas: lista ordenada; 201 com o registro; 400 `{ erros: [{ campo: 'nome', mensagem: 'Já existe' }] }`; 409 `{ erro: 'Em uso por N projeto(s)' }`; 404.

- [ ] **Step 1: Testes das rotas**

`server/routes/cadastros.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

describe('/api/categorias', () => {
  it('lista as iniciais em ordem e cria uma nova no fim', async () => {
    const inicial = (await ctx.http.get('/api/categorias').expect(200)).body;
    expect(inicial.map((c) => c.nome)).toEqual(['Site', 'Landing page', 'Sistema', 'SaaS']);
    const nova = (await ctx.http.post('/api/categorias').send({ nome: '  Cardápio digital ' }).expect(201)).body;
    expect(nova).toMatchObject({ nome: 'Cardápio digital', ordem: 5 });
    expect((await ctx.http.get('/api/categorias')).body.at(-1).nome).toBe('Cardápio digital');
  });

  it('recusa nome vazio e repetido (sem diferenciar maiúsculas)', async () => {
    expect((await ctx.http.post('/api/categorias').send({ nome: ' ' }).expect(400)).body.erros).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
    expect((await ctx.http.post('/api/categorias').send({ nome: 'site' }).expect(400)).body.erros).toEqual([{ campo: 'nome', mensagem: 'Já existe' }]);
  });

  it('renomeia e muda a ordem; renomear para o próprio nome é permitido', async () => {
    const res = await ctx.http.put('/api/categorias/2').send({ nome: 'Landing Page', ordem: 9 }).expect(200);
    expect(res.body).toMatchObject({ id: 2, nome: 'Landing Page', ordem: 9 });
    await ctx.http.put('/api/categorias/3').send({ nome: 'saas' }).expect(400);
  });

  it('exclui a que não está em uso; em uso responde 409', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', categorias: [3] }).expect(201);
    expect((await ctx.http.delete('/api/categorias/3').expect(409)).body.erro).toBe('Em uso por 1 projeto(s)');
    await ctx.http.delete('/api/categorias/2').expect(204);
    await ctx.http.delete('/api/categorias/2').expect(404);
  });
});

describe('/api/nichos', () => {
  it('cria, lista em ordem alfabética, recusa repetido e exclui', async () => {
    await ctx.http.post('/api/nichos').send({ nome: 'Sorveteria' }).expect(201);
    const barbearia = (await ctx.http.post('/api/nichos').send({ nome: 'Barbearia' }).expect(201)).body;
    expect((await ctx.http.get('/api/nichos')).body.map((n) => n.nome)).toEqual(['Barbearia', 'Sorveteria']);
    expect((await ctx.http.post('/api/nichos').send({ nome: 'BARBEARIA' }).expect(400)).body.erros[0].mensagem).toBe('Já existe');
    await ctx.http.delete(`/api/nichos/${barbearia.id}`).expect(204);
  });

  it('nicho em uso não pode ser excluído', async () => {
    const nicho = (await ctx.http.post('/api/nichos').send({ nome: 'Padaria' })).body;
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', nicho_id: nicho.id }).expect(201);
    expect((await ctx.http.delete(`/api/nichos/${nicho.id}`).expect(409)).body.erro).toBe('Em uso por 1 projeto(s)');
  });
});
```

> Os dois testes que criam projeto com `categorias`/`nicho_id` só passam depois da Task 4. Neste passo, escreva o arquivo inteiro; no Step 4 rode com `-t` excluindo-os (ver comando) e confirme-os na Task 4.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/routes/cadastros.test.js`
Expected: FAIL — 404 em `/api/categorias`.

- [ ] **Step 3: Implementar**

`server/repos/categorias.js`:

```js
import { criarRepo, linha } from './crud.js';

function comNomeUnico(db, tabela) {
  return {
    idComNome(nome) {
      return db.prepare(`SELECT id FROM ${tabela} WHERE nome = ? COLLATE NOCASE`).get(nome)?.id ?? null;
    },
  };
}

export function repoCategorias(db) {
  const base = criarRepo(db, 'categorias', ['nome', 'ordem']);
  return {
    ...base,
    ...comNomeUnico(db, 'categorias'),
    listarOrdenadas() {
      return base.listar({}, 'ordem, nome COLLATE NOCASE');
    },
    proximaOrdem() {
      return db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM categorias').get().n;
    },
    contarUso(id) {
      return db.prepare('SELECT COUNT(*) AS n FROM projetos_categorias WHERE categoria_id = ?').get(id).n;
    },
  };
}

export function repoNichos(db) {
  const base = criarRepo(db, 'nichos', ['nome']);
  return {
    ...base,
    ...comNomeUnico(db, 'nichos'),
    listarOrdenadas() {
      return base.listar({}, 'nome COLLATE NOCASE');
    },
    contarUso(id) {
      return db.prepare('SELECT COUNT(*) AS n FROM projetos WHERE nicho_id = ?').get(id).n;
    },
  };
}

export function repoProjetosCategorias(db) {
  return {
    listar(projetoId) {
      return db.prepare(`SELECT c.id, c.nome FROM projetos_categorias pc JOIN categorias c ON c.id = pc.categoria_id
        WHERE pc.projeto_id = ? ORDER BY c.ordem, c.nome COLLATE NOCASE`).all(projetoId).map(linha);
    },
    substituir(projetoId, ids) {
      db.prepare('DELETE FROM projetos_categorias WHERE projeto_id = ?').run(projetoId);
      const inserir = db.prepare('INSERT INTO projetos_categorias (projeto_id, categoria_id) VALUES (?, ?)');
      for (const id of ids) inserir.run(projetoId, id);
    },
  };
}
```

`server/routes/cadastros.js`:

```js
import { Router } from 'express';
import { repoCategorias, repoNichos } from '../repos/categorias.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

// Rotas iguais para as duas listas: o nome é único sem diferenciar maiúsculas e não se exclui o que está em uso.
function rotasCadastro(repo, regras, registro, { antesDeCriar = (dados) => dados } = {}) {
  const r = Router();

  function exigirNomeLivre(nome, id = null) {
    const existente = repo.idComNome(nome);
    if (existente && existente !== id) throw new ErroValidacao([{ campo: 'nome', mensagem: 'Já existe' }]);
  }

  r.get('/', (req, res) => res.json(repo.listarOrdenadas()));

  r.post('/', (req, res) => {
    const dados = validar(req.body, regras);
    exigirNomeLivre(dados.nome);
    res.status(201).json(repo.criar(antesDeCriar(dados)));
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!repo.obter(id)) throw naoEncontrado(registro);
    const dados = validar(req.body, regras, { parcial: true });
    if (dados.nome !== undefined) exigirNomeLivre(dados.nome, id);
    res.json(repo.atualizar(id, dados));
  });

  r.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const uso = repo.contarUso(id);
    if (uso > 0) throw new ErroHttp(409, `Em uso por ${uso} projeto(s)`);
    if (!repo.remover(id)) throw naoEncontrado(registro);
    res.status(204).end();
  });

  return r;
}

export function rotasCategorias({ db }) {
  const categorias = repoCategorias(db);
  return rotasCadastro(
    categorias,
    { nome: { tipo: 'texto', obrigatorio: true }, ordem: { tipo: 'inteiro', min: 0 } },
    'Categoria',
    { antesDeCriar: (dados) => ({ ...dados, ordem: dados.ordem ?? categorias.proximaOrdem() }) },
  );
}

export function rotasNichos({ db }) {
  return rotasCadastro(repoNichos(db), { nome: { tipo: 'texto', obrigatorio: true } }, 'Nicho');
}
```

Confira em `server/http/erros.js` a assinatura de `naoEncontrado` (recebe o nome do registro) e o formato do JSON de `ErroHttp` (`{ erro }`) — os testes acima assumem esse formato, usado pelo resto do servidor.

Em `server/app.js`, importe `import { rotasCategorias, rotasNichos } from './routes/cadastros.js';` e, logo após `app.use('/api/projetos', rotasProjetos(ctx));`, acrescente:

```js
  app.use('/api/categorias', rotasCategorias(ctx));
  app.use('/api/nichos', rotasNichos(ctx));
```

- [ ] **Step 4: Rodar e ver passar (menos os que dependem da Task 4)**

Run: `npx vitest run server/routes/cadastros.test.js -t "^(?!.*(em uso|exclui a que)).*$"`
Expected: PASS nos 5 restantes. (Se o filtro com lookahead não funcionar no seu shell, rode o arquivo inteiro e confirme que só falham "exclui a que não está em uso…" e "nicho em uso…", com 400 vindo de `/api/projetos`.)

- [ ] **Step 5: Commit**

```bash
git add server/repos/categorias.js server/routes/cadastros.js server/routes/cadastros.test.js server/app.js
git commit -m "feat: api de categorias e nichos"
```

---

### Task 4: Projeto com categorias, nicho e início da mensalidade

**Files:**
- Modify: `server/domain/servicos.js`, `server/domain/servicos.test.js`, `server/repos/projetos.js`, `server/routes/projetos.js`, `server/routes/projetos.test.js`, `server/routes/publicacao.js`, `server/routes/publicacao.test.js`

**Interfaces:**
- Consumes: `repoCategorias`, `repoNichos`, `repoProjetosCategorias` (Task 3); `MODOS_INICIO_MENSALIDADE` (Task 2).
- Produces: projeto (GET/POST/PUT, lista e detalhe) com `categorias: [{ id, nome }]`, `nicho_id`, `nicho_nome`, `mensalidade_inicio_modo`, `mensalidade_inicio_data`. Corpo aceita `categorias: number[]`, `nicho_id: number|null`, `mensalidade_inicio_modo`, `mensalidade_inicio_data`. `TIPOS_SERVICO = ['placas_nfc', 'google_meu_negocio']`. `GET /api/config` só traz `portfolio_repo_path` e `preco_servico_google_meu_negocio_centavos`.

- [ ] **Step 1: Testes (substituir os antigos de linhas Sistemas/SaaS)**

Em `server/routes/projetos.test.js`, **apague** os testes que mandam `servicos` com `sistemas`/`saas` ou checam `desconto_centavos` de site (hoje nas linhas ~130–215: "cria com 2 serviços…", "usa o preço padrão…", "desconto reduz o total…", o de `novo_cliente` com `servicos` — troque o corpo dele por `valor_total_centavos: 20000` mantendo as demais asserções —, e os de PUT que trocam linhas) e o trecho de `errosDoServico` que espera "Sites e sistemas só aceitam Sistemas e SaaS" (linha ~425: troque a mensagem por `'Sites e sistemas não têm linhas de serviço'`). Use `grep -n "sistemas\|saas\|desconto" server/routes/projetos.test.js` para achá-los. Acrescente no fim:

```js
describe('/api/projetos — categorias, nicho e início da mensalidade', () => {
  it('site sem categorias recebe "Site"; com categorias guarda na ordem do cadastro', async () => {
    const semCampo = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' }).expect(201)).body;
    expect(semCampo.categorias).toEqual([{ id: 1, nome: 'Site' }]);
    const com = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'B', categorias: [4, 3, 4] }).expect(201)).body;
    expect(com.categorias).toEqual([{ id: 3, nome: 'Sistema' }, { id: 4, nome: 'SaaS' }]);
    const lista = (await ctx.http.get('/api/projetos?servico=site_sistema')).body;
    expect(lista.find((p) => p.id === com.id).categorias.map((c) => c.nome)).toEqual(['Sistema', 'SaaS']);
  });

  it('lista vazia, id inexistente ou formato errado é 400', async () => {
    const vazio = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', categorias: [] }).expect(400);
    expect(vazio.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Escolha pelo menos uma categoria' }]);
    const inexistente = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', categorias: [99] }).expect(400);
    expect(inexistente.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Categoria não encontrada' }]);
    const texto = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', categorias: ['Site'] }).expect(400);
    expect(texto.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Deve ser uma lista de categorias' }]);
  });

  it('PUT troca as categorias; PUT sem o campo mantém; PUT com [] é 400', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ categorias: [2] }).expect(200)).body.categorias).toEqual([{ id: 2, nome: 'Landing page' }]);
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ titulo: 'Novo' }).expect(200)).body.categorias).toEqual([{ id: 2, nome: 'Landing page' }]);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ categorias: [] }).expect(400);
  });

  it('GMN não tem categorias', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', categorias: [1] }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'categorias', mensagem: 'Só sites e sistemas têm categorias' }]);
    const sem = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio' }).expect(201)).body;
    expect(sem.categorias).toEqual([]);
  });

  it('site não aceita mais linhas de serviço', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', servicos: [{ tipo: 'sistemas' }] }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos[0].tipo', mensagem: 'Tipo de serviço inválido' }]);
  });

  it('nicho: grava, devolve o nome, limpa com null e recusa inexistente', async () => {
    const nicho = (await ctx.http.post('/api/nichos').send({ nome: 'Barbearia' })).body;
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', nicho_id: nicho.id }).expect(201)).body;
    expect(criado).toMatchObject({ nicho_id: nicho.id, nicho_nome: 'Barbearia' });
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ nicho_id: null }).expect(200)).body).toMatchObject({ nicho_id: null, nicho_nome: null });
    const ruim = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A', nicho_id: 999 }).expect(400);
    expect(ruim.body.erros).toEqual([{ campo: 'nicho_id', mensagem: 'Nicho não encontrado' }]);
  });

  it('modo "data" exige a data; os outros não', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    const mensal = { mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10 };
    const semData = await ctx.http.put(`/api/projetos/${criado.id}`).send({ ...mensal, mensalidade_inicio_modo: 'data' }).expect(400);
    expect(semData.body.erros).toEqual([{ campo: 'mensalidade_inicio_data', mensagem: 'Obrigatório quando a cobrança começa numa data' }]);
    const ok = await ctx.http.put(`/api/projetos/${criado.id}`).send({ ...mensal, mensalidade_inicio_modo: 'desenvolvimento' }).expect(200);
    expect(ok.body).toMatchObject({ mensalidade_inicio_modo: 'desenvolvimento', mensalidade_inicio_data: null });
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ mensalidade_inicio_modo: 'outro' }).expect(400);
  });

  it('GMN que liga a mensalidade passa a cobrar a partir de hoje', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio' })).body;
    const res = await ctx.http.put(`/api/projetos/${criado.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 3000, mensalidade_dia_vencimento: 10 }).expect(200);
    expect(res.body).toMatchObject({ mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-09-23' });
  });

  it('ir para andamento preenche a data de início', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'A' })).body;
    expect((await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'andamento' })).body.data_inicio).toBe('2026-09-23');
  });
});
```

(`ctx` e `cliente` já existem no topo de `projetos.test.js` — confira o `beforeEach` do arquivo; se o nome for outro, use o do arquivo.)

Em `server/domain/servicos.test.js`:
- `TIPOS_SERVICO` passa a ser `['placas_nfc', 'google_meu_negocio']`.
- Troque o teste "site aceita qualquer etapa e só linhas sistemas/saas" por:

```js
  it('site aceita qualquer etapa e nenhuma linha de serviço', () => {
    expect(errosDoServico({ ...base, servico: 'site_sistema', etapa: 'proposta', tiposLinhas: [] })).toEqual([]);
    expect(errosDoServico({ ...base, servico: 'site_sistema', tiposLinhas: ['placas_nfc'] }))
      .toEqual([{ campo: 'servicos', mensagem: 'Sites e sistemas não têm linhas de serviço' }]);
  });
```
- Nos demais testes que usam `'saas'` como tipo "estranho" (GMN e placas), troque `'saas'` por `'google_meu_negocio'`/`'placas_nfc'` mantendo a intenção ("GMN não tem linhas", "placas precisa de exatamente uma linha de placas").

Em `server/routes/publicacao.test.js`, tire `preco_servico_sistemas_centavos`/`preco_servico_saas_centavos` dos objetos esperados e enviados, e troque o teste de valor negativo para usar `preco_servico_google_meu_negocio_centavos`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/routes/projetos.test.js server/domain/servicos.test.js server/routes/publicacao.test.js`
Expected: FAIL nos testes novos (sem `categorias` na resposta, etc.).

- [ ] **Step 3: Implementar**

`server/domain/servicos.js`: troque o topo e a regra de site.

```js
export const TIPOS_SERVICO = ['placas_nfc', 'google_meu_negocio'];
export const SERVICOS = ['site_sistema', 'google_meu_negocio', 'placas_nfc'];
```

Apague `LINHAS_SITE` e, em `errosDoServico`, troque o bloco de site por:

```js
    if (servico === 'site_sistema' && tipos.length) {
      erros.push({ campo: 'servicos', mensagem: 'Sites e sistemas não têm linhas de serviço' });
    }
```

(Procure outros usos de `LINHAS_SITE` com `grep -rn LINHAS_SITE server` e remova.)

`server/repos/projetos.js`:

```js
export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos', 'desconto_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
  'mensalidade_inicio_modo', 'mensalidade_inicio_data',
  'postou_instagram', 'ficticio', 'servico', 'link_perfil', 'nicho_id',
];

const SELECT_COM_CLIENTE = `SELECT p.*, c.nome AS cliente_nome, COALESCE(pf.publicar, 0) AS no_portfolio, n.nome AS nicho_nome
  FROM projetos p
  JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN portfolio pf ON pf.projeto_id = p.id
  LEFT JOIN nichos n ON n.id = p.nicho_id`;
```

`server/routes/projetos.js`:

1. Imports novos:
```js
import { repoCategorias, repoNichos, repoProjetosCategorias } from '../repos/categorias.js';
import { MODOS_INICIO_MENSALIDADE } from '../domain/mensalidade.js';
```
2. Em `REGRAS_PROJETO`, acrescente:
```js
  nicho_id: { tipo: 'inteiro', min: 1 },
  mensalidade_inicio_modo: { tipo: 'enum', valores: MODOS_INICIO_MENSALIDADE },
  mensalidade_inicio_data: { tipo: 'data' },
```
3. Em `exigirDadosMensalidade`, antes do `if (erros.length)`, acrescente:
```js
  const modo = dados.mensalidade_inicio_modo ?? atual?.mensalidade_inicio_modo ?? 'entrega';
  const dataInicio = 'mensalidade_inicio_data' in dados ? dados.mensalidade_inicio_data : atual?.mensalidade_inicio_data;
  if (modo === 'data' && !dataInicio) {
    erros.push({ campo: 'mensalidade_inicio_data', mensagem: 'Obrigatório quando a cobrança começa numa data' });
  }
```
4. Em `validarServicos`, o ramo final (preço por config) continua só para `google_meu_negocio`; nada a mudar além do `TIPOS_SERVICO` novo.
5. Dentro de `rotasProjetos`, crie os repos e as funções:
```js
  const categorias = repoCategorias(db);
  const nichos = repoNichos(db);
  const projetosCategorias = repoProjetosCategorias(db);

  function categoriaPadrao() {
    const id = categorias.idComNome('Site') ?? categorias.listarOrdenadas()[0]?.id;
    if (!id) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Cadastre uma categoria em Configurações' }]);
    return id;
  }

  // null = não mexer nas categorias.
  function validarCategorias(bruto, servico, { criando }) {
    if (servico !== 'site_sistema') {
      if (bruto !== undefined) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Só sites e sistemas têm categorias' }]);
      return null;
    }
    if (bruto === undefined) return criando ? [categoriaPadrao()] : null;
    if (!Array.isArray(bruto) || !bruto.every((id) => Number.isInteger(id) && id > 0)) {
      throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Deve ser uma lista de categorias' }]);
    }
    const ids = [...new Set(bruto)];
    if (!ids.length) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Escolha pelo menos uma categoria' }]);
    if (ids.some((id) => !categorias.obter(id))) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Categoria não encontrada' }]);
    return ids;
  }

  function exigirNicho(nichoId) {
    if (nichoId != null && !nichos.obter(nichoId)) {
      throw new ErroValidacao([{ campo: 'nicho_id', mensagem: 'Nicho não encontrado' }]);
    }
  }

  // GMN/placas: ligar a mensalidade sem data começa a cobrar hoje (como antes).
  function inicioDeOutrosServicos(servico, atual, dados) {
    if (servico === 'site_sistema') return dados;
    const ligando = dados.mensalidade_ativa && !atual?.mensalidade_ativa;
    if (!ligando || dados.mensalidade_inicio_data) return dados;
    return { ...dados, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: hoje() };
  }
```
6. `comServicos(projeto)` passa a devolver também `categorias: projetosCategorias.listar(projeto.id)`.
7. No `POST`: em `prepararDados`, depois de calcular `dados` e **antes** de `exigirDadosMensalidade(null, dados)`, faça `dados = inicioDeOutrosServicos(servico, null, dados);` e `exigirNicho(dados.nicho_id);`. Calcule as categorias fora (para usar no `criarProjetoCompleto`):
```js
    let categoriasValidadas = null;
```
dentro de `prepararDados`, após `const servico = …`:
```js
      categoriasValidadas = validarCategorias(corpo.categorias, servico, { criando: true });
```
e em `criarProjetoCompleto`, após `projetos.criar(dados)`:
```js
      if (categoriasValidadas) projetosCategorias.substituir(projeto.id, categoriasValidadas);
```
8. No `PUT`: depois de `exigirRegrasDoServico(...)`:
```js
    const categoriasValidadas = validarCategorias(corpo.categorias, atual.servico, { criando: false });
    exigirNicho(dadosBase.nicho_id);
```
troque `exigirDadosMensalidade(atual, dadosBase);` por:
```js
    const dadosMensalidade = inicioDeOutrosServicos(atual.servico, atual, dadosBase);
    exigirDadosMensalidade(atual, dadosMensalidade);
```
use `dadosMensalidade` no lugar de `dadosBase` dentro do `emTransacao` (`let dados = dadosMensalidade;`) e, dentro da transação, após `projetos.atualizar(id, dados);`:
```js
      if (categoriasValidadas) projetosCategorias.substituir(id, categoriasValidadas);
```

`server/routes/publicacao.js`: `const CHAVES_PRECO_SERVICO = ['preco_servico_google_meu_negocio_centavos'];`

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server`
Expected: PASS — inclusive os dois testes de `cadastros.test.js` que esperavam a Task 4. Se outros arquivos de rota falharem por mandar linhas `sistemas`/`saas`, troque o corpo para `valor_total_centavos` e registre no ledger.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: projeto com categorias, nicho e inicio da mensalidade"
```

---

### Task 5: Geração das mensalidades (preenche meses, sem duplicar)

**Files:**
- Create: `server/repos/mensalidades.js`
- Modify: `server/routes/parcelas.js`, `server/routes/parcelas.test.js`, `server/routes/painel.js`, `server/routes/painel.test.js`

**Interfaces:**
- Consumes: `mensalidadesDevidas(projeto, hoje)` (Task 2).
- Produces: `gerarMensalidades(db, projeto, hoje) → number` (quantas criou); `gerarTodasMensalidades(db, hoje) → number`.

- [ ] **Step 1: Testes**

Em `server/routes/parcelas.test.js`, no `describe('mensalidade automática')`, troque o helper e o primeiro/último teste (o contexto do arquivo usa `hoje = '2026-09-23'`):

```js
  async function ativarMensalidade(valor = 20000, dia = 10, inicio = '2026-09-10') {
    await ctx.http
      .put(`/api/projetos/${projeto.id}`)
      .send({
        mensalidade_ativa: true, mensalidade_valor_centavos: valor, mensalidade_dia_vencimento: dia,
        mensalidade_inicio_modo: 'data', mensalidade_inicio_data: inicio,
      })
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

  it('preenche os meses que ficaram para trás, começando na data do gatilho', async () => {
    await ativarMensalidade(20000, 10, '2026-07-20');
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.vencimento)).toEqual(['2026-07-20', '2026-08-10', '2026-09-10']);
  });

  it('mês que já tem mensalidade (mesmo em outro dia) não ganha outra; nada é apagado ao mudar o início', async () => {
    await ctx.http.post(`/api/projetos/${projeto.id}/parcelas`).send({ valor_centavos: 20000, vencimento: '2026-08-03' }).expect(201);
    ctx.db.prepare('UPDATE parcelas SET mensalidade = 1 WHERE projeto_id = ?').run(projeto.id);
    await ativarMensalidade(20000, 10, '2026-07-20');
    await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    await ativarMensalidade(20000, 10, '2026-09-01');
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.vencimento)).toEqual(['2026-07-20', '2026-08-03', '2026-09-10']);
  });

  it('modo entrega sem data de entrega ainda não cobra', async () => {
    await ctx.http.put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 100, mensalidade_dia_vencimento: 5, mensalidade_inicio_modo: 'entrega' })
      .expect(200);
    expect((await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`)).body.parcelas).toEqual([]);
  });

  it('o Financeiro gera as mensalidades sem abrir o projeto', async () => {
    await ativarMensalidade();
    const lista = (await ctx.http.get('/api/parcelas').expect(200)).body;
    expect(lista.filter((p) => p.projeto_id === projeto.id).map((p) => p.vencimento)).toEqual(['2026-09-10']);
  });
```

Troque o teste "ajusta o dia de vencimento para o fim de um mês curto" para usar início `'2026-01-31'` e conferir `'2026-02-28'` na **segunda** parcela:

```js
  it('ajusta o dia de vencimento para o fim de um mês curto', async () => {
    const ctxFevereiro = criarContexto({ hoje: '2026-02-15' });
    const cli = (await ctxFevereiro.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const proj = (await ctxFevereiro.http.post('/api/projetos').send({ cliente_id: cli.id, titulo: 'App' })).body;
    await ctxFevereiro.http
      .put(`/api/projetos/${proj.id}`)
      .send({
        mensalidade_ativa: true, mensalidade_valor_centavos: 10000, mensalidade_dia_vencimento: 31,
        mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-01-31',
      })
      .expect(200);
    const res = await ctxFevereiro.http.get(`/api/projetos/${proj.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.vencimento)).toEqual(['2026-01-31', '2026-02-28']);
  });
```

Em `server/routes/painel.test.js`, acrescente (siga o padrão de criação de contexto/cliente/projeto do arquivo):

```js
  it('a Início gera as mensalidades devidas antes de calcular os números', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cli = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const proj = (await ctx.http.post('/api/projetos').send({ cliente_id: cli.id, titulo: 'Site' })).body;
    await ctx.http.put(`/api/projetos/${proj.id}`).send({
      mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10,
      mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-08-10',
    }).expect(200);
    await ctx.http.get('/api/painel').expect(200);
    expect(ctx.db.prepare('SELECT vencimento FROM parcelas WHERE projeto_id = ? ORDER BY vencimento').all(proj.id).map((p) => p.vencimento))
      .toEqual(['2026-08-10', '2026-09-10']);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/routes/parcelas.test.js server/routes/painel.test.js`
Expected: FAIL — só gera o mês atual; Financeiro e Início não geram.

- [ ] **Step 3: Implementar**

`server/repos/mensalidades.js`:

```js
import { emTransacao, linha } from './crud.js';
import { repoParcelas } from './parcelas.js';
import { mensalidadesDevidas } from '../domain/mensalidade.js';
import { mesDe } from '../domain/datas.js';

// Cria só as mensalidades que faltam: um mês que já tem mensalidade (em qualquer dia) é pulado; nada é apagado.
export function gerarMensalidades(db, projeto, hoje) {
  const devidas = mensalidadesDevidas(projeto, hoje);
  if (!devidas.length) return 0;
  const parcelas = repoParcelas(db);
  const mesesComMensalidade = new Set(parcelas.listar({ projeto_id: projeto.id, mensalidade: 1 }).map((p) => mesDe(p.vencimento)));
  let criadas = 0;
  for (const vencimento of devidas) {
    if (mesesComMensalidade.has(mesDe(vencimento))) continue;
    parcelas.criar({ projeto_id: projeto.id, descricao: 'Mensalidade', valor_centavos: projeto.mensalidade_valor_centavos, vencimento, mensalidade: 1 });
    mesesComMensalidade.add(mesDe(vencimento));
    criadas++;
  }
  return criadas;
}

export function gerarTodasMensalidades(db, hoje) {
  const ativos = db.prepare('SELECT * FROM projetos WHERE mensalidade_ativa = 1').all().map(linha);
  return emTransacao(db, () => ativos.reduce((total, projeto) => total + gerarMensalidades(db, projeto, hoje), 0));
}
```

`server/routes/parcelas.js`:
- `import { gerarMensalidades, gerarTodasMensalidades } from '../repos/mensalidades.js';`
- Apague a função `gerarMensalidadeSeNecessario` e troque a chamada em `GET /projetos/:id/parcelas` por `gerarMensalidades(db, projeto, hoje());`.
- No início de `GET /parcelas` e de `GET /financeiro/mensal`, acrescente `gerarTodasMensalidades(db, hoje());`.
- Remova `dataNoMes` do import de `../domain/datas.js` se ficar sem uso.

`server/routes/painel.js`: `import { gerarTodasMensalidades } from '../repos/mensalidades.js';` e, na primeira linha dos handlers `GET /painel` e `GET /painel/graficos`, `gerarTodasMensalidades(db, hoje());`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repos/mensalidades.js server/routes/parcelas.js server/routes/parcelas.test.js server/routes/painel.js server/routes/painel.test.js
git commit -m "feat: mensalidades geradas desde o inicio e tambem no financeiro e na inicio"
```

---

### Task 6: Configurações — listas de Categorias e Nichos

**Files:**
- Create: `web/src/pages/config/CadastroLista.jsx`, `web/src/pages/config/CadastroLista.test.jsx`
- Modify: `web/src/pages/Config.jsx`, `web/src/pages/Config.test.jsx`

**Interfaces:**
- Consumes: `/api/categorias`, `/api/nichos` (Task 3).
- Produces: `<CadastroLista titulo caminho rotuloNovo ordenavel />`.

- [ ] **Step 1: Testes**

`web/src/pages/config/CadastroLista.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CadastroLista } from './CadastroLista.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const categorias = [{ id: 1, nome: 'Site', ordem: 1 }, { id: 2, nome: 'SaaS', ordem: 2 }];

describe('CadastroLista', () => {
  it('lista, adiciona e mostra o erro de nome repetido sem perder o texto', async () => {
    const { chamadas, rotas } = mockApi({ 'GET /categorias': categorias, 'POST /categorias': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Já existe' }] }) });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    expect(await screen.findByText('Site')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nova categoria'), 'site');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Já existe')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova categoria')).toHaveValue('site');
    rotas['POST /categorias'] = { id: 3, nome: 'Landing', ordem: 3 };
    rotas['GET /categorias'] = [...categorias, { id: 3, nome: 'Landing', ordem: 3 }];
    await user.clear(screen.getByLabelText('Nova categoria'));
    await user.type(screen.getByLabelText('Nova categoria'), 'Landing');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Landing')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova categoria')).toHaveValue('');
    expect(chamadas.filter((c) => c.metodo === 'POST').at(-1).corpo).toEqual({ nome: 'Landing' });
  });

  it('renomeia', async () => {
    const { chamadas } = mockApi({ 'GET /categorias': categorias, 'PUT /categorias/2': { id: 2, nome: 'SaaS B2B', ordem: 2 } });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Renomear SaaS' }));
    const campo = screen.getByLabelText('Novo nome de SaaS');
    await user.clear(campo);
    await user.type(campo, 'SaaS B2B');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toEqual({ nome: 'SaaS B2B' }));
  });

  it('exclui com confirmação e mostra o 409 quando está em uso', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({ 'GET /categorias': categorias, 'DELETE /categorias/1': resposta(409, { erro: 'Em uso por 3 projeto(s)' }) });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir Site' }));
    expect(await screen.findByText('Em uso por 3 projeto(s)')).toBeInTheDocument();
    expect(screen.getByText('Site')).toBeInTheDocument();
  });

  it('setas trocam a ordem de dois itens vizinhos', async () => {
    const { chamadas } = mockApi({ 'GET /categorias': categorias, 'PUT /categorias/1': {}, 'PUT /categorias/2': {} });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    const linhaSaas = (await screen.findByText('SaaS')).closest('li');
    await userEvent.setup().click(within(linhaSaas).getByRole('button', { name: 'Subir SaaS' }));
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(2));
    expect(chamadas.filter((c) => c.metodo === 'PUT').map((c) => [c.caminho, c.corpo])).toEqual([
      ['/categorias/2', { ordem: 1 }], ['/categorias/1', { ordem: 2 }],
    ]);
    expect(screen.queryByRole('button', { name: 'Subir Site' })).toBeNull();
  });
});
```

(Confira o formato de erro lançado por `web/src/api/client.js` — `erro.erros` para 400 e `erro.message` com o texto de `{ erro }` para 409 — e o que `Aviso` mostra; os testes acima assumem esse comportamento, já usado no app.)

Em `web/src/pages/Config.test.jsx`: troque os mocks de `GET /config`/`PUT /config` de preços para só `preco_servico_google_meu_negocio_centavos`, ajuste o teste de preços para só preencher "Google Meu Negócio (R$)", e acrescente:

```jsx
  it('mostra as listas de Categorias e Nichos', async () => {
    mockApi({
      'GET /config': { portfolio_repo_path: null, preco_servico_google_meu_negocio_centavos: 0 },
      'GET /categorias': [{ id: 1, nome: 'Site', ordem: 1 }],
      'GET /nichos': [{ id: 1, nome: 'Barbearia' }],
    });
    renderizar(<Config />);
    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nichos' })).toBeInTheDocument();
    expect(await screen.findByText('Barbearia')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sistemas (R$)')).toBeNull();
  });
```

(Use o helper de render que o arquivo já usa; se for `render` direto, mantenha.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run web/src/pages/config web/src/pages/Config.test.jsx`
Expected: FAIL — `CadastroLista` não existe.

- [ ] **Step 3: Implementar**

`web/src/pages/config/CadastroLista.jsx`:

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';

export function CadastroLista({ titulo, caminho, rotuloNovo, ordenavel = false }) {
  const { dados: itens, erro, recarregar } = useCarregar(() => api(caminho), [caminho]);
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const envio = useEnvio();
  const erroNome = envio.erros.find((e) => e.campo === 'nome')?.mensagem;

  function adicionar(e) {
    e.preventDefault();
    envio.executar(async () => {
      await api(caminho, { method: 'POST', body: { nome: novo } });
      setNovo('');
      recarregar();
    });
  }

  function salvarNome(e) {
    e.preventDefault();
    envio.executar(async () => {
      await api(`${caminho}/${editando}`, { method: 'PUT', body: { nome: nomeEditado } });
      setEditando(null);
      recarregar();
    });
  }

  function excluir(item) {
    if (!window.confirm(`Excluir "${item.nome}"?`)) return;
    envio.executar(async () => {
      await api(`${caminho}/${item.id}`, { method: 'DELETE' });
      recarregar();
    });
  }

  function trocar(i, j) {
    const a = itens[i];
    const b = itens[j];
    envio.executar(async () => {
      await api(`${caminho}/${b.id}`, { method: 'PUT', body: { ordem: a.ordem } });
      await api(`${caminho}/${a.id}`, { method: 'PUT', body: { ordem: b.ordem } });
      recarregar();
    });
  }

  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      <Aviso erro={erro} />
      <ul className="lista lista-cadastro">
        {(itens ?? []).map((item, i) => (
          <li key={item.id}>
            {editando === item.id ? (
              <form onSubmit={salvarNome} className="form--linha">
                <input aria-label={`Novo nome de ${item.nome}`} value={nomeEditado} onChange={(e) => setNomeEditado(e.target.value)} />
                <button className="btn btn--primario btn--pequeno">Salvar</button>
                <button type="button" className="btn btn--pequeno" onClick={() => setEditando(null)}>Cancelar</button>
              </form>
            ) : (
              <>
                <span className="lista-cadastro__nome">{item.nome}</span>
                {ordenavel && i > 0 && (
                  <button type="button" className="btn btn--pequeno" aria-label={`Subir ${item.nome}`} onClick={() => trocar(i, i - 1)}>↑</button>
                )}
                {ordenavel && i < itens.length - 1 && (
                  <button type="button" className="btn btn--pequeno" aria-label={`Descer ${item.nome}`} onClick={() => trocar(i, i + 1)}>↓</button>
                )}
                <button type="button" className="btn btn--pequeno" aria-label={`Renomear ${item.nome}`} onClick={() => { setEditando(item.id); setNomeEditado(item.nome); }}>Renomear</button>
                <button type="button" className="btn btn--pequeno btn--perigo" aria-label={`Excluir ${item.nome}`} onClick={() => excluir(item)}>Excluir</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={adicionar} className="form--linha">
        <div className="campo">
          <label htmlFor={`novo-${caminho}`}>{rotuloNovo}</label>
          <input id={`novo-${caminho}`} value={novo} aria-invalid={Boolean(erroNome)} onChange={(e) => setNovo(e.target.value)} />
          {erroNome && <p className="campo__erro" role="alert">{erroNome}</p>}
        </div>
        <button className="btn" disabled={envio.enviando}>Adicionar</button>
      </form>
      {!erroNome && <Aviso erro={envio.erro} />}
    </section>
  );
}
```

`web/src/styles.css` (junto das regras de `.lista`):

```css
.lista-cadastro li { display: flex; align-items: center; gap: 8px; }
.lista-cadastro__nome { flex: 1; }
```

`web/src/pages/Config.jsx`:
- `import { CadastroLista } from './config/CadastroLista.jsx';`
- Logo após `{config && <Repositorio … />}`, acrescente:
```jsx
      <CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />
      <CadastroLista titulo="Nichos" caminho="/nichos" rotuloNovo="Novo nicho" />
```
- Em `PrecosServicos`, deixe só GMN:
```jsx
function PrecosServicos({ inicial }) {
  const { valores, campo } = useFormulario({
    preco_gmn: centavosParaTexto(inicial.preco_servico_google_meu_negocio_centavos ?? 0),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const [salvo, setSalvo] = useState(false);

  function salvar(e) {
    e.preventDefault();
    setSalvo(false);
    const gmn = paraCentavos(valores.preco_gmn);
    if (gmn === null || Number.isNaN(gmn)) {
      setErros([{ campo: 'preco_servico_google_meu_negocio_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(async () => {
      await api('/config', { method: 'PUT', body: { preco_servico_google_meu_negocio_centavos: gmn } });
      setSalvo(true);
    });
  }

  return (
    <section className="cartao">
      <h2>Preço padrão do Google Meu Negócio</h2>
      <form onSubmit={salvar} className="form" noValidate>
        <Campo rotulo="Google Meu Negócio (R$)" nome="preco_servico_google_meu_negocio_centavos" erros={erros} inputMode="decimal" {...campo('preco_gmn')} />
        <Aviso erro={erro} />
        {salvo && <p className="aviso aviso--ok" role="status">Preço salvo.</p>}
        <div><button className="btn btn--primario" disabled={enviando}>Salvar preço</button></div>
      </form>
    </section>
  );
}
```
(Ajuste o teste de preços em `Config.test.jsx` para os textos "Salvar preço"/"Preço salvo.".)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run web/src/pages/config web/src/pages/Config.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/config web/src/pages/Config.jsx web/src/pages/Config.test.jsx web/src/styles.css
git commit -m "feat: categorias e nichos nas configuracoes"
```

---

### Task 7: Seletores de categoria e nicho + nova oportunidade no Funil

**Files:**
- Create: `web/src/components/SeletorCategorias.jsx`, `web/src/components/SeletorCategorias.test.jsx`, `web/src/components/SeletorNicho.jsx`, `web/src/components/SeletorNicho.test.jsx`
- Modify: `web/src/components/FormOportunidade.jsx`, `web/src/pages/Funil.test.jsx`, `web/src/lib/rotulos.js`, `web/src/lib/rotulos.test.js`
- Delete: `web/src/components/CamposServicos.jsx`, `web/src/components/CamposServicos.test.jsx`

**Interfaces:**
- Produces:
  - `<SeletorCategorias categorias={[{id,nome}]} selecionadas={number[]} onChange={(ids) => …} erro={string|undefined} />` — grupo `role="group"` com nome "Categorias", botões `.pilula` com `aria-pressed`.
  - `<SeletorNicho valor={string} onChange={(idTexto) => …} />` — select rotulado "Nicho" com opção vazia "Sem nicho", os nichos e "+ novo nicho…" (valor `'novo'`); ao escolher "novo" aparece input "Nome do novo nicho" + botão "Adicionar".
  - `FormOportunidade` envia `{ titulo, etapa, prazo_entrega, ficticio, categorias, nicho_id, valor_total_centavos, cliente_id | novo_cliente }`.

- [ ] **Step 1: Testes**

`web/src/components/SeletorCategorias.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeletorCategorias } from './SeletorCategorias.jsx';

const categorias = [{ id: 1, nome: 'Site' }, { id: 3, nome: 'Sistema' }, { id: 4, nome: 'SaaS' }];

function Teste({ inicial = [] }) {
  const [ids, setIds] = useState(inicial);
  return <><SeletorCategorias categorias={categorias} selecionadas={ids} onChange={setIds} /><output>{ids.join(',')}</output></>;
}

describe('SeletorCategorias', () => {
  it('marca e desmarca pílulas mantendo a ordem do cadastro', async () => {
    render(<Teste inicial={[4]} />);
    const grupo = screen.getByRole('group', { name: 'Categorias' });
    expect(within(grupo).getByRole('button', { name: 'SaaS' })).toHaveAttribute('aria-pressed', 'true');
    const user = userEvent.setup();
    await user.click(within(grupo).getByRole('button', { name: 'Site' }));
    expect(screen.getByRole('status')).toHaveTextContent('1,4');
    await user.click(within(grupo).getByRole('button', { name: 'SaaS' }));
    expect(screen.getByRole('status')).toHaveTextContent('1');
  });

  it('mostra o erro', () => {
    render(<SeletorCategorias categorias={categorias} selecionadas={[]} onChange={() => {}} erro="Escolha pelo menos uma categoria" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha pelo menos uma categoria');
  });
});
```

`web/src/components/SeletorNicho.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeletorNicho } from './SeletorNicho.jsx';
import { mockApi, resposta } from '../test/mockApi.js';

function Teste() {
  const [valor, setValor] = useState('');
  return <><SeletorNicho valor={valor} onChange={setValor} /><output>{valor}</output></>;
}

describe('SeletorNicho', () => {
  it('lista os nichos e cria um novo já selecionado', async () => {
    const { rotas, chamadas } = mockApi({ 'GET /nichos': [{ id: 1, nome: 'Barbearia' }], 'POST /nichos': { id: 2, nome: 'Sorveteria' } });
    render(<Teste />);
    const select = await screen.findByLabelText('Nicho');
    expect(await screen.findByRole('option', { name: 'Barbearia' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(select, 'novo');
    rotas['GET /nichos'] = [{ id: 1, nome: 'Barbearia' }, { id: 2, nome: 'Sorveteria' }];
    await user.type(screen.getByLabelText('Nome do novo nicho'), 'Sorveteria');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('2');
    expect(screen.queryByLabelText('Nome do novo nicho')).toBeNull();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ nome: 'Sorveteria' });
  });

  it('nome repetido mostra o erro e mantém o texto', async () => {
    mockApi({ 'GET /nichos': [{ id: 1, nome: 'Barbearia' }], 'POST /nichos': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Já existe' }] }) });
    render(<Teste />);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Nicho'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo nicho'), 'barbearia');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Já existe')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do novo nicho')).toHaveValue('barbearia');
  });
});
```

Em `web/src/pages/Funil.test.jsx`, **substitua** os dois testes de serviço ("nova oportunidade com serviço marcado…" e "desmarcar o único serviço…") por:

```jsx
  it('nova oportunidade exige categoria e envia categorias, nicho e valor', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
      'GET /categorias': [{ id: 1, nome: 'Site' }, { id: 4, nome: 'SaaS' }], 'GET /nichos': [{ id: 7, nome: 'Barbearia' }],
    });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.selectOptions(screen.getByLabelText('Cliente'), '3');
    await user.type(screen.getByLabelText('Valor (R$)'), '1.500');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Escolha pelo menos uma categoria')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'SaaS' }));
    await user.selectOptions(screen.getByLabelText('Nicho'), '7');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Site', etapa: 'contato', prazo_entrega: '', ficticio: false, cliente_id: 3,
      categorias: [4], nicho_id: 7, valor_total_centavos: 150000,
    });
  });
```

Nos outros testes do Funil que abrem o formulário, acrescente `'GET /categorias': [{ id: 1, nome: 'Site' }]` e `'GET /nichos': []` aos mocks e clique em "Site" antes de "Criar oportunidade" quando o teste espera o POST. Remova `'GET /config'` e `'GET /placas/modelos'` dos mocks que só existiam para `CamposServicos`.

Em `web/src/lib/rotulos.test.js`: `TIPOS_SERVICO` esperado vira `['placas_nfc', 'google_meu_negocio']`; apague a asserção de `TIPOS_SERVICO_SITE` e tire-o do import.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run web/src/components/SeletorCategorias.test.jsx web/src/components/SeletorNicho.test.jsx web/src/pages/Funil.test.jsx web/src/lib/rotulos.test.js`
Expected: FAIL — componentes não existem; Funil ainda usa `CamposServicos`.

- [ ] **Step 3: Implementar**

`web/src/components/SeletorCategorias.jsx`:

```jsx
export function SeletorCategorias({ categorias, selecionadas, onChange, erro }) {
  function alternar(id) {
    const marcadas = selecionadas.includes(id) ? selecionadas.filter((s) => s !== id) : [...selecionadas, id];
    onChange(categorias.map((c) => c.id).filter((c) => marcadas.includes(c)));
  }

  return (
    <div className="campo">
      <span className="campo__rotulo" id="rotulo-categorias">Categorias</span>
      <div className="pilulas" role="group" aria-labelledby="rotulo-categorias">
        {categorias.map((c) => (
          <button key={c.id} type="button" className="pilula" aria-pressed={selecionadas.includes(c.id)} onClick={() => alternar(c.id)}>
            {c.nome}
          </button>
        ))}
      </div>
      {erro && <p className="campo__erro" role="alert">{erro}</p>}
    </div>
  );
}
```

`web/src/components/SeletorNicho.jsx`:

```jsx
import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';

export function SeletorNicho({ valor, onChange }) {
  const { dados: nichos, recarregar } = useCarregar(() => api('/nichos'), []);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const envio = useEnvio();
  const erroNome = envio.erros.find((e) => e.campo === 'nome')?.mensagem ?? envio.erro?.message;

  function escolher(e) {
    if (e.target.value === 'novo') {
      setCriando(true);
      return;
    }
    setCriando(false);
    onChange(e.target.value);
  }

  function adicionar() {
    envio.executar(async () => {
      const criado = await api('/nichos', { method: 'POST', body: { nome } });
      recarregar();
      setCriando(false);
      setNome('');
      onChange(String(criado.id));
    });
  }

  return (
    <div className="campo">
      <label htmlFor="campo-nicho_id">Nicho</label>
      <select id="campo-nicho_id" value={criando ? 'novo' : valor} onChange={escolher}>
        <option value="">Sem nicho</option>
        {(nichos ?? []).map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
        <option value="novo">+ novo nicho…</option>
      </select>
      {criando && (
        <div className="form--linha">
          <input aria-label="Nome do novo nicho" value={nome} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
          <button type="button" className="btn btn--pequeno" disabled={envio.enviando} onClick={adicionar}>Adicionar</button>
        </div>
      )}
      {criando && erroNome && <p className="campo__erro" role="alert">{erroNome}</p>}
    </div>
  );
}
```

(O botão é `type="button"` e o Enter é tratado à mão porque o seletor vive dentro de outros formulários.)

`web/src/styles.css`: `.campo__rotulo { font-size: 0.85rem; color: var(--texto-suave); }` (igual a `.campo label`).

`web/src/components/FormOportunidade.jsx`: remova `CamposServicos`, `servicos`, `descontoCentavos`; acrescente:

```jsx
import { SeletorCategorias } from './SeletorCategorias.jsx';
import { SeletorNicho } from './SeletorNicho.jsx';
…
  const { dados: categorias } = useCarregar(() => api('/categorias'), []);
  const [categoriasMarcadas, setCategoriasMarcadas] = useState([]);
  const [nichoId, setNichoId] = useState('');
```

Novo `enviar`:

```jsx
  function enviar(e) {
    e.preventDefault();
    if (!categoriasMarcadas.length) {
      setErros([{ campo: 'categorias', mensagem: 'Escolha pelo menos uma categoria' }]);
      return;
    }
    const valor = paraCentavos(valores.valor);
    if (Number.isNaN(valor)) {
      setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const corpo = {
      titulo: valores.titulo, etapa: valores.etapa, prazo_entrega: valores.prazo_entrega, ficticio: valores.ficticio,
      categorias: categoriasMarcadas, nicho_id: nichoId ? Number(nichoId) : null, valor_total_centavos: valor ?? 0,
    };
    if (clienteNovo) corpo.novo_cliente = { nome: valores.novo_cliente_nome };
    else corpo.cliente_id = valores.cliente_id ? Number(valores.cliente_id) : null;
    executar(() => onSalvar(corpo));
  }
```

Atenção à ordem das chaves: o teste do Funil usa `toEqual`, que não depende da ordem; `cliente_id` vem depois — ok.

No JSX, no lugar de `<CamposServicos …/>` e do bloco condicional do Valor:

```jsx
      <SeletorCategorias
        categorias={categorias ?? []}
        selecionadas={categoriasMarcadas}
        onChange={setCategoriasMarcadas}
        erro={erros.find((e) => e.campo === 'categorias')?.mensagem}
      />
      <SeletorNicho valor={nichoId} onChange={setNichoId} />
      <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" placeholder="0,00" {...campo('valor')} />
```

Apague `web/src/components/CamposServicos.jsx` e `.test.jsx` (`git rm`).

`web/src/lib/rotulos.js`: `ROTULO_TIPO_SERVICO = { placas_nfc: 'Placas NFC', google_meu_negocio: 'Google Meu Negócio' }` (mantenha o rótulo de GMN que já existe no objeto) e apague `TIPOS_SERVICO_SITE`. Rode `grep -rn "TIPOS_SERVICO_SITE\|CamposServicos" web/src` — deve sobrar só `AbaGeral.jsx`, que a Task 8 reescreve. Para não quebrar o build até lá, nesta task troque em `AbaGeral.jsx` apenas o import/uso de `CamposServicos` por nada (remova o componente e o estado `servicos`/`descontoCentavos`, sempre mostrando o campo Valor) — a Task 8 reescreve o arquivo inteiro.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run web`
Expected: PASS, exceto os testes de `Projeto.test.jsx` que falam de serviços (`servicos`/`desconto`) — apague esses dois ("trocar os serviços e salvar…" e o que monta `servicos: [{ tipo: 'saas' … }]`); a Task 8 traz os novos.

- [ ] **Step 5: Commit**

```bash
git add -A web/src
git commit -m "feat: seletores de categoria e nicho na nova oportunidade"
```

---

### Task 8: Nova Visão geral (cartões, etapa só leitura, mensalidade)

**Files:**
- Rewrite: `web/src/pages/projeto/AbaGeral.jsx`
- Create: `web/src/pages/projeto/CobrancaMensal.jsx`
- Modify: `web/src/pages/projeto/Projeto.jsx`, `web/src/pages/projeto/Projeto.test.jsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: `SeletorCategorias`, `SeletorNicho` (Task 7); `inicioMensalidade` de `server/domain/mensalidade.js` (Task 2; importado direto, como `AbaPortfolio` já faz com `server/domain/slug.js`); `PreviaSite` (Task 9 — nesta task, deixe a coluna da direita com um `<div data-previa />` vazio que a Task 9 preenche).
- Produces: `PUT /projetos/:id` com corpo `{ titulo, cliente_id, nicho_id, categorias, descricao, notas, data_inicio, prazo_entrega, data_entrega, valor_total_centavos, mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento, mensalidade_inicio_modo, mensalidade_inicio_data, postou_instagram, ficticio }` — **sem** `etapa`.

- [ ] **Step 1: Testes**

Em `web/src/pages/projeto/Projeto.test.jsx`, atualize `projetoExemplo`:

```jsx
export const projetoExemplo = {
  id: 5, titulo: 'Site Ana', cliente_id: 1, cliente_nome: 'Ana', etapa: 'andamento', valor_total_centavos: 300000,
  data_inicio: '2026-09-01', prazo_entrega: '2026-10-01', data_entrega: null, descricao: null, notas: null, atualizado_em: 'T1',
  servico: 'site_sistema', categorias: [{ id: 1, nome: 'Site' }], nicho_id: null, nicho_nome: null,
  mensalidade_ativa: 0, mensalidade_valor_centavos: 0, mensalidade_dia_vencimento: null,
  mensalidade_inicio_modo: 'entrega', mensalidade_inicio_data: null,
};

const rotasBase = (extra = {}) => ({
  'GET /projetos/5': projetoExemplo,
  'GET /clientes': [{ id: 1, nome: 'Ana' }],
  'GET /categorias': [{ id: 1, nome: 'Site' }, { id: 3, nome: 'Sistema' }],
  'GET /nichos': [{ id: 7, nome: 'Barbearia' }],
  'GET /projetos/5/portfolio': { live_url: null, code_url: null, imagens: [] },
  ...extra,
});
```

Troque o mock dos testes existentes por `mockApi(rotasBase({ 'PUT /projetos/5': … }))`; no primeiro teste, troque `expect(put.corpo).toMatchObject({ valor_total_centavos: 350000, cliente_id: 1, etapa: 'andamento' })` por:

```jsx
    expect(put.corpo).toMatchObject({ valor_total_centavos: 350000, cliente_id: 1, categorias: [1], nicho_id: null });
    expect(put.corpo).not.toHaveProperty('etapa');
```

No teste "ativa mensalidade…", depois de marcar "Cobra mensalidade", o modo padrão é "Na entrega"; espere também `mensalidade_inicio_modo: 'entrega'` no `toMatchObject`.

Acrescente:

```jsx
  it('etapa é só leitura, com link para o Funil', async () => {
    mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    expect(await screen.findByRole('link', { name: 'alterar no Funil' })).toHaveAttribute('href', '/funil');
    expect(screen.queryByLabelText('Etapa')).toBeNull();
  });

  it('desmarcar a última categoria mostra o erro e não salva', async () => {
    const { chamadas } = mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Site' }));
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    expect(await screen.findByText('Escolha pelo menos uma categoria')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);
  });

  it('a frase da 1ª mensalidade segue o modo escolhido', async () => {
    mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    expect(screen.getByText('Começa quando o projeto for entregue')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Ao entrar em desenvolvimento'));
    expect(screen.getByText('1ª mensalidade em 01/09/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(1);
    await user.click(screen.getByLabelText('A partir de uma data'));
    await user.type(screen.getByLabelText('Data de início da cobrança'), '2026-11-15');
    expect(screen.getByText('1ª mensalidade em 15/11/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(15);
  });

  it('dia de vencimento já escolhido não é trocado pela data de início', async () => {
    mockApi(rotasBase({ 'GET /projetos/5': { ...projetoExemplo, mensalidade_ativa: 1, mensalidade_valor_centavos: 100, mensalidade_dia_vencimento: 5 } }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('A partir de uma data'));
    await user.type(screen.getByLabelText('Data de início da cobrança'), '2026-11-15');
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(5);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run web/src/pages/projeto/Projeto.test.jsx`
Expected: FAIL — select de Etapa ainda existe, sem pílulas, sem frase.

- [ ] **Step 3: Implementar**

`web/src/pages/projeto/CobrancaMensal.jsx`:

```jsx
import { Campo } from '../../components/Campo.jsx';
import { formatarData } from '../../lib/datas.js';
import { inicioMensalidade } from '../../../../server/domain/mensalidade.js';

const MODOS = [
  ['entrega', 'Na entrega'],
  ['desenvolvimento', 'Ao entrar em desenvolvimento'],
  ['data', 'A partir de uma data'],
];

const SEM_INICIO = {
  entrega: 'Começa quando o projeto for entregue',
  desenvolvimento: 'Começa quando entrar em desenvolvimento',
  data: 'Escolha a data de início da cobrança',
};

export function frasePrimeiraMensalidade(valores) {
  const inicio = inicioMensalidade(valores);
  return inicio ? `1ª mensalidade em ${formatarData(inicio)}` : SEM_INICIO[valores.mensalidade_inicio_modo];
}

// `valores` usa os nomes do servidor (data_inicio, data_entrega, mensalidade_*); `alterar(parcial)` mescla no formulário.
export function CobrancaMensal({ valores, alterar, erros }) {
  function definirInicio(parcial) {
    const inicio = inicioMensalidade({ ...valores, ...parcial });
    // O dia acompanha a data de início enquanto o Lucca não digitar outro (dia_manual).
    const dia = inicio && !valores.dia_manual ? { mensalidade_dia_vencimento: String(Number(inicio.slice(8, 10))) } : {};
    alterar({ ...parcial, ...dia });
  }

  return (
    <>
      <label className="campo--check">
        <input type="checkbox" checked={Boolean(valores.mensalidade_ativa)} onChange={(e) => alterar({ mensalidade_ativa: e.target.checked })} />
        Cobra mensalidade
      </label>
      {valores.mensalidade_ativa && (
        <div className="cobranca-mensal">
          <div className="grade-campos">
            <Campo rotulo="Valor da mensalidade (R$)" nome="mensalidade_valor_centavos" erros={erros} inputMode="decimal"
              value={valores.mensalidade_valor} onChange={(e) => alterar({ mensalidade_valor: e.target.value })} />
            <Campo rotulo="Dia de vencimento" nome="mensalidade_dia_vencimento" erros={erros} type="number" min="1" max="31"
              value={valores.mensalidade_dia_vencimento} onChange={(e) => alterar({ mensalidade_dia_vencimento: e.target.value, dia_manual: true })} />
          </div>
          <fieldset className="campo">
            <legend>Começa a cobrar</legend>
            {MODOS.map(([modo, rotulo]) => (
              <label key={modo} className="campo--check">
                <input type="radio" name="mensalidade_inicio_modo" value={modo} checked={valores.mensalidade_inicio_modo === modo}
                  onChange={() => definirInicio({ mensalidade_inicio_modo: modo })} />
                {rotulo}
              </label>
            ))}
          </fieldset>
          {valores.mensalidade_inicio_modo === 'data' && (
            <Campo rotulo="Data de início da cobrança" nome="mensalidade_inicio_data" erros={erros} type="date"
              value={valores.mensalidade_inicio_data} onChange={(e) => definirInicio({ mensalidade_inicio_data: e.target.value })} />
          )}
          <p className="vazio">{frasePrimeiraMensalidade(valores)}</p>
        </div>
      )}
    </>
  );
}
```

`dia_manual` é só do formulário (não vai para a API): começa verdadeiro quando o projeto já tem dia salvo e vira verdadeiro quando o Lucca digita no campo. Atenção: `mensalidade_dia_vencimento` no formulário é **texto** (input); `inicioMensalidade` só lê `data_inicio`, `data_entrega`, `mensalidade_inicio_data` e `mensalidade_inicio_modo`, que no formulário já estão no formato `AAAA-MM-DD`/`''` — `''` conta como "sem data" (`|| null`).

`web/src/pages/projeto/AbaGeral.jsx` (reescrita completa):

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { SeletorCategorias } from '../../components/SeletorCategorias.jsx';
import { SeletorNicho } from '../../components/SeletorNicho.jsx';
import { centavosParaTexto, paraCentavos } from '../../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { CobrancaMensal } from './CobrancaMensal.jsx';
import { PreviaSite } from './PreviaSite.jsx';

function valoresIniciais(projeto) {
  return {
    titulo: projeto.titulo,
    cliente_id: String(projeto.cliente_id),
    nicho_id: projeto.nicho_id ? String(projeto.nicho_id) : '',
    categorias: (projeto.categorias ?? []).map((c) => c.id),
    descricao: projeto.descricao ?? '',
    notas: projeto.notas ?? '',
    data_inicio: projeto.data_inicio ?? '',
    prazo_entrega: projeto.prazo_entrega ?? '',
    data_entrega: projeto.data_entrega ?? '',
    valor: centavosParaTexto(projeto.valor_total_centavos),
    mensalidade_ativa: Boolean(projeto.mensalidade_ativa),
    mensalidade_valor: centavosParaTexto(projeto.mensalidade_valor_centavos),
    mensalidade_dia_vencimento: projeto.mensalidade_dia_vencimento ? String(projeto.mensalidade_dia_vencimento) : '',
    dia_manual: Boolean(projeto.mensalidade_dia_vencimento),
    mensalidade_inicio_modo: projeto.mensalidade_inicio_modo ?? 'entrega',
    mensalidade_inicio_data: projeto.mensalidade_inicio_data ?? '',
    postou_instagram: Boolean(projeto.postou_instagram),
    ficticio: Boolean(projeto.ficticio),
  };
}

export function AbaGeral({ projeto, onSalvo }) {
  const navegar = useNavigate();
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { dados: categorias } = useCarregar(() => api('/categorias'), []);
  const [valores, setValores] = useState(() => valoresIniciais(projeto));
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const alterar = (parcial) => setValores((v) => ({ ...v, ...parcial }));
  const texto = (nome) => ({ value: valores[nome], onChange: (e) => alterar({ [nome]: e.target.value }) });

  function salvar(e) {
    e.preventDefault();
    if (!valores.categorias.length) {
      setErros([{ campo: 'categorias', mensagem: 'Escolha pelo menos uma categoria' }]);
      return;
    }
    const valorCentavos = paraCentavos(valores.valor);
    if (Number.isNaN(valorCentavos)) {
      setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const mensalidadeCentavos = valores.mensalidade_ativa ? paraCentavos(valores.mensalidade_valor) : 0;
    if (valores.mensalidade_ativa && (mensalidadeCentavos === null || Number.isNaN(mensalidadeCentavos))) {
      setErros([{ campo: 'mensalidade_valor_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const { valor: _v, mensalidade_valor: _mv, dia_manual: _dm, ...resto } = valores;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, {
        method: 'PUT',
        body: {
          ...resto,
          cliente_id: Number(resto.cliente_id),
          nicho_id: resto.nicho_id ? Number(resto.nicho_id) : null,
          valor_total_centavos: valorCentavos ?? 0,
          mensalidade_valor_centavos: mensalidadeCentavos ?? 0,
          mensalidade_dia_vencimento: valores.mensalidade_ativa && valores.mensalidade_dia_vencimento ? Number(valores.mensalidade_dia_vencimento) : null,
          mensalidade_inicio_data: resto.mensalidade_inicio_modo === 'data' ? resto.mensalidade_inicio_data : null,
        },
      });
      onSalvo();
    });
  }

  function excluir() {
    if (!window.confirm(`Excluir o projeto "${projeto.titulo}"? Parcelas, tarefas e dados do portfólio também serão excluídos.`)) return;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
      navegar('/funil');
    });
  }

  return (
    <form onSubmit={salvar} className="visao-geral" noValidate>
      <div className="visao-geral__principal">
        <section className="cartao">
          <h2 className="cartao__titulo">Sobre</h2>
          <Campo rotulo="Título" nome="titulo" erros={erros} {...texto('titulo')} />
          <div className="grade-campos">
            <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
              <select {...texto('cliente_id')}>
                {(clientes ?? [{ id: projeto.cliente_id, nome: projeto.cliente_nome }]).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Campo>
            <SeletorNicho valor={valores.nicho_id} onChange={(nicho_id) => alterar({ nicho_id })} />
          </div>
          <SeletorCategorias
            categorias={categorias ?? projeto.categorias ?? []}
            selecionadas={valores.categorias}
            onChange={(ids) => alterar({ categorias: ids })}
            erro={erros.find((e) => e.campo === 'categorias')?.mensagem}
          />
          <Campo rotulo="Descrição (interna)" nome="descricao" erros={erros}><textarea rows={3} {...texto('descricao')} /></Campo>
          <Campo rotulo="Notas" nome="notas" erros={erros}><textarea rows={4} {...texto('notas')} /></Campo>
        </section>
        <section className="cartao">
          <h2 className="cartao__titulo">Prazos</h2>
          <div className="grade-campos grade-campos--3">
            <Campo rotulo="Início" nome="data_inicio" erros={erros} type="date" {...texto('data_inicio')} />
            <Campo rotulo="Prazo de entrega" nome="prazo_entrega" erros={erros} type="date" {...texto('prazo_entrega')} />
            <Campo rotulo="Data de entrega" nome="data_entrega" erros={erros} type="date" {...texto('data_entrega')} />
          </div>
        </section>
        <section className="cartao">
          <h2 className="cartao__titulo">Cobrança</h2>
          <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" {...texto('valor')} />
          <CobrancaMensal valores={valores} alterar={alterar} erros={erros} />
        </section>
      </div>
      <aside className="visao-geral__lado">
        <PreviaSite projeto={projeto} />
        <section className="cartao">
          <p className="visao-geral__etapa">
            <span className={`etapa etapa--${projeto.etapa}`}>{ROTULO_ETAPA[projeto.etapa]}</span>
            <Link to="/funil">alterar no Funil</Link>
          </p>
          <label className="campo--check">
            <input type="checkbox" checked={valores.postou_instagram} onChange={(e) => alterar({ postou_instagram: e.target.checked })} />
            Postou no Instagram
          </label>
          <label className="campo--check">
            <input type="checkbox" checked={valores.ficticio} onChange={(e) => alterar({ ficticio: e.target.checked })} />
            Projeto fictício (só portfólio)
          </label>
        </section>
      </aside>
      <div className="visao-geral__rodape">
        <Aviso erro={erros.length ? null : erro} />
        <button className="btn btn--primario" disabled={enviando}>Salvar projeto</button>
        <button type="button" className="btn btn--link-perigo" onClick={excluir}>Excluir projeto</button>
      </div>
    </form>
  );
}
```

Como a Task 9 ainda não criou `PreviaSite`, crie agora um esqueleto mínimo em `web/src/pages/projeto/PreviaSite.jsx` que a Task 9 substitui:

```jsx
export function PreviaSite() {
  return null;
}
```

`web/src/pages/projeto/Projeto.jsx`: troque `<span className={\`etiqueta etiqueta--${projeto.etapa}\`}>` por `<span className={\`etapa etapa--${projeto.etapa}\`}>`.

`web/src/styles.css`:

```css
.visao-geral { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
.visao-geral__principal, .visao-geral__lado { display: grid; gap: 0; min-width: 0; }
.visao-geral__rodape { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
.visao-geral__rodape .btn--link-perigo { margin-left: auto; }
.visao-geral__etapa { display: flex; justify-content: space-between; align-items: center; margin-top: 0; }
.visao-geral__etapa a { font-size: 0.85rem; color: var(--texto-suave); }
.cartao__titulo { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--texto-suave); font-weight: 600; margin: 0 0 12px; }
.grade-campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.grade-campos--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cobranca-mensal { display: grid; gap: 12px; margin-top: 12px; }
.btn--link-perigo { background: none; border: none; color: var(--perigo); cursor: pointer; font: inherit; font-size: 0.9rem; padding: 0; }
.btn--link-perigo:hover { text-decoration: underline; }
.campo--check { display: flex; gap: 8px; align-items: center; }
@media (max-width: 900px) {
  .visao-geral { grid-template-columns: 1fr; }
  .visao-geral__lado { order: -1; }
  .grade-campos, .grade-campos--3 { grid-template-columns: 1fr; }
}
```

(`.campo--check` já existe; não duplique — só confira que tem `display: flex; gap: 8px; align-items: center;`.) A spec pede a prévia depois de "Sobre" no celular; com a grade de duas áreas isso exigiria `grid-template-areas` por cartão — use `order: -1` no lado (prévia no topo) e registre no ledger como Ruling se preferir manter simples.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run web/src/pages/projeto`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/projeto web/src/styles.css
git commit -m "feat: nova visao geral do projeto em cartoes"
```

---

### Task 9: Pré-visualização do site

**Files:**
- Rewrite: `web/src/pages/projeto/PreviaSite.jsx`
- Create: `web/src/pages/projeto/PreviaSite.test.jsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `GET /projetos/:id/portfolio` → `{ live_url, code_url, imagens: [{ url }] }`.
- Produces: `<PreviaSite projeto={projeto} />`; `normalizarLink(texto) → string|null` exportado.

- [ ] **Step 1: Testes**

`web/src/pages/projeto/PreviaSite.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviaSite, normalizarLink } from './PreviaSite.jsx';
import { mockApi } from '../../test/mockApi.js';

const projeto = { id: 5, titulo: 'Site Ana' };

describe('normalizarLink', () => {
  it('acrescenta https:// quando falta e ignora vazio', () => {
    expect(normalizarLink('pingou.com.br')).toBe('https://pingou.com.br');
    expect(normalizarLink(' http://a.com ')).toBe('http://a.com');
    expect(normalizarLink('')).toBeNull();
    expect(normalizarLink(null)).toBeNull();
  });
});

describe('PreviaSite', () => {
  it('com link mostra o iframe e os botões', async () => {
    mockApi({ 'GET /projetos/5/portfolio': { live_url: 'pingou.com.br', code_url: 'https://github.com/x/pingou', imagens: [] } });
    render(<PreviaSite projeto={projeto} />);
    const quadro = await screen.findByTitle('Pré-visualização de Site Ana');
    expect(quadro).toHaveAttribute('src', 'https://pingou.com.br');
    expect(quadro).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    expect(screen.getByRole('link', { name: 'Abrir site ↗' })).toHaveAttribute('href', 'https://pingou.com.br');
    expect(screen.getByRole('link', { name: 'GitHub ↗' })).toHaveAttribute('href', 'https://github.com/x/pingou');
  });

  it('sem link mostra a capa do portfólio', async () => {
    mockApi({ 'GET /projetos/5/portfolio': { live_url: null, code_url: null, imagens: [{ id: 1, url: '/uploads/capa.png' }] } });
    render(<PreviaSite projeto={projeto} />);
    expect(await screen.findByRole('img', { name: 'Capa de Site Ana' })).toHaveAttribute('src', '/uploads/capa.png');
    expect(screen.queryByRole('link', { name: 'Abrir site ↗' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'GitHub ↗' })).toBeNull();
  });

  it('sem link nem capa mostra o aviso', async () => {
    mockApi({ 'GET /projetos/5/portfolio': { live_url: '', code_url: '', imagens: [] } });
    render(<PreviaSite projeto={projeto} />);
    expect(await screen.findByText('Sem link do site. Adicione em Divulgação → Portfólio.')).toBeInTheDocument();
  });

  it('se o portfólio falhar, mostra o aviso em vez de quebrar', async () => {
    mockApi({});
    render(<PreviaSite projeto={projeto} />);
    expect(await screen.findByText('Sem link do site. Adicione em Divulgação → Portfólio.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run web/src/pages/projeto/PreviaSite.test.jsx`
Expected: FAIL — `normalizarLink` não existe; nada renderiza.

- [ ] **Step 3: Implementar**

`web/src/pages/projeto/PreviaSite.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';

const LARGURA_DESKTOP = 1280;

// Link sem protocolo viraria caminho relativo dentro do CRM.
export function normalizarLink(texto) {
  const limpo = (texto ?? '').trim();
  if (!limpo) return null;
  return /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
}

export function PreviaSite({ projeto }) {
  const { dados: pf, carregando } = useCarregar(() => api(`/projetos/${projeto.id}/portfolio`), [projeto.id]);
  const site = normalizarLink(pf?.live_url);
  const codigo = normalizarLink(pf?.code_url);
  const capa = pf?.imagens?.[0]?.url;
  const quadro = useRef(null);

  // O site é desenhado com 1280px de largura e reduzido para caber no cartão, como um print do computador.
  useEffect(() => {
    const el = quadro.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(([entrada]) => {
      el.style.setProperty('--escala', String(entrada.contentRect.width / LARGURA_DESKTOP));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [site]);

  return (
    <section className="cartao previa">
      <h2 className="cartao__titulo">Pré-visualização</h2>
      <div className="previa__quadro" ref={quadro}>
        {site && (
          <iframe
            src={site}
            title={`Pré-visualização de ${projeto.titulo}`}
            sandbox="allow-scripts allow-same-origin allow-forms"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        {!site && capa && <img src={capa} alt={`Capa de ${projeto.titulo}`} />}
        {!site && !capa && !carregando && <p className="vazio previa__aviso">Sem link do site. Adicione em Divulgação → Portfólio.</p>}
      </div>
      {(site || codigo) && (
        <p className="previa__botoes">
          {site && <a className="btn btn--pequeno" href={site} target="_blank" rel="noreferrer">Abrir site ↗</a>}
          {codigo && <a className="btn btn--pequeno" href={codigo} target="_blank" rel="noreferrer">GitHub ↗</a>}
        </p>
      )}
    </section>
  );
}
```

`web/src/styles.css` — o iframe é desenhado em 1280×800 e reduzido para caber, como um print do site no computador:

```css
.previa__quadro { position: relative; aspect-ratio: 16 / 10; border-radius: 10px; overflow: hidden; background: var(--superficie-2); border: 1px solid var(--borda); }
.previa__quadro iframe { position: absolute; top: 0; left: 0; width: 1280px; height: 800px; border: 0; background: #fff; transform-origin: 0 0; transform: scale(var(--escala, 0.25)); }
.previa__quadro img { width: 100%; height: 100%; object-fit: cover; display: block; }
.previa__aviso { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; text-align: center; margin: 0; }
.previa__botoes { display: flex; gap: 8px; margin: 12px 0 0; }
```

O jsdom não tem `ResizeObserver`; o efeito sai cedo e o teste não depende da escala. Confira a escala no navegador na Task 10.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run web/src/pages/projeto`
Expected: PASS (inclusive `Projeto.test.jsx`, que agora renderiza a prévia com `live_url: null` e sem imagens → aviso).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/projeto/PreviaSite.jsx web/src/pages/projeto/PreviaSite.test.jsx web/src/styles.css
git commit -m "feat: pre-visualizacao do site na visao geral"
```

---

### Task 10: Banco real, suíte completa e conferência visual

**Files:** nenhum de código (só se a conferência achar defeito — aí volta à task dona com teste).

- [ ] **Step 1: Suíte e build**

Run: `npm test` → Expected: todos os arquivos passam.
Run: `npx vite build` → Expected: build sem erro.

- [ ] **Step 2: Backup e migration no banco real**

```bash
cp data/crm.db "data/crm-backup-antes-016-$(date +%F).db"
pm2 restart crm-madia-api
```

Confira:

```bash
node -e "
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/crm.db',{readOnly:true});
console.log(db.prepare('select nome from schema_migrations order by nome desc limit 1').get());
console.log(db.prepare('select p.id, p.titulo, group_concat(c.nome) cats from projetos p left join projetos_categorias pc on pc.projeto_id=p.id left join categorias c on c.id=pc.categoria_id where p.servico=\'site_sistema\' group by p.id').all());
console.log(db.prepare('select id, mensalidade_inicio_modo, mensalidade_inicio_data from projetos where mensalidade_ativa=1').all());"
```

Expected: última migration `016_categorias_nichos_mensalidade.sql`; todos os sites com pelo menos "Site"; projetos 12 e 13 em `entrega` sem data.

- [ ] **Step 3: Conferência no navegador** (`http://127.0.0.1:5173`, numa aba nova)

1. Configurações: listas Categorias (4 iniciais) e Nichos; adicionar "Barbearia".
2. Funil → "+ Oportunidade": pílulas, nicho, valor; criar sem categoria mostra erro. (Não crie de verdade no banco real; feche o modal.)
3. Abrir um projeto de site (ex.: Sorveteria Pingou): duas colunas; etapa só leitura com "alterar no Funil"; prévia carrega o site (ou capa/aviso); trocar categoria e salvar; mensalidade com a frase mudando por modo (não salve mensalidade em projeto real sem o Lucca pedir — desfaça antes de sair).
4. Reduzir a janela abaixo de 900px se possível (ou registre que não foi possível).

- [ ] **Step 4: Atualizar a memória do projeto** (arquivo de memória `project_tema_escuro_dashboard.md` ou um novo `project_visao_geral_projeto.md` + linha no `MEMORY.md`) com: migration 016 aplicada, backup criado, categorias/nichos em Configurações.

- [ ] **Step 5: Commit final (se houve ajuste)**

```bash
git status --short
git commit -am "fix: ajustes da conferencia visual da visao geral"   # só se houver mudança
```
