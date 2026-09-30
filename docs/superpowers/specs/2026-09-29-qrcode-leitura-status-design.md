# Verificação automática de QR desatualizado — Design

## Contexto

O módulo de QR Codes ([[2026-09-29-controle-qrcodes-design]]) guarda o `destino_atual` de cada QR e um arquivo de imagem de referência (export do Canva, tipicamente PNG 6500x6500px). Hoje não há nenhuma checagem entre o que a imagem realmente aponta e o que está cadastrado como destino — se o Lucca trocar o destino no Canva mas esquecer de trocar o link no CRM (ou vice-versa), não há como perceber isso sem escanear o QR manualmente.

Este design adiciona uma verificação automática: ao subir uma imagem PNG, o CRM decodifica o conteúdo do QR e compara com `destino_atual`, sinalizando divergência.

## Escopo

- Decodificação do conteúdo do QR a partir do PNG enviado, no momento do upload.
- Comparação armazenada entre o texto lido e `destino_atual`, exposta como um status calculado.
- Selo visual no detalhe do QR code e na listagem, com os estados: sem imagem, ok, desatualizado, ilegível, não verificado (PDF).

**Fora de escopo:**
- Leitura de QR em arquivos PDF — só PNG é decodificado (decisão do Lucca: a esmagadora maioria dos arquivos são PNG 6500x6500px do Canva; PDF ficaria marcado como "não verificado", nunca como erro).
- Re-checagem automática por mudança em `destino_atual` — não é necessária, porque o texto lido do QR fica salvo e a comparação já é recalculada toda vez que o registro é exibido.
- Botão manual de "reconferir" — não há cenário hoje que exija forçar nova leitura sem reenviar o arquivo.

## Modelo de dados

Nova migration `server/db/migrations/007_qrcodes_leitura.sql`:

```sql
ALTER TABLE qrcodes ADD COLUMN imagem_destino_lido TEXT;
```

`imagem_destino_lido` guarda o texto decodificado do QR na última imagem PNG enviada. `null` quando: não há imagem, a imagem é PDF, ou a leitura falhou. Nunca é enviado pelo cliente (não entra em `REGRAS_QRCODE`); só é escrito pelas rotas de upload/remoção de imagem.

## Backend

### Novas dependências
`jsqr` (decodifica QR a partir de pixels) + `pngjs` (lê PNG para pixels RGBA), como dependências de produção. Ambas puras em JS, sem binário nativo.

Como devDependency: `qrcode` (gera PNG a partir de um texto) — usado só nos testes, para produzir fixtures de QR válido sem depender de arquivo binário versionado no repo.

### `server/domain/qrLeitura.js` (novo)

```js
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

export function lerQrPng(buffer) {
  try {
    const png = PNG.sync.read(buffer);
    const resultado = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    return resultado?.data || null;
  } catch {
    return null;
  }
}

export function statusImagem({ imagem_arquivo, imagem_destino_lido, destino_atual }) {
  if (!imagem_arquivo) return 'sem_imagem';
  if (imagem_arquivo.endsWith('.pdf')) return 'nao_verificado';
  if (!imagem_destino_lido) return 'ilegivel';
  return imagem_destino_lido.trim() === destino_atual.trim() ? 'ok' : 'desatualizado';
}
```

### `server/repos/qrcodes.js`
Adicionar `'imagem_destino_lido'` a `CAMPOS_QRCODE`, para que `atualizar()` genérico já saiba persistir esse campo.

### `server/routes/qrcodes.js`
- `POST /:id/imagem`: depois de salvar o arquivo, se `req.file.mimetype === 'image/png'`, ler o buffer do arquivo salvo (`readFileSync`) e chamar `lerQrPng`; gravar o resultado (texto ou `null`) em `imagem_destino_lido` junto com `imagem_arquivo` no mesmo `atualizar()`. Se for PDF, gravar `imagem_destino_lido: null` explicitamente (limpa leitura antiga ao trocar de PNG pra PDF).
- `DELETE /:id/imagem`: gravar `imagem_destino_lido: null` junto com `imagem_arquivo: null`.
- `montar(id)` (usado no detalhe): incluir `imagem_status: statusImagem(qrcode)` no objeto retornado.
- `listar` (rota `GET /qrcodes`): mapear cada item adicionando `imagem_status: statusImagem(q)`.

## Frontend

### `web/src/lib/rotulos.js`
Novo mapa:
```js
export const ROTULO_STATUS_IMAGEM_QR = {
  ok: 'Confere com o destino',
  desatualizado: 'Desatualizado',
  ilegivel: 'Não foi possível ler',
  nao_verificado: 'Não verificado (PDF)',
};
```
(`sem_imagem` não tem selo — omitido nas duas telas.)

### `web/src/pages/QRCodeDetalhe.jsx`
No cartão **Imagem**, logo abaixo do preview: `qrcode.imagem_status !== 'sem_imagem' && <span className={`etiqueta etiqueta--${qrcode.imagem_status}`}>{ROTULO_STATUS_IMAGEM_QR[qrcode.imagem_status]}</span>`.

### `web/src/pages/QRCodes.jsx`
Nova coluna "Imagem" na tabela, mesmo padrão de selo; célula vazia (`—`) quando `imagem_status === 'sem_imagem'`.

### `web/src/styles.css`
Estender os modificadores de `.etiqueta` já existentes:
```css
.etiqueta--ok { color: var(--ok); border-color: var(--ok); }
.etiqueta--desatualizado { color: var(--perigo); border-color: var(--perigo); }
```
(`ilegivel` e `nao_verificado` usam o estilo neutro padrão de `.etiqueta`, sem cor extra.)

## Testes

- `server/domain/qrLeitura.test.js`: `statusImagem` para cada um dos 5 estados; `lerQrPng` com um PNG gerado via `qrcode.toBuffer(texto, { type: 'png' })` retorna o texto certo; com buffer inválido (ex: `Buffer.from('lixo')`) retorna `null` sem lançar.
- `server/routes/qrcodes.test.js`: mesma técnica (`qrcode.toBuffer`) para montar os anexos de upload. Upload de PNG com QR válido cujo conteúdo bate com `destino_atual` → `imagem_status: 'ok'` no retorno; conteúdo diferente → `'desatualizado'`; PNG não decodificável (buffer garbage, como já usado nos testes existentes) → `'ilegivel'`; upload de PDF → `'nao_verificado'`; QR sem imagem → `'sem_imagem'`; `DELETE /:id/imagem` volta pra `'sem_imagem'`; `GET /qrcodes` (listagem) também traz `imagem_status` por item.
- `web/src/pages/QRCodeDetalhe.test.jsx`: selo aparece com o texto certo conforme `imagem_status` mockado.
- `web/src/pages/QRCodes.test.jsx`: coluna "Imagem" renderiza o selo certo por linha.
