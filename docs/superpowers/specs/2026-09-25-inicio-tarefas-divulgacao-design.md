# Início: tarefas por projeto + divulgação pendente — Design

## Contexto

O Lucca não costuma definir prazo em boa parte das tarefas, então a seção atual "Próximos 7 dias" (`web/src/pages/Inicio.jsx`, alimentada por `GET /painel` → `domain/painel.js#montarProximos`) esconde qualquer tarefa sem `prazo`, porque filtra por `i.data && i.data <= limite`. Isso faz a maioria das tarefas nunca aparecer na tela inicial.

Ele quer, na página **Início**:
1. Ver as tarefas pendentes agrupadas por projeto (com ou sem prazo), separando **projetos reais** de **projetos fictícios** (campo `ficticio` de `projetos`, já existente).
2. Um lembrete de **divulgação pendente**: projetos entregues que ainda não foram marcados como publicados no portfólio (`portfolio.publicar`) e/ou postados no Instagram (`projetos.postou_instagram`).

## Escopo

### 1. Tarefas por projeto (nova seção)

Lista, em duas colunas — "Projetos reais" e "Projetos fictícios" — todo projeto com pelo menos uma tarefa pendente (`concluida = 0`), excluindo projetos com `etapa = 'perdido'`. Cada projeto mostra seu título (linkado para `/projetos/:id`) e, embaixo, a lista das suas tarefas pendentes — com prazo quando tiver, sem esconder as que não têm.

- **Ordem dos projetos** dentro de cada coluna: por `prazo_entrega` do projeto (sem prazo por último), mesmo critério já usado em `listarComCliente`/Funil — `ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id`.
- **Ordem das tarefas** dentro de um projeto: `ordem, id` — a mesma ordem manual que `AbaTarefas.jsx` já usa (setinhas ↑↓), sem reordenar por prazo.
- Coluna vazia (nenhum projeto com tarefa pendente) mostra `<p className="vazio">`.

### 2. Divulgação pendente (nova seção)

Lista única (sem separar real/fictício) de todo projeto com `etapa = 'entregue'` que ainda não tem as duas divulgações feitas: `postou_instagram = 1` **e** portfólio com `publicar = 1`. Aparece o que falta: só Instagram, só Portfólio, ou os dois. Vale igualmente para projetos reais e fictícios — a regra é a mesma para ambos.

### 3. "Próximos 7 dias" perde as tarefas

A lista de tarefas some da seção "Próximos 7 dias" (que hoje mistura tarefas, parcelas, entregas e conteúdos) — ela passa a mostrar só parcelas, entregas e conteúdos, já que tarefas agora têm seção própria. Não muda o comportamento de parcelas/entregas/conteúdos nessa lista.

## Backend

### `server/domain/painel.js`

Duas funções novas, no mesmo espírito de `montarProximos` (pura, recebe linhas já buscadas do banco):

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

`montarDivulgacaoPendente` recebe linhas já filtradas pelo SQL (só quem tem algo faltando) e só remonta o formato — igual ao padrão de `montarProximos`, que também não filtra por conta própria o que a query já resolveu.

### `server/routes/painel.js`

Duas queries novas dentro de `r.get('/painel', ...)`:

```js
const tarefasPendentes = todas(
  `SELECT t.id, t.texto, t.prazo, p.id AS projeto_id, p.titulo AS projeto_titulo, p.ficticio
   FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
   WHERE t.concluida = 0 AND p.etapa <> 'perdido'
   ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id, t.ordem, t.id`,
);

const divulgacaoPendente = todas(
  `SELECT p.id, p.titulo, p.ficticio, p.postou_instagram, COALESCE(pf.publicar, 0) AS portfolio_publicado
   FROM projetos p LEFT JOIN portfolio pf ON pf.projeto_id = p.id
   WHERE p.etapa = 'entregue' AND (p.postou_instagram = 0 OR COALESCE(pf.publicar, 0) = 0)
   ORDER BY p.titulo`,
);
```

E a query de `tarefas` que hoje alimenta `proximos` sai da chamada de `montarProximos` (tarefas deixam de entrar nessa lista — `montarProximos` já trata `tarefas` como opcional, default `[]`):

```js
proximos: montarProximos({ parcelas: parcelasAbertas, entregas, conteudos: /* query de conteúdos, igual hoje */ }, dia),
```

A resposta de `GET /painel` ganha dois campos:

```json
{
  "cartoes": { "...": "..." },
  "tarefas_por_projeto": { "reais": [ { "projeto_id": 1, "projeto_titulo": "Site Ana", "tarefas": [{ "id": 9, "texto": "Revisar", "prazo": null }] } ], "ficticios": [] },
  "divulgacao_pendente": [ { "projeto_id": 3, "titulo": "Loja X", "ficticio": false, "falta_portfolio": true, "falta_instagram": false } ],
  "proximos": [ "...": "..." ]
}
```

## Frontend (`web/src/pages/Inicio.jsx`)

Ordem das seções na página: Cartões (sem mudança) → **Divulgação pendente** → **Tarefas por projeto** (duas colunas lado a lado, mesmo grid de duas colunas que outras telas já usam) → **Próximos 7 dias** (sem tarefas).

- **Divulgação pendente**: tabela simples — Projeto (link) | Falta (texto: "Instagram", "Portfólio" ou "Instagram e Portfólio"). Some a seção inteira se a lista vier vazia (parecido com o `vazio` de "Nada para os próximos 7 dias.").
- **Tarefas por projeto**: dois `<section className="cartao">` lado a lado ("Projetos reais" / "Projetos fictícios"), cada um com uma lista de projetos; sob cada título de projeto, uma lista (`<ul>`) das tarefas com texto e prazo formatado (`formatarData`) quando existir.

## Fora de escopo

- Marcar tarefa como concluída ou editar divulgação direto pela Início — os links levam ao projeto, onde isso já é feito (AbaTarefas, AbaGeral, AbaPortfolio).
- Mudar a janela de "7 dias" das parcelas/entregas/conteúdos.
- Qualquer paginação/limite de quantidade nas listas novas — se a lista crescer demais, isso é ajuste futuro.

## Testes

- `server/domain/painel.test.js` (já existe, testando `montarProximos`): adicionar casos para `agruparTarefasPorProjeto` (agrupa corretamente por projeto, separa reais/fictícios, preserva ordem de entrada) e `montarDivulgacaoPendente` (mapeia `portfolio_publicado`/`postou_instagram` para `falta_portfolio`/`falta_instagram`).
- `server/routes/painel.test.js`: novo teste cobrindo cenário com tarefa sem prazo (aparece em `tarefas_por_projeto`, não aparece em `proximos`), tarefa de projeto fictício (vai para `ficticios`), e projeto entregue sem instagram/portfólio (aparece em `divulgacao_pendente` com o campo certo marcado).
- `web/src/pages/Inicio.test.jsx`: atualizar o mock de `GET /painel` para incluir `tarefas_por_projeto`/`divulgacao_pendente`, e adicionar casos: tarefa sem prazo aparece na coluna certa; projeto em `divulgacao_pendente` aparece com o texto certo do que falta; nenhuma das duas seções novas quebra quando vêm vazias.
