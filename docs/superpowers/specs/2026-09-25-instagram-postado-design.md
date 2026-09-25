# Marcação de postagem no Instagram — Design

## Contexto

O sistema já modela conteúdo/postagens via a aba "Conteúdo" (`canal: instagram|portfolio`, `status: ideia|produzindo|agendado|publicado`, ligado a um `projeto_id`), mas essa tabela está vazia — nunca foi usada na prática. O Lucca quer algo mais direto: uma marcação manual simples, por projeto, dizendo se aquele projeto já teve uma postagem no Instagram, e poder ver/filtrar isso na lista de Projetos (`web/src/pages/Projetos.jsx`, criada recentemente).

## Escopo

Um campo booleano `postou_instagram` no projeto — sem data, sem link, só sim/não — seguindo exatamente o mesmo padrão já usado para `mensalidade_ativa` (coluna no banco, campo na aba "Visão geral", sem validação cruzada porque não depende de outro campo).

## Backend

### Migração

Nova migração `server/db/migrations/003_instagram.sql`:

```sql
ALTER TABLE projetos ADD COLUMN postou_instagram INTEGER NOT NULL DEFAULT 0 CHECK (postou_instagram IN (0, 1));
```

### Campos e regras

- `server/repos/projetos.js`: `CAMPOS_PROJETO` ganha `'postou_instagram'`.
- `server/routes/projetos.js`: `REGRAS_PROJETO` ganha `postou_instagram: { tipo: 'bool', padrao: 0 }`. Aceito em `POST /projetos` e `PUT /projetos/:id` (incluindo o fluxo de `novo_cliente`, que reusa `REGRAS_PROJETO`). Sem validação cruzada — ao contrário da mensalidade, este campo não exige nenhum outro dado.

### Filtro em `GET /projetos`

`server/repos/projetos.js`, método `listarComCliente({ etapa, cliente_id, postou_instagram })`: quando `postou_instagram` vier na query (`'1'` ou `'0'`), adiciona `p.postou_instagram = ?` às condições, convertendo para `Number(postou_instagram)`. `server/routes/projetos.js`, rota `GET /`, repassa `req.query.postou_instagram` para `listarComCliente`.

## Frontend

### Aba "Visão geral" (`web/src/pages/projeto/AbaGeral.jsx`)

Novo checkbox "Postou no Instagram", no mesmo padrão visual e posição do checkbox "Cobra mensalidade" já existente (logo abaixo dele). Estado inicial do formulário ganha `postou_instagram: Boolean(projeto.postou_instagram)`; o envio do formulário (`PUT /projetos/:id`) inclui `postou_instagram: Boolean(valores.postou_instagram)`.

### Aba Projetos (`web/src/pages/Projetos.jsx`)

- Novo estado de filtro `instagram` (valores: `''` Todos, `'1'` Postaram, `'0'` Não postaram), incluído na `consulta` (URLSearchParams) que já monta `etapa` e `cliente_id`.
- Nova coluna "Instagram" na tabela, entre "Etapa" e "Valor total", exibindo `p.postou_instagram ? 'Sim' : 'Não'`.
- Novo select no cabeçalho, ao lado dos filtros de Etapa e Cliente, rotulado "Instagram", com as três opções acima.

## Fora de escopo

- Data ou link do post — só o booleano.
- Qualquer alteração na aba "Conteúdo" existente (continua sem uso, sem relação com este campo).
- Migrar/relacionar esta marcação com a tabela `conteudos` — são mecanismos independentes.

## Testes

- Backend: `server/routes/projetos.test.js` — aceita e retorna `postou_instagram` em `POST`/`PUT`; `server/routes/projetos.test.js` ou teste de repo — `GET /projetos?postou_instagram=1` retorna só os marcados.
- Frontend: `web/src/pages/projeto/Projeto.test.jsx` — marca o checkbox e confirma que o `PUT` enviado inclui `postou_instagram: true`.
- Frontend: `web/src/pages/Projetos.test.jsx` — exibe a coluna Instagram corretamente e filtra via o novo select.
