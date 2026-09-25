# Projeto fictício (só portfólio) — Design

## Contexto

Alguns projetos cadastrados no CRM não são clientes reais — são peças fictícias criadas só para mostrar habilidades no site de portfólio público (ex: um "case" inventado). Hoje eles entram na mesma tabela `projetos`, com a mesma `etapa` de funil de vendas (contato → proposta → andamento → entregue → perdido) dos projetos reais. Isso faz com que apareçam misturados no **Funil** (kanban de vendas) como se fossem oportunidades reais em andamento, e infla os números do **Painel** (cartões "Em andamento"/"Propostas" e a lista de "próximos") e do **Financeiro** (parcelas e recebido por mês), caso alguém cadastre parcelas de teste.

## Escopo

Nova coluna booleana `ficticio` em `projetos`, marcável na edição e na criação do projeto. Quando `ficticio = 1`:

- **Some do Funil** (kanban de vendas).
- **Some do Painel** — cartões "Em andamento" e "Propostas", e da lista de "próximos" (tarefas, parcelas, entregas e conteúdos ligados a esse projeto).
- **Some do Financeiro** — lista de parcelas (`GET /parcelas`) e o gráfico de recebido por mês (`GET /financeiro/mensal`).

**Não muda:** a lista de **Projetos** (`/projetos`) e o **detalhe do projeto** continuam mostrando tudo, sem filtro — é só ali que se gerencia o projeto fictício normalmente (parcelas do próprio projeto em `/projetos/:id/parcelas` também não são filtradas, mesmo que o projeto seja fictício). O campo `etapa` continua existindo e editável — não força nenhum valor.

## Modelo de dados

Nova migration `server/db/migrations/004_ficticio.sql`, mesmo padrão de `003_instagram.sql`:

```sql
ALTER TABLE projetos ADD COLUMN ficticio INTEGER NOT NULL DEFAULT 0 CHECK (ficticio IN (0, 1));
```

## Backend

### `server/repos/projetos.js`
- `CAMPOS_PROJETO` ganha `'ficticio'`.
- `listarComCliente({ etapa, cliente_id, postou_instagram, ficticio })`: mesmo padrão de `postou_instagram` — `if (ficticio) { condicoes.push('p.ficticio = ?'); args.push(Number(ficticio)); }`. Como o valor chega como string da query (`'0'` ou `'1'`), `'0'` também é truthy em JS, então `?ficticio=0` filtra corretamente para "não fictícios" (mesmo comportamento já usado por `postou_instagram=0`).

### `server/routes/projetos.js`
- `REGRAS_PROJETO` ganha `ficticio: { tipo: 'bool', padrao: 0 }`.
- `r.get('/')` passa `ficticio: req.query.ficticio` para `listarComCliente`.

### `server/routes/painel.js`
Adicionar `AND p.ficticio = 0` (ou `WHERE ... AND ficticio = 0`) nas três queries que hoje misturam fictícios com reais:

```js
const parcelasAbertas = todas(
  `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa
   JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NULL AND p.ficticio = 0`,
);
const propostas = todas("SELECT valor_total_centavos FROM projetos WHERE etapa = 'proposta' AND ficticio = 0");
const entregas = todas(
  `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
   WHERE p.etapa = 'andamento' AND p.ficticio = 0`,
);
```

E na montagem de `proximos`, a query de tarefas e a de conteúdos (que hoje não filtram por projeto fictício):

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

(`LEFT JOIN` porque `conteudos.projeto_id` pode ser `NULL` — conteúdo sem projeto ligado continua aparecendo normalmente.)

### `server/routes/parcelas.js`
- `GET /parcelas`: acrescentar `WHERE p.ficticio = 0` na query que já faz `JOIN projetos p JOIN clientes c`.
- `GET /financeiro/mensal`: hoje usa `parcelas.listar()` (repo simples, sem join, sem filtro possível). Trocar por uma query direta no `db` (já disponível no escopo de `rotasParcelas`) que faz o join e filtra:

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

(`linha` já é importado no topo do arquivo.)

## Frontend

### `web/src/pages/projeto/AbaGeral.jsx`
Novo campo no `useFormulario` inicial: `ficticio: Boolean(projeto.ficticio)`. Novo checkbox, mesmo padrão visual dos existentes (mensalidade, Instagram), logo depois do de Instagram:

```jsx
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
```

Como `resto` (tudo exceto `valor`/`mensalidade_valor`) já é espalhado direto no corpo do `PUT`, nenhuma mudança extra é necessária no `salvar()`.

### `web/src/components/FormOportunidade.jsx`
- `useFormulario` ganha `ficticio: false` no estado inicial, e o componente passa a desestruturar `setValores` também.
- Novo checkbox igual ao de `AbaGeral`, com o mesmo rótulo "Projeto fictício (só portfólio)", antes do botão de submit.
- `enviar()` inclui `ficticio: valores.ficticio` no `corpo` enviado.

### `web/src/pages/Funil.jsx`
Troca `api('/projetos')` por `api('/projetos?ficticio=0')` — o kanban de vendas nunca mostra fictícios.

## Fora de escopo

- Filtrar/differenciar fictícios na lista de Projetos ou no detalhe do projeto.
- Qualquer UI para listar "só os fictícios" (ex: uma aba própria) — se isso fizer falta depois, é uma entrega separada.
- Mudar o significado de `etapa` para esses projetos.

## Testes

- `server/repos` (via `server/routes/projetos.test.js`): `GET /projetos?ficticio=0` não retorna projetos com `ficticio: true`; sem o filtro, continua retornando todos.
- `server/routes/painel.test.js`: criar um projeto fictício em `etapa: 'andamento'` com parcela/tarefa/conteúdo associados e confirmar que os cartões (`em_andamento`, `propostas`) e a lista de `proximos` não contam esse projeto.
- `server/routes/parcelas.test.js`: criar parcela em projeto fictício e confirmar que ela não aparece em `GET /parcelas` nem entra na soma de `GET /financeiro/mensal`.
- `web/src/pages/Funil.test.jsx`: atualizar as chaves de mock de `'GET /projetos'` para `'GET /projetos?ficticio=0'` (a página passa a chamar essa URL); o teste de criação com cliente novo passa a esperar `ficticio: false` no corpo do `POST /projetos`.
