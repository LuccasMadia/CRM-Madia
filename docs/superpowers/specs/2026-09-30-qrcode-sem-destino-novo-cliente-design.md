# QR Code: remover destino atual + criar cliente na hora — Design

## Contexto

A verificação automática de "QR desatualizado" foi implementada e revertida ([[2026-09-29-qrcode-leitura-status-design]] — decisão registrada na memória do projeto): QR dinâmico do Canva Pro+ codifica um link fixo do `canvaqr.com`, nunca o destino real, então comparar com `destino_atual` nunca fazia sentido.

Com isso, o campo `destino_atual` (e o histórico de mudanças dele) perdeu a razão de existir — quem controla pra onde o QR aponta é o Canva, não o CRM. O Lucca decidiu simplificar: o QR code no CRM vira só um registro (nome, categoria, cliente, local de aplicação) + a imagem de referência do arquivo.

Separadamente, cadastrar um QR code hoje exige que o cliente já exista — igual ao Funil, que já resolve isso com uma opção "+ Novo cliente" dentro do próprio formulário de oportunidade. Replicar esse padrão no QR code.

## Escopo

1. Remover `destino_atual` e `qrcodes_historico` por completo (dado, coluna, tabela, toda a UI relacionada).
2. Adicionar "+ Novo cliente" no formulário de QR code, mesmo padrão do `FormOportunidade`/`routes/projetos.js`.

**Fora de escopo:** qualquer outra mudança no módulo de QR codes.

## Modelo de dados

Nova migration `server/db/migrations/007_qrcodes_sem_destino.sql`:

```sql
DROP TABLE qrcodes_historico;
ALTER TABLE qrcodes DROP COLUMN destino_atual;
```

Isso apaga permanentemente o valor de `destino_atual` de todo QR code existente (hoje só um registro tem valor: "Filinto 1") e todo o histórico de mudança de destino. Decisão explícita do Lucca — sem necessidade de backup/migração de dados.

## Backend

### `server/repos/qrcodes.js`
Remove `destino_atual` de `CAMPOS_QRCODE`. Remove o override de `atualizar` (que só existia pra gravar histórico) e o método `historico()` — o repo passa a usar `criarRepo` puro, sem nada extra:

```js
import { criarRepo } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'imagem_arquivo', 'status'];

export function repoQrcodes(db) {
  const base = criarRepo(db, 'qrcodes', CAMPOS_QRCODE);
  return {
    ...base,
    listar({ cliente_id, status } = {}) {
      const filtro = {};
      if (cliente_id) filtro.cliente_id = Number(cliente_id);
      if (status) filtro.status = status;
      return base.listar(filtro, 'nome COLLATE NOCASE');
    },
  };
}
```

### `server/routes/qrcodes.js`
- Remove `destino_atual` de `REGRAS_QRCODE`.
- `montar(id)` some (virava só `qrcodes.obter(id)` sem o `historico`); os 5 call-sites passam a chamar `qrcodes.obter(id)` diretamente.
- `POST /qrcodes` ganha o mesmo tratamento de `corpo.novo_cliente` que existe em `routes/projetos.js`: importa `REGRAS_CLIENTE` de `./clientes.js` e `emTransacao` de `../repos/crud.js`; se `corpo.novo_cliente` vier no corpo, valida com `REGRAS_CLIENTE` (erros prefixados com `novo_cliente.`), cria cliente + QR code numa transação; senão segue o fluxo atual (`exigirCliente` + `qrcodes.criar`).

## Frontend

### `web/src/components/FormQRCode.jsx`
- Remove o campo "Destino atual".
- Adiciona `novo_cliente_nome` ao estado do formulário; option `"+ Novo cliente"` no select de Cliente; campo condicional "Nome do novo cliente" quando `cliente_id === 'novo'`; no `enviar`, monta `{ novo_cliente: { nome } }` em vez de `cliente_id` quando aplicável — mesma lógica de `FormOportunidade.jsx`.

### `web/src/pages/QRCodeDetalhe.jsx`
Remove o cartão "Histórico de redirecionamento" inteiro (o `grade-2` fica só com Dados + Imagem).

### `web/src/pages/QRCodes.jsx`
Remove a coluna "Destino atual" da tabela (cabeçalho + célula).

## Testes

- `server/repos/qrcodes.js` não tem teste próprio (testado via rotas, como já era).
- `server/routes/qrcodes.test.js`: remove os testes de histórico e de `destino_atual` (obrigatório, geração de histórico, ordenação); remove `destino_atual` dos corpos de `criarQrcode(...)`; adiciona teste `cria QR code junto com um cliente novo` (equivalente ao de `projetos.test.js`) e teste de erro prefixado `novo_cliente.nome`.
- `server/routes/clientes.test.js`: remove `destino_atual` dos dois payloads de criação de QR code usados como fixture (linhas 46 e 74) — não é mais um campo válido.
- `web/src/pages/QRCodeDetalhe.test.jsx`: remove os testes que dependem de `destino_atual`/`historico` (edição de destino, histórico com/sem itens); os demais (dados, exclusão, upload, remoção de imagem) ajustam o fixture `qr` removendo `destino_atual`/`historico`.
- `web/src/pages/QRCodes.test.jsx`: remove a asserção de "Destino atual" da tabela; adiciona teste `cria QR code com cliente novo` (equivalente ao de `Funil.test.jsx`).
