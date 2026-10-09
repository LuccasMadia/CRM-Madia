# Serviços por oportunidade — Design

## Contexto

Hoje, ao criar uma oportunidade no Funil (`FormOportunidade.jsx`), o valor é digitado à mão num campo livre. O Lucca quer classificar cada oportunidade pelos serviços que ela envolve — hoje: **Placas NFC**, **Sistemas**, **SaaS**, **Google Meu Negócio** — podendo marcar um ou mais por oportunidade, e quer que o valor da oportunidade seja calculado automaticamente a partir do(s) serviço(s) escolhido(s), com desconto por cima.

O sistema já tem um módulo completo de estoque/vendas de Placas NFC (`server/domain/placas.js`, `server/routes/placas.js`, tabelas `placas_materiais/lotes/modelos/modelos_itens/vendas/avarias`), com cálculo de custo por receita de materiais e lucro real por venda. A decisão tomada com o Lucca foi que marcar o serviço "Placas NFC" numa oportunidade **integra com esse módulo de verdade** — ao entregar a oportunidade, uma venda é criada lá — em vez de ser só uma etiqueta solta.

## Escopo

1. Nova tabela `projetos_servicos`, ligando cada oportunidade a 0, 1 ou vários serviços.
2. Cálculo automático do valor da oportunidade a partir da soma dos serviços, menos desconto.
3. Ao entregar uma oportunidade com serviço "Placas NFC", criar a venda correspondente em `placas_vendas` (reaproveitando o cálculo de custo já existente).
4. Config de preço padrão pros serviços sem tabela de preço própria (Sistemas, SaaS, Google Meu Negócio).
5. UI: bloco de seleção de serviços no formulário de criar oportunidade e na aba "Visão geral" de editar oportunidade.

**Fora de escopo:**
- Catálogo de tipos de serviço gerenciável pela UI — os 4 tipos ficam fixos no código por enquanto; um 5º tipo exige código novo.
- Qualquer mudança no módulo de Placas em si (`routes/placas.js`, `domain/placas.js`) além de reaproveitar o cálculo de custo já existente.
- Desfazer automaticamente a venda de placas se a etapa for revertida depois de "Entregue".
- Parcelas/cobrança — `valor_total_centavos` continua sendo só o valor de referência da oportunidade, sem ligação automática com parcelas (como já é hoje).

## Modelo de dados

### Nova migration `013_projetos_servicos.sql`

```sql
CREATE TABLE projetos_servicos (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('placas_nfc', 'sistemas', 'saas', 'google_meu_negocio')),
  modelo_id INTEGER REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  valor_unitario_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_unitario_centavos >= 0),
  venda_id INTEGER REFERENCES placas_vendas(id),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_projetos_servicos_projeto ON projetos_servicos(projeto_id);

ALTER TABLE projetos ADD COLUMN desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0);
```

- `modelo_id` só é preenchido quando `tipo = 'placas_nfc'`; `NULL` nos outros três.
- `quantidade` só varia pra `placas_nfc`; pros outros três fica sempre `1` (não exposto na UI).
- `venda_id` começa `NULL` e é preenchido quando a venda em `placas_vendas` é criada (ver seção "Entrega e venda de placas"). Só se aplica a `placas_nfc`.

### Config (reaproveitando a tabela `config` existente, chave/valor)

Três novas chaves, valor em centavos como string (mesmo padrão de `portfolio_repo_path` etc.):
- `preco_servico_sistemas_centavos`
- `preco_servico_saas_centavos`
- `preco_servico_google_meu_negocio_centavos`

Sem valor configurado, o padrão é `0` (o Lucca edita a linha do serviço na hora, se não tiver configurado ainda).

## Cálculo do valor da oportunidade

`valor_total_centavos = soma(valor_unitario_centavos × quantidade, por linha de projetos_servicos) − desconto_centavos` (nunca menor que zero — se o desconto for maior que a soma, o total fica `0`).

**Esse cálculo só se aplica quando a oportunidade tem pelo menos um serviço.** Sem nenhum serviço, `valor_total_centavos` continua sendo um campo digitado à mão, exatamente como funciona hoje (mantém compatibilidade com oportunidades fictícias e casos simples que não usam o fluxo de serviços).

O backend é a fonte da verdade desse cálculo: ao criar/atualizar uma oportunidade com `servicos` no corpo da requisição, o `valor_total_centavos` enviado pelo cliente é ignorado e recalculado a partir dos serviços e do desconto. Sem `servicos` no corpo, o comportamento atual (valor manual) é preservado.

## Backend

### `server/domain/servicos.js` (novo)

```js
export const TIPOS_SERVICO = ['placas_nfc', 'sistemas', 'saas', 'google_meu_negocio'];

export function valorLinhaServico(servico) {
  return servico.valor_unitario_centavos * servico.quantidade;
}

export function calcularValorTotal(servicos, descontoCentavos) {
  const soma = servicos.reduce((total, s) => total + valorLinhaServico(s), 0);
  return Math.max(0, soma - descontoCentavos);
}
```

### `server/repos/servicos.js` (novo)

```js
import { criarRepo } from './crud.js';

export const CAMPOS_SERVICO = ['projeto_id', 'tipo', 'modelo_id', 'quantidade', 'valor_unitario_centavos', 'venda_id'];

export function repoProjetosServicos(db) {
  const base = criarRepo(db, 'projetos_servicos', CAMPOS_SERVICO);
  return {
    ...base,
    listar(projetoId) {
      return base.listar({ projeto_id: projetoId }, 'id');
    },
    removerPorProjeto(projetoId) {
      db.prepare('DELETE FROM projetos_servicos WHERE projeto_id = ?').run(projetoId);
    },
  };
}
```

(Segue o mesmo padrão de `repoPlacasModelosItens`/`removerPorModelo`.)

### `server/routes/projetos.js`

Nas rotas `POST /` e `PUT /:id`, aceitar `servicos` opcional no corpo: `[{ tipo, modelo_id?, quantidade?, valor_unitario_centavos? }]`.

**Validação de cada linha** (nova função `validarServicos` em `routes/projetos.js`, no mesmo estilo de `validarItens` em `routes/placas.js`):
- `tipo` obrigatório, um de `TIPOS_SERVICO`.
- Se `tipo === 'placas_nfc'`: `modelo_id` obrigatório e deve existir em `placas_modelos`; `quantidade` obrigatório, inteiro ≥ 1. Se `valor_unitario_centavos` não vier, usa `modelo.preco_venda_centavos`.
- Se `tipo !== 'placas_nfc'`: `modelo_id` deve ser omitido; `quantidade` fica fixo em `1` (ignora se vier algo diferente). Se `valor_unitario_centavos` não vier, usa o valor configurado pra aquele tipo (`obterConfig(db, 'preco_servico_' + tipo + '_centavos')`, `0` se não configurado).

**Criar (`POST /`)**: dentro da mesma transação que já existe pra criar cliente novo (ou numa transação nova, se não houver cliente novo), depois de criar o projeto:
1. Validar e criar uma linha em `projetos_servicos` por serviço.
2. Se havia `servicos` no corpo, recalcular `valor_total_centavos` com `calcularValorTotal` e `desconto_centavos` do corpo (`0` se omitido), e atualizar o projeto com esse valor.

**Atualizar (`PUT /:id`)**: se `servicos` vier no corpo:
1. Remove todas as linhas antigas de `projetos_servicos` daquele projeto que **ainda não têm `venda_id`** (serviços de placas já entregues/vendidos não são tocados — editar serviços depois da entrega não desfaz a venda já criada; o Lucca ajusta direto na tela de Placas se precisar).
2. Cria as novas linhas enviadas.
3. Recalcula `valor_total_centavos` (soma de **todas** as linhas atuais, incluindo as antigas com `venda_id` que foram preservadas, menos `desconto_centavos`).

Se `servicos` não vier no corpo do `PUT`, nada muda em `projetos_servicos` (comportamento de hoje, só atualiza os campos enviados).

**Detalhe (`GET /:id` e `GET /`)**: a resposta do projeto passa a incluir `servicos: [...]` (array de `projetos_servicos`, com `modelo_nome` resolvido quando `tipo = placas_nfc`) e `desconto_centavos`.

### Entrega e venda de placas

No `PUT /:id`, quando a mudança faz a etapa transicionar **para** `'entregue'` (ou seja, `atual.etapa !== 'entregue' && dados.etapa === 'entregue'`, mesma condição que já dispara o preenchimento de `data_entrega` em `aplicarRegrasProjeto`):

1. Busca as linhas de `projetos_servicos` do projeto com `tipo = 'placas_nfc'` e `venda_id IS NULL`.
2. Para cada uma, tenta criar a venda em `placas_vendas` reaproveitando a mesma lógica de custo que `POST /placas/vendas` já usa: busca os itens da receita do modelo (`itensModelo.listar({ modelo_id })`); se não houver receita, **bloqueia a atualização** com `ErroValidacao` (`"Modelo de placa sem receita cadastrada, não é possível registrar a venda"`) — a etapa não muda até isso ser corrigido; se algum material da receita não tiver lote comprado, mesmo erro que `POST /placas/vendas` já dá.
3. Cria a venda com `modelo_id`, `quantidade`, `preco_vendido_centavos = valor_unitario_centavos` (da linha de serviço), `custo_unitario_centavos` calculado, `cliente_id = projeto.cliente_id`, `data_venda = hoje()`.
4. Grava o `id` da venda criada em `projetos_servicos.venda_id` daquela linha.

Isso roda dentro de uma transação junto com a atualização do projeto — se a criação da venda falhar, a mudança de etapa também não é salva.

Essa lógica de custo é extraída de `routes/placas.js` pra uma função reaproveitável `calcularCustoUnitarioModelo(modeloId, itensModelo, lotes)` em `server/domain/placas.js`, usada tanto por `POST /placas/vendas` quanto por essa rota, evitando duplicar o cálculo.

### `server/routes/publicacao.js`

Três novos campos opcionais no `PUT /config` existente, mesmo padrão de `portfolio_repo_path`: `preco_servico_sistemas_centavos`, `preco_servico_saas_centavos`, `preco_servico_google_meu_negocio_centavos` (inteiros ≥ 0). `GET /config` passa a devolver os três também.

## Frontend

### `web/src/lib/rotulos.js`

```js
export const ROTULO_TIPO_SERVICO = {
  placas_nfc: 'Placas NFC',
  sistemas: 'Sistemas',
  saas: 'SaaS',
  google_meu_negocio: 'Google Meu Negócio',
};
export const TIPOS_SERVICO = Object.keys(ROTULO_TIPO_SERVICO);
```

### `web/src/components/CamposServicos.jsx` (novo, compartilhado)

Componente controlado: recebe `servicos` (array), `desconto`, `modelos` (lista de `placas_modelos` ativos, carregada via `api('/placas/modelos')`), `precosPadrao` (do `GET /config`), e `onChange`.

- Lista os 4 tipos como checkboxes. Marcar um adiciona uma linha em `servicos` com valor pré-preenchido (preço do primeiro modelo ativo × 1, ou preço padrão configurado); desmarcar remove a linha.
- Linha de `placas_nfc`: `<select>` de modelo (atualiza `valor_unitario_centavos` pro preço do modelo escolhido, a não ser que o Lucca já tenha editado manualmente) + campo de quantidade + campo de valor unitário (editável).
- Linha dos outros três: só o campo de valor (editável), sem quantidade visível.
- Embaixo: subtotal (soma calculada no próprio componente, só exibição), campo "Desconto (R$)", e total calculado (`subtotal − desconto`, nunca negativo) — exibido como texto, não input.

### `web/src/components/FormOportunidade.jsx`

Troca o campo livre "Valor (R$)" por `<CamposServicos>` quando pelo menos um serviço está marcado; se nenhum serviço estiver marcado, mantém o campo "Valor (R$)" livre de hoje (os dois modos são mutuamente exclusivos — ter serviço marcado esconde o campo manual, e vice-versa). Envia `servicos` e `desconto_centavos` no corpo do `POST /projetos` quando há serviços; do contrário, envia só `valor_total_centavos` como hoje.

### `web/src/pages/projeto/AbaGeral.jsx`

Mesma troca condicional de `CamposServicos` no lugar do campo "Valor (R$)", carregando os `servicos`/`desconto_centavos` existentes do `projeto` recebido.

### `web/src/pages/Config.jsx`

Nova seção "Preços padrão de serviços" com os três campos (`preco_servico_sistemas_centavos` etc.), mesmo padrão dos campos de `Repositorio`.

## Testes

- `server/domain/servicos.test.js`: `calcularValorTotal` soma linhas, aplica desconto, nunca fica negativo.
- `server/routes/projetos.test.js`: criar oportunidade com 1 serviço de placas calcula valor a partir do modelo; criar com 2 serviços (placas + saas) soma os dois; desconto reduz o total; sem serviços mantém o comportamento atual de valor manual; atualizar oportunidade trocando os serviços recalcula o total; mudar etapa pra "entregue" com serviço de placas cria a venda em `placas_vendas` com `cliente_id` do projeto e marca `venda_id` na linha; mudar etapa pra "entregue" de novo (idempotência) não duplica a venda; modelo sem receita bloqueia a transição para "entregue" com erro claro.
- `server/routes/publicacao.test.js` (ou `config.test.js`, onde já mora `/config`): salvar e devolver os três preços padrão de serviço.
- `web/src/components/CamposServicos.test.jsx` (novo): marcar/desmarcar serviço adiciona/remove linha; trocar modelo de placas atualiza o valor sugerido; subtotal/desconto/total calculam certo na tela.
- `web/src/components/FormOportunidade.test.jsx` e `web/src/pages/projeto/Projeto.test.jsx`: alternância entre campo de valor manual e bloco de serviços.
