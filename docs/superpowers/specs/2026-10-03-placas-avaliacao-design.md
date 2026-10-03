# Subsistema "Placas" (placas de avaliação Google) — Design

## Contexto

O Lucca produz e vende placas físicas de avaliação Google (QR + tag NFC), em dois modelos hoje: 10x10 PVC e 10x15 Acrílico reforçado. É um produto à parte do trabalho de desenvolvimento web — às vezes vendido pra clientes já cadastrados no CRM, às vezes pra terceiros avulsos (Instagram/marketplace). Hoje o controle de custo, preço, lucro e materiais é feito numa planilha manual (ver PDF de referência). Este subsistema recria esse controle dentro do CRM Madia.

A planilha de referência mostra: custo de montagem por modelo (placa + adesivo + tag NFC), custo de compra em lote de cada material (kit + frete, com sobra calculada), preço de venda e lucro previsto por unidade, lucro previsto por lote, e uma nota (ainda não implementada na planilha) pedindo comparação entre lucro previsto e lucro real lançando vendas uma a uma.

## Decisões confirmadas com o Lucca

- Compradores: tanto clientes já cadastrados no CRM quanto compradores avulsos (não cadastrados).
- Modelos e materiais são cadastráveis na interface (não fixos no código) — podem crescer além dos 2 modelos atuais.
- Custo unitário de um material = custo do **último lote comprado** daquele material (não é média histórica).
- Vendas dão baixa automática no estoque dos materiais (via receita do modelo); se o estoque ficar negativo, o sistema avisa mas não bloqueia a venda.
- Cada lote de compra é **por material, independente** — produtos e fretes de cada lote são lançados e editáveis separadamente. Nem todo lote inclui todos os materiais (ex: adesivo só é comprado a cada 2-3 lotes de placa); o sistema não exige um lote "completo".

## Modelo de dados

Migration `008_placas.sql`, 5 tabelas novas, seguindo o padrão já usado (`id INTEGER PRIMARY KEY AUTOINCREMENT`, `criado_em`/`atualizado_em` TEXT ISO, valores monetários em `*_centavos` INTEGER):

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

Notas:
- `placas_vendas.custo_unitario_centavos` é um **snapshot** calculado no momento da venda (soma do custo atual de cada material da receita × quantidade da receita). Garante que o lucro real de vendas passadas não muda se o custo de um material mudar depois.
- `comprador_nome` é usado quando a venda não está ligada a um cliente cadastrado (`cliente_id` nulo). Não há exigência de preencher um ou outro no banco — a validação de "pelo menos um dos dois" fica na camada de rotas.
- Exclusão de material/modelo com lotes/vendas vinculados: bloqueada (erro de validação), mesmo padrão de integridade usado hoje (o projeto não usa `ON DELETE CASCADE`).

## Domínio (`server/domain/placas.js`, funções puras testáveis)

- `custoUnitarioLote(lote)` → `(valor_kit_centavos + valor_frete_centavos) / quantidade`, arredondado.
- `custoAtualMaterial(materialId, lotes)` → custo unitário do lote mais recente (maior `data_compra`, desempate por `id`) daquele material; `null` se não há lote.
- `quantidadeConsumida(materialId, vendas, itensModelo)` → soma, por venda, de `item.quantidade * venda.quantidade` para os itens da receita do modelo da venda que usam esse material.
- `estoqueMaterial(materialId, lotes, vendas, itensModelo)` → soma de `quantidade` dos lotes do material − `quantidadeConsumida(...)`.
- `custoReceitaModelo(modeloId, itensModelo, lotesPorMaterial)` → soma de `item.quantidade * custoAtualMaterial(item.material_id, ...)` para os itens do modelo; se algum material da receita não tem lote nenhum, custo é `null` (não calculável ainda) e o retorno sinaliza isso.
- `lucroPrevisto(modelo, custoReceita)` → `preco_venda_centavos - custoReceita` (ou `null` se custo não calculável).
- `lucroRealVenda(venda)` → `(preco_vendido_centavos - custo_unitario_centavos) * quantidade`.
- `resumoLucroReal(vendas)` → agregado por `modelo_id`: quantidade vendida, lucro real total, lucro real médio por unidade.

Essas funções recebem arrays simples (já carregados do banco) e não tocam SQL — mesmo padrão de `financeiro.js`/`painel.js`.

## Rotas (`server/routes/placas.js`, montada em `app.use('/api', rotasPlacas(ctx))`)

CRUD simples via `criarRepo` para `placas_materiais` e `placas_modelos` (+ sub-recurso de itens de receita). Específicas:

- `GET /placas/materiais` → lista materiais com `estoque_atual` e `custo_unitario_atual` calculados (via domínio).
- `POST/PUT/DELETE /placas/materiais[/:id]` — CRUD padrão; `DELETE` bloqueado (`ErroValidacao`) se houver lote ou receita referenciando.
- `GET/POST/PUT/DELETE /placas/lotes[/:id]` — CRUD padrão de lotes (material_id, nome_lote, quantidade, valor_kit_centavos, valor_frete_centavos, data_compra). `GET` aceita filtro opcional `?material_id=`.
- `GET /placas/modelos` → lista modelos com `custo_previsto_centavos` e `lucro_previsto_centavos` calculados (via domínio), e a receita (itens) embutida.
- `POST/PUT /placas/modelos` → salva modelo; corpo aceita `itens: [{material_id, quantidade}]` e substitui a receita inteira numa transação (`emTransacao`, delete+insert dos itens).
- `DELETE /placas/modelos/:id` — bloqueado se houver venda vinculada.
- `GET /placas/vendas` → lista vendas com `lucro_real_centavos` calculado, nome do modelo, e nome do comprador (`cliente_nome` via join ou `comprador_nome`).
- `POST /placas/vendas` → valida `modelo_id`, `quantidade`, `preco_vendido_centavos`, `data_venda`, e exatamente uma origem de comprador (`cliente_id` **ou** `comprador_nome`, não as duas, não nenhuma — senão `ErroValidacao`). Calcula `custo_unitario_centavos` via domínio no momento da criação, grava a venda, e retorna `{ venda, avisos_estoque: [...] }` listando materiais que ficaram com estoque negativo após a venda (sem bloquear).
- `PUT/DELETE /placas/vendas/:id` — edição/remoção simples (não recalcula custo nem reavisa estoque em edição — escopo mínimo).
- `GET /placas/resumo` → agregado pra aba Resumo: por modelo, `lucro_previsto_centavos` atual e `resumoLucroReal`; lista de materiais com estoque atual (destacando negativos).

## Frontend

### Navegação

Novo item na sidebar (`App.jsx`): `{ para: '/placas', rotulo: 'Placas' }`, rota `/placas` → página `Placas.jsx`.

### Página `web/src/pages/Placas.jsx` + `web/src/pages/placas/*`

Mesmo padrão de abas de `Projeto.jsx` (`useState` local, `role="tablist"`):

1. **`AbaResumo`** — cards de lucro previsto por modelo, tabela de lucro real acumulado (total e por modelo, com média por unidade), tabela de estoque atual por material com `etiqueta` de alerta quando `estoque_atual <= 0`.
2. **`AbaMateriais`** — tabela (nome, estoque atual, custo unitário atual) + modal de criar/editar material (`Modal.jsx`, `useFormulario`/`useEnvio`, mesmo padrão de `FormCliente.jsx`).
3. **`AbaLotes`** — formulário de lançar lote (select de material, quantidade, valor kit, valor frete, nome do lote opcional, data de compra) + tabela de lotes existentes, editável/removível, agrupável visualmente por `nome_lote` (soma de valores quando o campo é preenchido).
4. **`AbaModelos`** — tabela (nome, preço de venda, custo previsto, lucro previsto) + modal de criar/editar modelo, incluindo editor de receita (lista de linhas material + quantidade, com botão de adicionar/remover item).
5. **`AbaVendas`** — formulário de lançar venda (select de modelo, quantidade, preço vendido pré-preenchido com o preço padrão do modelo mas editável, campo de comprador com busca de cliente existente — reaproveitando o padrão de busca já usado em `FormQRCode.jsx` — ou nome avulso, data) + tabela de vendas com lucro real por linha. Aviso de estoque insuficiente aparece via `Aviso.jsx` após salvar, se a API retornar `avisos_estoque`.

### Componentes/libs reaproveitados

`Aviso`, `Modal`, `Campo`, `useCarregar`, `useFormulario`, `useEnvio`, `formatarDinheiro`, `formatarData`. Nenhum componente novo além das `Aba*` e formulários específicos.

## Fora de escopo (v1)

- Edição de venda não recalcula custo nem reavisa estoque.
- Sem FIFO/lote específico de consumo — custo é sempre "último lote comprado", não rastreamento de qual lote físico foi usado.
- Sem exportação/relatório em PDF do resumo.
- Sem gestão de impostos/taxas de marketplace no preço de venda.

## Testes

Seguindo o padrão do projeto (`*.test.js` ao lado de cada arquivo, Vitest + Supertest):
- `server/domain/placas.test.js` — funções puras de custo/estoque/lucro, incluindo casos de material sem lote, receita com múltiplos materiais, estoque negativo.
- `server/routes/placas.test.js` — CRUD de materiais/lotes/modelos/vendas, bloqueio de delete com vínculo, validação de comprador (cliente xor nome avulso), aviso de estoque insuficiente sem bloqueio.
- `web/src/pages/placas/*.test.jsx` — smoke tests por aba, seguindo o padrão de `Financeiro.test.jsx`/`Projeto.test.jsx`.
