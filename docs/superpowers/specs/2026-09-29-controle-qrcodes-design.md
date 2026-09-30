# Controle de QR Codes (Canva) — Design

## Contexto

O Lucca ia construir um redirecionador de QR codes próprio (domínio próprio, geração de SVG, banco de dados) num outro repo (Portfólio) para adesivos pré-impressos com "ativação tardia" — o QR já vem impresso e o destino é definido/trocado depois. Essa implementação (19 tarefas, TDD) foi **concluída, mas o escopo mudou antes do merge**: ele assinou o Canva Pro+, que já oferece QR codes dinâmicos prontos — o destino de um QR impresso pode ser trocado a qualquer momento pela própria interface do Canva, sem reimprimir, e com uma tela de Insights (scans, localização, dispositivo).

A Canva Connect API (pública) não expõe nenhum endpoint de QR code ou de Insights — isso foi verificado diretamente na documentação (`canva.dev/docs/connect`) e na especificação OpenAPI pública. Não há como puxar esses dados automaticamente para o CRM.

Por isso, o trabalho do repo Portfólio é **abandonado** (não finalizar, não fazer merge), e o que resta é dar ao Lucca um lugar dentro do **CRM-Madia** para registrar manualmente, por cliente, quais QR codes existem, para onde cada um aponta hoje, e o histórico de quando esse destino mudou.

## Escopo

Módulo novo e independente ("QR Codes") dentro do CRM-Madia:

- Cadastro de QR codes, cada um ligado a um **cliente** (obrigatório).
- Campo de categoria (tipo de aplicação física: adesivo, cardápio, panfleto, embalagem, outro) + descrição livre do local.
- Campo de destino atual (o link para onde o QR aponta hoje no Canva) — editável.
- Toda vez que o destino atual muda, o CRM grava automaticamente uma linha de histórico (destino anterior → novo, com data/hora). Nenhum outro campo gera histórico.
- Status `ativo`/`arquivado`, para tirar um QR de uso sem apagar o registro nem o histórico.
- Upload de um arquivo (PNG ou PDF) por QR code — o material de referência do próprio código (ex: export do Canva) — substituível e removível.
- Lista independente (`/qrcodes`), filtrável por cliente e status.
- Um cartão "QR Codes" na tela de detalhe do cliente, listando os QR codes daquele cliente.

**Fora de escopo:**
- Qualquer integração automática com o Canva (API não permite).
- Vínculo com projeto (só cliente).
- Histórico de mudanças em campos além do destino (nome, categoria, etc. não geram histórico).
- Geração de QR code em si — o CRM só registra e controla, quem gera é o Canva.

## Modelo de dados

Nova migration `server/db/migrations/005_qrcodes.sql`, mesmo padrão das anteriores:

```sql
CREATE TABLE qrcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro')),
  descricao_local TEXT,
  destino_atual TEXT NOT NULL,
  imagem_arquivo TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE qrcodes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qrcode_id INTEGER NOT NULL REFERENCES qrcodes(id),
  destino_anterior TEXT,
  destino_novo TEXT NOT NULL,
  alterado_em TEXT NOT NULL
);
```

`imagem_arquivo` guarda só o nome do arquivo salvo em `data/uploads/` (mesmo esquema de `portfolio_imagens.arquivo`), servido via `/uploads/<arquivo>`. `null` quando não há arquivo.

## Backend

### `server/http/upload.js`
Generalizar `criarUpload` para aceitar um mapa de extensões customizado, mantendo o comportamento atual como padrão (usado hoje só por `portfolio.js`, com PNG/JPG/WEBP):

```js
const EXTENSOES_IMAGEM = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

export function criarUpload(dataDir, extensoes = EXTENSOES_IMAGEM) {
  const destino = path.join(dataDir, 'uploads');
  mkdirSync(destino, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: destino,
      filename: (req, arquivo, cb) => cb(null, randomUUID() + extensoes[arquivo.mimetype]),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 20 },
    fileFilter: (req, arquivo, cb) =>
      extensoes[arquivo.mimetype]
        ? cb(null, true)
        : cb(new ErroHttp(400, `Formato não suportado: ${arquivo.originalname}`)),
  });
}
```

`portfolio.js` continua chamando `criarUpload(dataDir)` sem mudanças. `qrcodes.js` chama `criarUpload(dataDir, { 'image/png': '.png', 'application/pdf': '.pdf' })`.

### `server/repos/qrcodes.js` (novo)
```js
import { criarRepo, linha } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'destino_atual', 'imagem_arquivo', 'status'];

export function repoQrcodes(db) {
  const base = criarRepo(db, 'qrcodes', CAMPOS_QRCODE);
  return {
    ...base,
    listar({ cliente_id, status } = {}) {
      const filtro = {};
      if (cliente_id) filtro.cliente_id = cliente_id;
      if (status) filtro.status = status;
      return base.listar(filtro, 'nome COLLATE NOCASE');
    },
    historico(qrcodeId) {
      return db
        .prepare('SELECT * FROM qrcodes_historico WHERE qrcode_id = ? ORDER BY alterado_em DESC, id DESC')
        .all(qrcodeId)
        .map(linha);
    },
    atualizar(id, dados) {
      const atual = base.obter(id);
      if (!atual) return null;
      const registrarHistorico = 'destino_atual' in dados && dados.destino_atual !== atual.destino_atual;
      const atualizado = base.atualizar(id, dados);
      if (registrarHistorico) {
        db.prepare(
          'INSERT INTO qrcodes_historico (qrcode_id, destino_anterior, destino_novo, alterado_em) VALUES (?, ?, ?, ?)',
        ).run(id, atual.destino_atual, dados.destino_atual, new Date().toISOString());
      }
      return atualizado;
    },
  };
}
```

(Sobrescrever `atualizar` do `base` em vez de usar `emTransacao` isolado — como é SQLite síncrono via `node:sqlite`, as duas escritas já são efetivamente atômicas dentro da mesma chamada de rota; não há `await` entre elas.)

### `server/routes/qrcodes.js` (novo)
Mesmo padrão de `clientes.js`:

```js
export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: ['adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro'], obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  destino_atual: { tipo: 'texto', obrigatorio: true },
  status: { tipo: 'enum', valores: ['ativo', 'arquivado'], padrao: 'ativo' },
};
```

Rotas:
- `GET /api/qrcodes?cliente_id=&status=` → `qrcodes.listar(...)`.
- `POST /api/qrcodes` → valida com `REGRAS_QRCODE`, cria; checa que `cliente_id` existe (`clientes.obter`), senão `ErroHttp(400, 'Cliente não encontrado')`.
- `GET /api/qrcodes/:id` → detalhe + `historico: qrcodes.historico(id)`.
- `PUT /api/qrcodes/:id` → valida parcial, `qrcodes.atualizar(...)`; mesma checagem de `cliente_id` se ele vier no corpo.
- `POST /api/qrcodes/:id/imagem`, `upload.single('imagem')` → se já existia `imagem_arquivo`, `rmSync` do antigo; salva `req.file.filename`; `ErroHttp(400, 'Nenhum arquivo enviado')` se faltar.
- `DELETE /api/qrcodes/:id/imagem` → `rmSync` do arquivo atual (se houver) + `atualizar(id, { imagem_arquivo: null })`.
- `DELETE /api/qrcodes/:id` → `rmSync` do arquivo (se houver) + `remover(id)`; `naoEncontrado('QR code')` se não existir.

Registrar em `server/app.js`: `import { rotasQrcodes } from './routes/qrcodes.js'` e `app.use('/api', rotasQrcodes(ctx))`.

### `server/repos/clientes.js`
`server/db/connection.js` já roda `PRAGMA foreign_keys = ON`, então excluir um cliente com QR codes vinculados falharia na constraint (erro solto, sem mensagem amigável). Mesmo tratamento já dado a `projetos`: novo método `contarQrcodes(id)` em `repoClientes` (`SELECT COUNT(*) AS n FROM qrcodes WHERE cliente_id = ?`), e `server/routes/clientes.js` passa a checar os dois antes de excluir:

```js
r.delete('/:id', (req, res) => {
  const id = lerId(req.params.id);
  if (clientes.contarProjetos(id) > 0) {
    throw new ErroHttp(409, 'Este cliente tem projetos. Exclua ou mova os projetos antes de excluir o cliente.');
  }
  if (clientes.contarQrcodes(id) > 0) {
    throw new ErroHttp(409, 'Este cliente tem QR codes. Exclua-os antes de excluir o cliente.');
  }
  if (!clientes.remover(id)) throw naoEncontrado('Cliente');
  res.status(204).end();
});
```

## Frontend

### `web/src/App.jsx`
Novo item de nav + rotas:
```jsx
<Route path="/qrcodes" element={<QRCodes />} />
<Route path="/qrcodes/:id" element={<QRCodeDetalhe />} />
```

### `web/src/lib/rotulos.js`
Novos mapas `ROTULO_CATEGORIA_QR` e `ROTULO_STATUS_QR` (mesmo padrão de `ROTULO_ETAPA`).

### `web/src/pages/QRCodes.jsx` (novo, espelha `Clientes.jsx`)
- `useCarregar(() => api('/qrcodes?...'), [filtros])`.
- Filtros: select de cliente (`api('/clientes')` carregado uma vez), select de status.
- Tabela: nome, cliente, categoria, destino atual, status.
- Botão "+ QR Code" abre `Modal` com `FormQRCode`; ao criar, navega para `/qrcodes/:id`.

### `web/src/components/FormQRCode.jsx` (novo, espelha `FormCliente.jsx`)
Campos: nome, select de cliente (lista recebida via prop), select de categoria, descrição do local, destino atual, select de status (só aparece no modo edição, não na criação — todo QR nasce `ativo`).

### `web/src/pages/QRCodeDetalhe.jsx` (novo, espelha `ClienteDetalhe.jsx`)
- Cartão **Dados**: `FormQRCode` reaproveitado, `PUT /qrcodes/:id`, botão excluir com `window.confirm`.
- Cartão **Imagem**: `<input type="file" accept="image/png,application/pdf" hidden>` → `FormData` → `POST /qrcodes/:id/imagem`; renderiza `<img src=".../uploads/arquivo">` se terminar em `.png`, `<iframe src="...">` se `.pdf`; botão remover → `DELETE /qrcodes/:id/imagem`.
- Cartão **Histórico de redirecionamento**: lista `qrcode.historico` (já vem no `GET /qrcodes/:id`), mostrando "destino anterior → destino novo" e data formatada; "Nenhuma alteração de destino ainda." se vazio.

### `web/src/pages/ClienteDetalhe.jsx`
Terceiro cartão "QR Codes": carrega `api('/qrcodes?cliente_id=' + id)` (pode ser no mesmo `useCarregar` do cliente, incluindo `qrcodes` na resposta do `GET /clientes/:id` do backend, igual já é feito com `projetos` — mais simples que uma segunda chamada). Lista nome + `<Link to="/qrcodes/:id">`; "Nenhum QR ainda." se vazio.

Isso implica ajustar `GET /api/clientes/:id` no backend para incluir `qrcodes: qrcodes.listar({ cliente_id: cliente.id })` na resposta, junto com `projetos` e `total_faturado_centavos`.

## Testes

- `server/repos` (via `server/routes/qrcodes.test.js`): CRUD básico; `PUT` mudando `destino_atual` cria uma linha em histórico com valores corretos; `PUT` mudando outro campo (ex: `nome`) não cria histórico; `GET /:id` retorna `historico` ordenado do mais recente pro mais antigo; `POST` com `cliente_id` inexistente retorna 400.
- Upload: `POST /:id/imagem` com PNG e com PDF, ambos aceitos; mimetype não permitido (ex: `image/gif`) rejeitado com 400; segundo upload apaga o arquivo antigo do disco; `DELETE /:id/imagem` remove o arquivo e zera a coluna.
- `server/routes/clientes.test.js`: `GET /clientes/:id` passa a incluir `qrcodes: []` (ou populado) na resposta; `DELETE /clientes/:id` com QR code vinculado retorna 409 em vez de estourar a constraint.
- `web/src/pages/QRCodes.test.jsx`: lista renderiza, filtro por cliente/status refaz a chamada com querystring correta, criação navega pro detalhe.
- `web/src/pages/QRCodeDetalhe.test.jsx`: edição de destino atualiza; upload de imagem mostra preview correto por extensão (`.png` → `<img>`, `.pdf` → `<iframe>`); histórico renderiza.
- `web/src/pages/ClienteDetalhe.test.jsx`: cartão de QR Codes lista os QR codes do cliente mockado.
