# Agrupamento de lotes por nome — Design

## Contexto

Na aba de Lotes das placas de avaliação (`web/src/pages/placas/AbaLotes.jsx`), cada linha da tabela é uma compra de um único material (`placas_lotes`: material + quantidade + valor do kit + valor do frete + data). O campo `nome_lote` já existe no schema como texto livre opcional (ex: "Compra Outubro"), mas hoje não tem nenhum uso além de rótulo exibido numa coluna — lotes com o mesmo `nome_lote` aparecem como linhas soltas e independentes, sem relação visual entre si.

O Lucca quer agrupar visualmente os lotes que compartilham o mesmo `nome_lote`, para ver de forma clara "o que comprei e quando" em cada compra — por exemplo, uma mesma leva de compra que incluiu placa PVC + adesivo + tag NFC, cada um lançado como um lote separado mas pertencente à mesma leva.

## Decisões confirmadas com o Lucca

- Critério de agrupamento: o campo `nome_lote` (texto livre), não o material.
- Agrupamento é por **igualdade exata de texto** (sem normalizar maiúsculas/espaços) — a proteção contra nomes "quase iguais" fica a cargo do autocomplete no formulário, não de normalização na comparação.
- Para reduzir erro de digitação, o campo `nome_lote` no formulário de criar/editar lote ganha sugestões (via `<datalist>`) com os nomes já usados antes, mas continua aceitando qualquer texto novo.
- Visualização: seções expansíveis (cartão com cabeçalho recolhido por padrão) — não uma tabela única com linhas de subtotal.
- Cabeçalho de cada seção mostra: nome do lote, total gasto (soma de kit + frete de todos os itens do grupo) e a data — se todos os itens tiverem a mesma data, mostra só ela; se houver datas diferentes, mostra o intervalo (ex: "05/10 – 08/10").
- Lotes sem `nome_lote` (texto vazio) continuam como linhas soltas, fora de qualquer seção.
- A lista final intercala seções de grupo e linhas soltas numa única linha do tempo, ordenada pela data mais recente de cada entrada (grupo usa a data mais recente dentro dele) — mais recente primeiro, igual à ordenação atual.
- Edição e exclusão continuam por lote individual (dentro da seção expandida), sem ação de "editar o grupo inteiro".
- Abordagem: agrupamento feito inteiramente no frontend, sem mudanças no backend/schema — a API `GET /placas/lotes` continua devolvendo a lista plana como hoje.

## Lógica de agrupamento (dados)

Função pura `agruparLotesPorNome(lotes)` em `AbaLotes.jsx` (ou módulo auxiliar ao lado, ex. `AbaLotes.helpers.js`):

1. Separa os lotes em dois conjuntos: `nome_lote` preenchido (após `trim()`) e `nome_lote` vazio/nulo.
2. Agrupa os preenchidos por valor exato de `nome_lote`.
3. Para cada grupo, calcula:
   - `totalCentavos`: soma de `valor_kit_centavos + valor_frete_centavos` de todos os itens do grupo.
   - `dataMin` / `dataMax`: menor e maior `data_compra` do grupo (para exibir data única ou intervalo).
   - `itens`: lista dos lotes do grupo, ordenada por data.
4. Os lotes sem nome ficam como entradas soltas, cada uma com sua própria data.
5. Monta uma lista combinada de "entradas" (grupo ou solta), ordenada pela data mais recente de cada entrada, decrescente.

Essa função é pura (sem estado de componente) e testável isoladamente.

## Mudanças na UI (`AbaLotes.jsx`)

- A tabela única atual é substituída por uma lista de entradas, renderizada na ordem definida pelo agrupamento:
  - **Seção de grupo**: cartão expansível, recolhido por padrão. Cabeçalho com nome do lote, data/intervalo e total gasto. Ao expandir, mostra uma tabela interna com as mesmas colunas de hoje (Material | Quantidade | Kit (R$) | Frete (R$) | Data | ações).
  - **Linha solta**: mantém o visual de linha de tabela atual, mesmas colunas e ações.
- Estado de expandido/recolhido é local (`useState`), não precisa persistir entre sessões.
- Editar/Excluir continuam agindo sobre o lote individual.

## Autocomplete no formulário (`FormPlacaLote.jsx`)

- O campo `nome_lote` passa a usar `<input list="nomes-lote-sugestoes">` + `<datalist>` nativo do HTML, sem biblioteca nova.
- As opções do `<datalist>` são os nomes distintos (não vazios) de `nome_lote` já existentes entre os lotes carregados, ordenados alfabeticamente — passados como prop de `AbaLotes.jsx` para `FormPlacaLote.jsx` (não precisa de chamada de API nova, já que a lista completa de lotes já é carregada pela aba).
- O campo continua aceitando texto livre normalmente — o `<datalist>` só sugere, nunca restringe.

## Testes

- Teste unitário de `agruparLotesPorNome`: grupos com 1 e vários itens; datas iguais (data única) e diferentes (intervalo); itens sem `nome_lote`; ordenação da lista combinada por data mais recente.
- Teste de componente (`Placas.test.jsx` ou teste específico da aba): seção aparece recolhida por padrão, expande ao clicar, total e intervalo de datas corretos, lote sem nome aparece como linha solta.
- Teste do `<datalist>` no formulário: sugestões refletem os nomes já usados nos lotes carregados.

## Fora de escopo

- Qualquer mudança no schema do banco ou na API `/placas/lotes`.
- Normalização de texto (maiúsculas/espaços) na comparação de `nome_lote`.
- Ação de editar ou excluir um grupo inteiro de uma vez.
- Persistência do estado expandido/recolhido entre sessões.
