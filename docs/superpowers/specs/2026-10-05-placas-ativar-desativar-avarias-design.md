# Placas — ativar/desativar materiais e modelos + aba de Avarias — Design

**Data:** 2026-10-05
**Status:** aprovado

## Contexto

No subsistema de Placas (`docs/superpowers/specs/2026-10-03-placas-avaliacao-design.md`), o Lucca trocou os materiais/modelos iniciais e não vai mais comprar/vender alguns deles. Hoje só existe Editar/Excluir, e Excluir é bloqueado quando há lote, receita ou venda vinculada — então esses itens antigos ficam presos nas listas e nos `<select>` de lançamento para sempre.

Separadamente, ele também quebra/estraga placas já montadas (fora do fluxo de venda) e precisa abater isso do estoque e saber quanto perdeu, sem forçar a receita padrão do modelo quando a quebra consumiu materiais diferentes do normal.

Duas features pequenas, encaixadas no mesmo subsistema:

1. **Ativar/desativar** materiais e modelos.
2. **Aba de Avarias**, com receita editável por lançamento.

## Feature 1 — Ativar/desativar materiais e modelos

### Decisões confirmadas

- Soft toggle (`ativo`), não exclusão: mantém lotes/receitas/vendas antigas intactas e os cálculos de custo/estoque/lucro funcionando sem mudança.
- Itens inativos continuam visíveis nas telas de Materiais/Modelos, só separados dos ativos por uma linha divisória (não desaparecem da listagem).
- Ação por linha (botão "Desativar"/"Reativar"), sem seleção em lote.
- Os `<select>` de material/modelo nos formulários de lançamento (`FormPlacaLote`, `FormPlacaModelo`, `FormPlacaVenda`, e o novo `FormPlacaAvaria`) só oferecem itens ativos — exceto o item já selecionado no registro em edição, que continua aparecendo mesmo se foi desativado depois, para não perder a referência ao reabrir o formulário.
- Excluir continua com as mesmas regras de bloqueio de hoje; desativar não exige ausência de vínculos (pode desativar mesmo com histórico).

### Modelo de dados

Nova migration, adiciona a mesma coluna nas duas tabelas:

```sql
ALTER TABLE placas_materiais ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE placas_modelos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
```

### Backend (`server/repos/placas.js`, `server/routes/placas.js`)

- `ativo` entra em `CAMPOS_MATERIAL` e `CAMPOS_MODELO` (passa a vir em todo `listar`/`obter`, sem mudança de assinatura).
- Dois endpoints novos por entidade, em vez de expor `ativo` no `PUT` genérico (é uma ação de botão, não um campo de formulário):
  - `POST /placas/materiais/:id/desativar` e `POST /placas/materiais/:id/ativar`
  - `POST /placas/modelos/:id/desativar` e `POST /placas/modelos/:id/ativar`
  - Cada um faz `atualizar(id, { ativo: 0|1 })` e devolve o registro atualizado (material passa por `comCalculo`, modelo por `montarModelo`, mesmo formato do `GET`/`PUT` de hoje). 404 se o id não existir.

### Frontend

- `AbaMateriais` e `AbaModelos`: a lista vem do mesmo `GET` de sempre; o componente separa `ativos`/`inativos` (filtro simples por `m.ativo`), renderiza os ativos primeiro, uma linha divisória (`<tr>` ou `<hr>` dentro da tabela, visualmente discreta) e os inativos depois, com estilo mais apagado (classe CSS nova, ex. `linha--inativa`). Botão por linha: "Desativar" nos ativos, "Reativar" nos inativos, ao lado de Editar/Excluir.
- `FormPlacaLote`, `FormPlacaModelo` (select de material em cada item da receita), `FormPlacaVenda`, `FormPlacaAvaria`: a lista de opções do `<select>` passa a ser `(lista ?? []).filter(x => x.ativo || String(x.id) === valorAtualDoCampo)`.

### Fora de escopo

- Sem filtro/toggle "mostrar inativos" — eles já aparecem sempre, separados.
- Sem seleção múltipla/ação em lote.

## Feature 2 — Aba de Avarias

### Decisões confirmadas

- Registra placas já montadas que quebraram/estragaram fora do fluxo de venda: abate material do estoque, sem preço de venda.
- Ao lançar, a lista de materiais consumidos vem pré-preenchida com a receita atual do modelo, mas é **editável livremente** nesse lançamento (adicionar, remover ou trocar material/quantidade) — mesma UI do editor de receita de `FormPlacaModelo`. A edição não altera a receita do modelo; é um snapshot só daquela avaria. O próximo lançamento de avaria volta a pré-carregar a receita padrão (atual) do modelo.
- Mostra o custo perdido (prejuízo) por avaria e um total agregado — mesmo conceito de snapshot usado em `placas_vendas.custo_unitario_centavos`.

### Modelo de dados

Nova migration, 2 tabelas, mesmo padrão de `placas_vendas`/`placas_modelos_itens`:

```sql
CREATE TABLE placas_avarias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  custo_unitario_centavos INTEGER NOT NULL,
  observacao TEXT,
  data_avaria TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE placas_avarias_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaria_id INTEGER NOT NULL REFERENCES placas_avarias(id),
  material_id INTEGER NOT NULL REFERENCES placas_materiais(id),
  quantidade INTEGER NOT NULL
);
```

Notas:
- `placas_avarias_itens.quantidade` é "por unidade avariada", igual ao conceito de `placas_modelos_itens` — o consumo total de um material numa avaria é `item.quantidade * avaria.quantidade`.
- `custo_unitario_centavos` é snapshot calculado no momento do lançamento (soma de `custoAtualMaterial(material_id) * quantidade` de cada item da avaria), igual ao que já acontece em vendas. Não recalcula se o custo do material mudar depois.
- Sem `cliente`/preço — avaria não é venda.

### Domínio (`server/domain/placas.js`)

- `quantidadeConsumidaAvariaMaterial(materialId, avarias, itensAvaria)` — mesmo formato de `quantidadeConsumidaMaterial`, somando `item.quantidade * avaria.quantidade` para as avarias daquele material.
- `estoqueMaterial(materialId, lotes, vendas, itensModelo, avarias = [], itensAvaria = [])` — passa a subtrair também `quantidadeConsumidaAvariaMaterial(...)`. Parâmetros novos com default `[]` para não quebrar chamadas existentes (se houver).
- `materiaisComEstoqueNegativo` recebe os mesmos parâmetros novos, repassados para `estoqueMaterial`.
- `custoItensAvaria(itens, lotes)` — soma `item.quantidade * custoAtualMaterial(item.material_id, lotes)`; mesma lógica de `custoReceitaModelo`, mas para a lista de itens da avaria (que pode ser diferente da receita do modelo). `null` se algum material não tem lote ainda (mesmo tratamento de "não calculável" usado hoje).

### Backend (`server/routes/placas.js`)

- `GET /placas/avarias` → lista avarias com `nome` do modelo, itens embutidos e `custo_total_centavos` (`custo_unitario_centavos * quantidade`).
- `POST /placas/avarias` → body `{ modelo_id, quantidade, observacao?, data_avaria, itens? }`.
  - Se `itens` não vier, usa a receita atual do modelo (`placas_modelos_itens` filtrado por `modelo_id`) como os itens da avaria.
  - Se vier, usa exatamente o enviado (valida cada item como em `validarItens`, reaproveitando a função já existente).
  - Calcula `custo_unitario_centavos` via `custoItensAvaria`; se vier `null` (material sem lote), `ErroValidacao`.
  - Grava avaria + itens numa transação (`emTransacao`), devolve avaria com itens e aviso de estoque negativo (`avisos_estoque`, mesmo formato do endpoint de vendas) considerando o novo consumo.
- `PUT /placas/avarias/:id` → mesmo formato (permite editar quantidade, itens, observação, data); recalcula `custo_unitario_centavos` se `itens` ou `quantidade` mudarem.
- `DELETE /placas/avarias/:id` → remove avaria + itens (sem bloqueio — avaria não é referenciada por mais nada).
- `GET /placas/materiais` (`comCalculo`) e `GET /placas/resumo` passam a considerar avarias no estoque.
- `GET /placas/resumo` ganha `prejuizo_avarias`: `{ total_centavos, por_modelo: [{ modelo_id, modelo_nome, quantidade, total_centavos }] }`.

### Frontend

- Nova aba **Avarias** na navegação de `Placas.jsx` (`web/src/pages/placas/AbaAvarias.jsx`), mesmo padrão de abas existente.
  - Tabela: Modelo, Quantidade, Custo perdido, Data, Observação, Editar/Excluir.
  - `web/src/components/FormPlacaAvaria.jsx`: select de Modelo (ativos + o já selecionado em edição) → ao escolher/trocar o modelo, carrega a receita atual (`GET /placas/modelos` já traz `itens` embutido) para o editor de itens, reaproveitando a mesma UI de linhas material+quantidade de `FormPlacaModelo` (adicionar/remover item) → Quantidade avariada → Observação (opcional, texto livre) → Data (padrão hoje).
  - Troca de modelo depois de já ter editado os itens reseta a lista para a receita do novo modelo (comportamento simples, sem merge).
- `AbaResumo`: novo card "Prejuízo com avarias" — total geral e tabela por modelo (mesmo padrão visual dos cards de lucro previsto/real já existentes).

### Fora de escopo (v1)

- Sem relatório/gráfico de avarias por período.
- Edição de avaria não reavisa estoque de novo após salvar (mesmo corte de escopo já aceito para edição de venda).
- Sem motivo/categoria de avaria pré-definida — `observacao` é texto livre.

## Testes

Seguindo o padrão do projeto (`*.test.js` ao lado de cada arquivo, Vitest + Supertest):

- `server/domain/placas.test.js` — `quantidadeConsumidaAvariaMaterial`, `estoqueMaterial` com avarias, `custoItensAvaria` (incluindo material sem lote → `null`).
- `server/routes/placas.test.js` — ativar/desativar material e modelo (e reflexo nos `<select>` não se aplica ao backend, mas o filtro de ativos nas listagens de outras rotas não muda); CRUD de avarias com receita padrão e receita customizada, bloqueio de custo não calculável, aviso de estoque negativo incluindo avarias.
- `web/src/pages/placas/*.test.jsx` — smoke test de `AbaAvarias` e da separação visual ativos/inativos em `AbaMateriais`/`AbaModelos`.
