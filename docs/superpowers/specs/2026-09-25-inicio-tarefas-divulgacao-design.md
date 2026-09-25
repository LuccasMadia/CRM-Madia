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

### 2. Divulgação pendente (itens dentro da própria lista de tarefas)

Não existe seção separada. Todo projeto com `etapa = 'entregue'` que ainda não tem `postou_instagram = 1` e/ou portfólio com `publicar = 1` ganha, na sua lista de tarefas (seção "Tarefas por projeto"), um item extra por divulgação faltando — texto "Postar no Instagram" e/ou "Publicar no portfólio", sem prazo — junto das tarefas reais desse projeto (tabela `tarefas`). Vale igualmente para projetos reais e fictícios.

Isso significa que um projeto sem nenhuma tarefa real, mas com divulgação pendente, ainda assim aparece na coluna certa — só com esse(s) item(ns).

### 3. "Próximos 7 dias" perde as tarefas

A lista de tarefas some da seção "Próximos 7 dias" (que hoje mistura tarefas, parcelas, entregas e conteúdos) — ela passa a mostrar só parcelas, entregas e conteúdos, já que tarefas agora têm seção própria. Não muda o comportamento de parcelas/entregas/conteúdos nessa lista.

## Backend

### `server/domain/painel.js`

`agruparTarefasPorProjeto` não muda — continua uma função pura de agrupamento, agnóstica a se a linha veio da tabela `tarefas` ou é sintética:

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
```

`montarDivulgacaoPendente` é substituída por `montarTarefasDivulgacao`, que transforma as mesmas linhas (projeto + o que falta) em linhas no **formato de tarefa** — prontas pra entrar na mesma lista que alimenta `agruparTarefasPorProjeto`:

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

### `server/routes/painel.js`

Duas queries dentro de `r.get('/painel', ...)` — a de tarefas reais (igual antes) e a de divulgação, cujo resultado agora é somado à de tarefas antes de agrupar:

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

// ...
tarefas_por_projeto: agruparTarefasPorProjeto([...tarefasPendentes, ...montarTarefasDivulgacao(divulgacaoPendente)]),
```

A query de `tarefas` que hoje alimenta `proximos` sai da chamada de `montarProximos` (tarefas deixam de entrar nessa lista — `montarProximos` já trata `tarefas` como opcional, default `[]`):

```js
proximos: montarProximos({ parcelas: parcelasAbertas, entregas, conteudos: /* query de conteúdos, igual hoje */ }, dia),
```

A resposta de `GET /painel` ganha um campo (`divulgacao_pendente` não existe mais como campo próprio — os itens entram direto em `tarefas_por_projeto`):

```json
{
  "cartoes": { "...": "..." },
  "tarefas_por_projeto": {
    "reais": [
      { "projeto_id": 1, "projeto_titulo": "Site Ana", "tarefas": [
        { "id": 9, "texto": "Revisar", "prazo": null },
        { "id": "divulgacao-1-Postar no Instagram", "texto": "Postar no Instagram", "prazo": null }
      ] }
    ],
    "ficticios": []
  },
  "proximos": [ "...": "..." ]
}
```

## Frontend (`web/src/pages/Inicio.jsx`)

Ordem das seções na página: Cartões (sem mudança) → **Tarefas por projeto** (duas colunas lado a lado) → **Próximos 7 dias** (sem tarefas). Não existe mais seção "Divulgação pendente" separada.

- **Tarefas por projeto**: dois `<section className="cartao">` lado a lado ("Projetos reais" / "Projetos fictícios"), cada um com uma lista de projetos; sob cada título de projeto, uma lista (`<ul>`) das tarefas com texto e prazo formatado (`formatarData`) quando existir — sem distinção visual entre tarefa real e item de divulgação, eles chegam prontos e misturados de `tarefas_por_projeto`.

## Fora de escopo

- Marcar tarefa como concluída ou editar divulgação direto pela Início — os links levam ao projeto, onde isso já é feito (AbaTarefas, AbaGeral, AbaPortfolio).
- Mudar a janela de "7 dias" das parcelas/entregas/conteúdos.
- Qualquer paginação/limite de quantidade nas listas novas — se a lista crescer demais, isso é ajuste futuro.

## Testes

- `server/domain/painel.test.js`: `agruparTarefasPorProjeto` (já testada, sem mudança). Trocar os casos de `montarDivulgacaoPendente` por casos de `montarTarefasDivulgacao`: projeto faltando só Instagram gera um item; faltando os dois gera dois itens; projeto com tudo em dia não gera nenhum.
- `server/routes/painel.test.js`: atualizar o teste de "agrupa tarefas por projeto..." — um projeto entregue sem `postou_instagram`/portfólio deve ter os itens de divulgação dentro de `tarefas_por_projeto` (junto das tarefas reais, se houver), e `divulgacao_pendente` não existe mais na resposta.
- `web/src/pages/Inicio.test.jsx`: atualizar o mock de `GET /painel` (tirar `divulgacao_pendente`, incluir os itens de divulgação dentro de `tarefas_por_projeto`) e o texto do item ("Postar no Instagram"/"Publicar no portfólio") aparecendo na lista de tarefas do projeto certo.
