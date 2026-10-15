# Packs de placas e preço de recompra — Design

## Contexto

Hoje cada modelo de placa (`placas_modelos`) tem um preço único (`preco_venda_centavos`), e a linha de serviço "Placas NFC" de uma oportunidade (`projetos_servicos`) guarda `valor_unitario_centavos × quantidade`.

O Lucca montou numa planilha (`Modelos placa NFC.xlsx`) preços de pack por modelo:

| Modelo | 1 un. | Pack 2 | Pack 3 |
|---|---|---|---|
| Placa 10x10 PVC | R$ 80 | R$ 140 | R$ 200 |
| Placa 10x15 Acrílico Reforçado | R$ 100 | R$ 180 | R$ 250 |

E quer oferecer preço de recompra a quem já comprou alguma placa: **o cliente paga como se estivesse continuando o pack**, a partir de quantas placas já comprou no total.

## Regras (decididas com o Lucca)

1. **Preço por posição.** Cada placa tem um preço conforme a posição dela na sequência de compras do cliente: posição *k* = `pack(k) − pack(k−1)`, com `pack(1) = preco_venda_centavos` e `pack(0) = 0`.
2. **Além do maior pack, repete o último degrau.** Posições acima da maior quantidade cadastrada custam o mesmo que a última posição da tabela.
3. **Histórico conta qualquer placa.** "Já comprou" = soma das `quantidade` de todas as `placas_vendas` com aquele `cliente_id`, **de qualquer modelo**. Entram vendas lançadas à mão e vendas geradas por oportunidades entregues.
4. **Soma o histórico inteiro.** Quem já tem *h* placas e compra *n* paga as posições `h+1 … h+n` da tabela do modelo que está comprando.
5. **Venda da própria oportunidade não conta.** No cálculo de uma oportunidade, as vendas ligadas às linhas de serviço dela mesma (`projetos_servicos.venda_id`) são excluídas do histórico, pra que reabrir uma oportunidade entregue não a recalcule como recompra de si mesma.
6. **Modelo sem packs** se comporta como hoje: toda posição custa `preco_venda_centavos`.
7. **Sugestão, não trava.** O preço calculado é só o valor sugerido. O Lucca pode editar o valor da linha à mão.

Degraus resultantes:

| Posição | 10x10 PVC | 10x15 Acrílico |
|---|---|---|
| 1ª | 80 | 100 |
| 2ª | 60 | 80 |
| 3ª | 60 | 70 |
| 4ª+ | 60 | 70 |

Exemplos: cliente novo, 2 placas 10x15 → R$ 180. Cliente com 1 placa (qualquer modelo), 2 placas 10x15 → 80 + 70 = R$ 150. Cliente com 3 placas, 1 placa 10x15 → R$ 70. Cliente novo, 4 placas 10x15 → 250 + 70 = R$ 320.

## Fora de escopo

- Desconto de recompra em Sistemas, SaaS ou Google Meu Negócio.
- Recalcular automaticamente o valor de oportunidades já existentes.
- Validade/expiração do histórico (comprou há 2 anos continua contando).
- Mais de um modelo de placa por oportunidade (continua uma linha de `placas_nfc` por oportunidade, como hoje).
- Mudar a tela de "Registrar venda" avulsa em Placas (o preço lá continua digitado; só a oportunidade ganha sugestão).

## Modelo de dados

### Migration `014_placas_packs.sql`

```sql
CREATE TABLE placas_modelos_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 2),
  preco_total_centavos INTEGER NOT NULL CHECK (preco_total_centavos >= 0),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE (modelo_id, quantidade)
);

ALTER TABLE projetos_servicos ADD COLUMN valor_total_centavos INTEGER CHECK (valor_total_centavos >= 0);
UPDATE projetos_servicos SET valor_total_centavos = valor_unitario_centavos * quantidade WHERE tipo = 'placas_nfc';
```

- O pack de 1 **não** é gravado em `placas_modelos_packs`: ele é sempre `placas_modelos.preco_venda_centavos`.
- `projetos_servicos.valor_total_centavos` é preenchido só nas linhas `placas_nfc` (motivo: 3 placas por R$ 200 não dá valor unitário inteiro em centavos). Nas outras linhas fica `NULL` e o valor continua `valor_unitario_centavos × 1`.
- Nas linhas `placas_nfc`, `valor_unitario_centavos` continua sendo gravado como `round(valor_total / quantidade)`, só pra compatibilidade/exibição.

### Repo `repoPlacasModelosPacks` (em `server/repos/placas.js`)

Mesmo padrão de `repoPlacasModelosItens`: `listar({ modelo_id })` ordenado por `quantidade`, `removerPorModelo(modeloId)`.

## Domínio

### `server/domain/placas.js`

```js
// packs: [{ quantidade, preco_total_centavos }] (sem o pack de 1)
export function precosPorPosicao(modelo, packs) {
  const totais = [{ quantidade: 1, preco_total_centavos: modelo.preco_venda_centavos }, ...packs]
    .sort((a, b) => a.quantidade - b.quantidade);
  // devolve array de degraus: degraus[k-1] = preço da posição k, até a maior quantidade da tabela
}

export function precoPlacas(modelo, packs, jaComprou, quantidade) {
  // soma degraus das posições jaComprou+1 .. jaComprou+quantidade;
  // posição acima da tabela usa o último degrau
}
```

Detalhe dos degraus quando há "buraco" na tabela (ex.: packs de 1 e 3, sem o de 2): a diferença entre dois packs consecutivos cadastrados é dividida igualmente entre as posições do intervalo, arredondando e jogando o resto na última posição do intervalo, de modo que `precoPlacas(modelo, packs, 0, q) === pack(q)` sempre que *q* estiver na tabela.

### `server/domain/servicos.js`

`valorLinhaServico(s)` passa a ser `s.valor_total_centavos ?? s.valor_unitario_centavos * (s.quantidade ?? 1)`.

## Backend

### `server/routes/placas.js`

- `GET /placas/modelos`: cada modelo passa a vir com `packs: [{ quantidade, preco_total_centavos }]`.
- `POST` e `PUT /placas/modelos/:id`: aceitam `packs` opcional no corpo, no mesmo esquema de `itens` (no `PUT`, se vier, substitui todos). Nova `validarPacks`: lista; `quantidade` inteiro ≥ 2; sem quantidade repetida; `preco_total_centavos` inteiro ≥ 0. Erros no formato `packs[i].campo`.
- `DELETE /placas/modelos/:id`: remove os packs junto (além do `ON DELETE CASCADE`, chama `removerPorModelo` como já faz com itens).
- **Novo** `GET /placas/modelos/:id/preco?quantidade=N&cliente_id=X&projeto_id=Y`:
  - `quantidade` obrigatório, inteiro ≥ 1; `cliente_id` e `projeto_id` opcionais.
  - `ja_comprou` = soma de `placas_vendas.quantidade` do cliente, excluindo vendas cujo id aparece em `projetos_servicos.venda_id` do `projeto_id` informado. Sem `cliente_id`, é `0`.
  - Resposta: `{ total_centavos, ja_comprou, recompra: ja_comprou > 0, preco_por_placa_centavos: [..] }` (o array lista o preço de cada placa da compra, pra UI montar a etiqueta).
  - 404 se o modelo não existe.

### `server/routes/projetos.js`

Em `validarServicos`, linha `placas_nfc`:
- Aceita `valor_total_centavos` (inteiro ≥ 0). Se não vier mas vier `valor_unitario_centavos`, usa `valor_unitario × quantidade` (compatibilidade com clientes antigos da API). Se nenhum vier, calcula com `precoPlacas` usando o histórico do cliente da oportunidade (mesma regra do endpoint, excluindo as vendas da própria oportunidade no `PUT`).
- Grava `valor_total_centavos` e `valor_unitario_centavos = round(total / quantidade)`.

A lógica de "quantas placas o cliente já comprou" fica numa função única (ex.: `placasCompradasPeloCliente(db, clienteId, { excluirProjetoId })`) usada pelo endpoint de preço e por `validarServicos`.

Na entrega (`etapa → entregue`), a venda criada em `placas_vendas` usa `preco_vendido_centavos = round(valor_total_centavos / quantidade)`. Consequência aceita: o relatório de lucro de placas pode diferir do valor da oportunidade em poucos centavos (ex.: 3 × R$ 66,67 = R$ 200,01).

`GET /projetos/:id` passa a incluir `valor_total_centavos` em cada serviço.

## Frontend

### `web/src/components/FormPlacaModelo.jsx`

- Novo fieldset **"Packs"** abaixo do preço de venda, mesmo estilo da receita: linhas *Quantidade* + *Preço total do pack (R$)* + "Remover", botão "+ Pack".
- Prévia somente leitura dos degraus, calculada no próprio componente a partir do preço de venda e dos packs digitados: `1ª: R$ 80 · 2ª: R$ 60 · 3ª em diante: R$ 60`.
- Aviso (não bloqueante) quando um pack sai mais caro por placa que o anterior.
- Envia `packs` no corpo.

### `web/src/pages/placas/AbaModelos.jsx`

Nova coluna "Packs" com resumo (`2 = R$ 140 · 3 = R$ 200`, ou `—`).

### `web/src/components/CamposServicos.jsx`

- Novas props `clienteId` (número, `null` para cliente novo/não escolhido) e `projetoId` (só na edição).
- Linha `placas_nfc`: o campo de valor passa a ser o **valor total da linha** (rótulo "Valor total das placas"). Saída da linha: `{ tipo, modelo_id, quantidade, valor_total_centavos }`.
- Ao mudar modelo, quantidade ou `clienteId`, chama `GET /placas/modelos/:id/preco` e preenche o valor com `total_centavos` — **a não ser que o Lucca tenha editado o valor à mão**; nesse caso mostra o link "usar preço sugerido (R$ X)", que volta ao valor calculado e ao modo automático.
- Etiqueta abaixo da linha quando `recompra`: `Cliente já comprou 3 placas — preço de recompra`. Sem recompra e com quantidade ≥ 2: `Preço de pack`.
- Ao carregar uma oportunidade existente, a linha começa em modo "editado à mão" (mantém o valor salvo; não recalcula sozinha).
- Subtotal usa o total da linha de placas direto (sem multiplicar pela quantidade).

### `FormOportunidade.jsx` e `projeto/AbaGeral.jsx`

Passam `clienteId` (o selecionado; `null` se "+ Novo cliente" ou vazio) e, na `AbaGeral`, `projetoId` pro `CamposServicos`.

## Testes

- `server/domain/placas.test.js`: `precoPlacas` para cliente novo (1, 2, 3, 4 placas, batendo com os packs), recompra (h=1, n=2 → 150 na 10x15; h=3, n=1 → 70), modelo sem packs, tabela com buraco (1 e 3) mantendo `pack(3)` exato.
- `server/domain/servicos.test.js`: `valorLinhaServico` usa `valor_total_centavos` quando existe.
- `server/routes/placas.test.js`: CRUD de packs (criar, substituir no PUT, validação de quantidade < 2 e repetida, remoção junto com o modelo); `GET /placas/modelos/:id/preco` soma vendas de qualquer modelo do cliente, ignora vendas de outros clientes, ignora as vendas do `projeto_id` informado, 404 para modelo inexistente.
- `server/routes/projetos.test.js`: criar oportunidade com placas sem valor usa o preço de recompra do cliente; com `valor_total_centavos` explícito respeita o valor; valor da oportunidade usa o total da linha; entregar 3 placas por R$ 200 cria venda com preço unitário 6667.
- Migration: linha `placas_nfc` existente ganha `valor_total_centavos = unitário × quantidade`.
- `web/src/components/FormPlacaModelo.test.jsx` (novo): adicionar/remover pack, prévia dos degraus, envio de `packs`.
- `web/src/components/CamposServicos.test.jsx`: preenche sugerido ao trocar quantidade/cliente; mostra etiqueta de recompra; valor editado à mão não é sobrescrito e o link "usar preço sugerido" restaura; saída manda `valor_total_centavos`.

## Operação

Depois do merge: `pm2 restart crm-madia-api` (sem watch) pra migration e rotas novas valerem, e cadastrar os packs dos dois modelos na tela de Modelos.
