# Código Pix copia-e-cola por cliente — Design

## Contexto

O Lucca já tem, fora do CRM, um QR code dinâmico e uma tag NFC prontos para cada cliente (negócio local atendido). Ele quer gerar, para cada cliente, o código Pix "copia e cola" (BR Code/EMV, padrão Banco Central) usando a chave Pix do próprio cliente, **sem valor fixo** — o app do banco do cliente final pergunta o valor na hora de pagar, igual a qualquer QR de doação/cobrança livre. Não há necessidade de página pública, hospedagem nova, nem confirmação automática de pagamento (o cliente confere no extrato do banco dele). O código gerado é só colado manualmente no QR dinâmico e na NFC que já existem fora do CRM.

Decisões já tomadas com o Lucca:
- Reaproveitar o cadastro de cliente já existente (sem criar entidade nova) — qualquer cliente pode ter uma chave Pix.
- Implementação do BR Code na mão, sem dependência nova (o formato é documentado e estável pelo Banco Central), seguindo o estilo de `server/domain/slug.js`.
- Sem página pública, sem QR renderizado pelo CRM, sem rastreio de pagamento — só o texto do código.

## Escopo

1. Campos de chave Pix no cadastro de cliente.
2. Função pura que gera o BR Code a partir desses campos.
3. Expor o código gerado no `GET /clientes/:id` e mostrá-lo na ficha do cliente com botão de copiar.

**Fora de escopo:** página pública, geração de imagem de QR, confirmação/rastreio de pagamento, validação de formato da chave por tipo (CPF/CNPJ/etc.) além de presença.

## Modelo de dados

Nova migration `server/db/migrations/011_clientes_pix.sql`:

```sql
ALTER TABLE clientes ADD COLUMN chave_pix TEXT;
ALTER TABLE clientes ADD COLUMN tipo_chave_pix TEXT CHECK (tipo_chave_pix IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));
ALTER TABLE clientes ADD COLUMN cidade TEXT;
```

Todos opcionais — um cliente sem Pix configurado simplesmente não preenche esses campos. O "nome do recebedor" do código Pix reaproveita `empresa` (ou `nome`, se `empresa` estiver vazio); não há coluna nova para isso.

## Backend

### `server/domain/pix.js` (novo)

Função pura `gerarCodigoPix({ chave, nomeRecebedor, cidade })` que monta o payload BR Code Pix estático, sem campo de valor:

- `00` Payload Format Indicator = `01`
- `01` Point of Initiation Method = `11` (estático/reutilizável)
- `26` Merchant Account Information: subcampo `00` = `br.gov.bcb.pix`, subcampo `01` = `chave`
- `52` Merchant Category Code = `0000`
- `53` Transaction Currency = `986` (BRL)
- (sem campo `54` — valor livre, perguntado pelo app do banco)
- `58` Country Code = `BR`
- `59` Merchant Name = `nomeRecebedor` sanitizado (sem acento, maiúsculo, só `A-Z0-9 `, cortado em 25 chars)
- `60` Merchant City = `cidade` sanitizada do mesmo jeito, cortada em 15 chars
- `62` Additional Data Field: subcampo `05` (Reference Label) = `***` (sem txid específico)
- `63` CRC16 (CRC-16/CCITT-FALSE: poly `0x1021`, init `0xFFFF`, sem reflect) dos campos anteriores + `6304`, 4 dígitos hex maiúsculos

Helpers internos: `campo(id, valor)` monta `id + tamanho(2 dígitos) + valor`; `sanitizar(texto, tamanhoMax)` remove acentos (`normalize('NFD')` + strip de combining marks), maiusculiza, remove tudo que não for `A-Z0-9` ou espaço, e corta no tamanho máximo; `crc16(payload)` implementa o CRC-16/CCITT-FALSE bit a bit.

### `server/repos/clientes.js`

Adiciona `chave_pix`, `tipo_chave_pix`, `cidade` a `CAMPOS_CLIENTE`.

### `server/routes/clientes.js`

- `REGRAS_CLIENTE` ganha:
  ```js
  chave_pix: { tipo: 'texto' },
  tipo_chave_pix: { tipo: 'enum', valores: ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] },
  cidade: { tipo: 'texto' },
  ```
- Nova função `exigirPixCompleto(dados, atual)`: se a chave Pix (nova ou já salva) estiver presente mas faltar tipo ou cidade (novos ou já salvos), lança `ErroValidacao([{ campo: 'chave_pix', mensagem: 'Informe tipo de chave e cidade' }])`. Chamada em `POST /` (com `atual = {}`) e em `PUT /:id` (com `atual` = registro atual, buscado antes de validar — o handler do PUT passa a chamar `clientes.obter(id)` primeiro e usar o resultado tanto para o 404 quanto para essa checagem).
- `GET /:id` ganha `pix_copia_cola` no retorno:
  ```js
  pix_copia_cola: cliente.chave_pix
    ? gerarCodigoPix({ chave: cliente.chave_pix, nomeRecebedor: cliente.empresa || cliente.nome, cidade: cliente.cidade })
    : null,
  ```
  Import de `gerarCodigoPix` de `../domain/pix.js`. O código é sempre calculado on-the-fly a partir dos campos salvos — nunca fica armazenado, então uma edição na chave já reflete no próximo `GET` sem passo extra.

## Frontend

### `web/src/lib/rotulos.js`
Adiciona `TIPOS_CHAVE_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']` e `ROTULO_TIPO_CHAVE_PIX` (`cpf` → "CPF", `cnpj` → "CNPJ", `email` → "E-mail", `telefone` → "Telefone", `aleatoria` → "Aleatória"), mesmo padrão de `ROTULO_CATEGORIA_QR`.

### `web/src/components/FormCliente.jsx`
- `VAZIO` ganha `chave_pix: ''`, `tipo_chave_pix: ''`, `cidade: ''`.
- Novos campos no formulário, após "Notas": select de "Tipo de chave Pix" (`TIPOS_CHAVE_PIX`/`ROTULO_TIPO_CHAVE_PIX`, com opção vazia "Selecione…"), texto "Chave Pix", texto "Cidade" — mesmo padrão de `Campo` usado nos demais campos.

### `web/src/pages/ClienteDetalhe.jsx`
Novo cartão "Pix" na grade (ao lado de Projetos/QR Codes):
- Se `cliente.pix_copia_cola`: mostra o código num `<textarea readOnly>` (ou `<input readOnly>`) e um botão "Copiar" que usa `navigator.clipboard.writeText(cliente.pix_copia_cola)`, com feedback simples (ex.: trocar o texto do botão para "Copiado!" por 2s).
- Se não: `<p className="vazio">Preencha a chave Pix no formulário para gerar o código.</p>`.

## Testes

- `server/domain/pix.test.js` (novo):
  - CRC16 isolado: vetor de teste padrão da literatura de CRC — `CRC-16/CCITT-FALSE` de `"123456789"` (ASCII) deve dar `0x29B1`, confirmando a implementação do `crc16()` independente do formato Pix.
  - `gerarCodigoPix` com chave/nome/cidade simples: resultado começa com `000201`, contém `br.gov.bcb.pix` e a chave informada, e os 4 últimos caracteres são iguais ao `crc16()` do restante do payload (checagem de autoconsistência, usando a própria função já validada acima como oráculo).
  - Sanitização: nome/cidade com acento e minúsculas (ex.: `"Pousada Açaí"`) saem sem acento e em maiúsculas (`"POUSADA ACAI"`); nome/cidade maiores que 25/15 caracteres são cortados nesse tamanho.
- `server/routes/clientes.test.js`: casos novos — criar/atualizar cliente com chave Pix completa (tipo+chave+cidade) retorna `pix_copia_cola` preenchido no `GET`; cliente sem chave Pix retorna `pix_copia_cola: null`; enviar só `chave_pix` sem `tipo_chave_pix`/`cidade` (criação ou atualização) retorna erro de validação no campo `chave_pix`.
- `web/src/pages/ClienteDetalhe.test.jsx`: cartão "Pix" mostra o código e o botão "Copiar" quando `pix_copia_cola` vem preenchido; mostra o aviso de "vazio" quando vem `null`.
