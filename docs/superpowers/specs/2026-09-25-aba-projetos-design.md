# Aba dedicada de Projetos — Design

## Contexto

Hoje não existe uma visão central de projetos no CRM. Projetos só aparecem em dois lugares:

- **Funil** (`web/src/pages/Funil.jsx`): kanban por etapa de venda (contato → proposta → andamento → entregue → perdido). Focado em pipeline de vendas, não em controle operacional.
- **Detalhe do cliente** (`ClienteDetalhe.jsx`): lista simples de títulos de projeto por cliente, sem contexto financeiro ou de prazo.

O Lucca quer uma aba dedicada, em formato de tabela, para enxergar todos os projetos de uma vez e "controlar" mais facilmente — complementando o Funil, não substituindo.

## Escopo

Uma nova página de **lista/tabela de projetos**, somente leitura (sem criação — isso continua só pelo Funil). Backend não muda: o endpoint `GET /projetos` já suporta os filtros necessários (`?etapa=`, `?cliente_id=`) e já retorna todos os campos usados (`cliente_nome`, `valor_total_centavos`, `etapa`, `atualizado_em`).

## Navegação

Novo item **"Projetos"** no menu lateral (`web/src/App.jsx`), entre "Funil" e "Clientes":

```
Início · Funil · Projetos · Clientes · Conteúdo · Financeiro · Configurações
```

Nova rota `/projetos` → novo componente `web/src/pages/Projetos.jsx`.

## Colunas da tabela

| Coluna | Conteúdo |
|---|---|
| Cliente | `cliente_nome`, link para `/clientes/:cliente_id` |
| Título | `titulo`, link para `/projetos/:id` |
| Etapa | tag `etiqueta etiqueta--{etapa}` com `ROTULO_ETAPA[etapa]` (mesmo padrão usado em Funil/ClienteDetalhe) |
| Valor total | `formatarDinheiro(valor_total_centavos)` |

Estado vazio: `<p className="vazio">Nenhum projeto encontrado.</p>` (mesmo padrão das outras listas).

## Filtros

Dois selects no cabeçalho da página, seguindo o padrão visual de `Financeiro.jsx` (`form--linha` com `label.campo`):

- **Etapa** — opções: "Ativos" (valor `''`, padrão), Contato, Proposta enviada, Em andamento, Entregue, Perdido (usa `ETAPAS`/`ROTULO_ETAPA` de `lib/rotulos.js`).
- **Cliente** — opções: "Todos os clientes" (valor `''`, padrão) + lista carregada de `GET /clientes` (mesmo padrão de `FormOportunidade.jsx`).

### Regra de "Ativos" (ocultar Perdido por padrão)

O backend não tem um valor de etapa que signifique "todas menos perdido" — só filtra por uma etapa exata quando `etapa` é passado. Por isso:

- Quando o filtro de etapa está em "Ativos" (`''`), a página busca `GET /projetos` (sem `etapa` na query, só `cliente_id` se selecionado) e **remove no client** os itens com `etapa === 'perdido'` do array retornado antes de renderizar.
- Quando o usuário seleciona uma etapa específica (incluindo "Perdido"), a página passa `?etapa=<valor>` na query e não faz filtragem adicional — o backend já retorna só aquela etapa.

## Ordenação

Sempre mais recentes primeiro: depois de aplicar os filtros acima, a lista é ordenada no client por `atualizado_em` decrescente (`b.atualizado_em.localeCompare(a.atualizado_em)`, já que é string ISO). O endpoint `GET /projetos` ordena por `prazo_entrega` (usado pelo Funil) — essa página não depende dessa ordem e reordena por conta própria, sem precisar de mudança no backend.

## Data flow

```
Projetos.jsx
  ├─ useCarregar(() => api(`/clientes`))          → popula select de Cliente
  └─ useCarregar(() => api(`/projetos${query}`))  → query = URLSearchParams({ etapa, cliente_id })
                                                       filtrada para remover chaves vazias
       ↓
  filtra 'perdido' no client quando etapaFiltro === ''
       ↓
  ordena por atualizado_em desc
       ↓
  renderiza tabela
```

Isso replica o padrão de `Financeiro.jsx` (montagem de query string a partir de estado local) e de `Clientes.jsx` (fetch + tabela + link).

## Fora de escopo

- Criação de projeto por essa tela (continua só via "+ Oportunidade" no Funil).
- Colunas financeiras (mensalidade, próximo vencimento) ou de prazo — podem entrar depois se sentir falta, mas não fazem parte desta entrega.
- Edição inline nesta tabela — edição continua no detalhe do projeto (`/projetos/:id`).

## Testes

Novo arquivo `web/src/pages/Projetos.test.jsx`, seguindo o padrão de `Funil.test.jsx`/`Clientes.test.jsx` (mock via `mockApi`, render via `renderizar`):

1. Renderiza a lista com cliente, título (link), etapa e valor.
2. Oculta projetos com etapa `perdido` quando nenhum filtro de etapa é escolhido.
3. Filtro por etapa específica (ex.: "Perdido") busca `GET /projetos?etapa=perdido` e mostra os itens retornados sem filtragem adicional.
4. Filtro por cliente busca `GET /projetos?cliente_id=<id>`.
5. Lista vem ordenada por `atualizado_em` decrescente independente da ordem retornada pela API.
6. Estado vazio mostra "Nenhum projeto encontrado."
