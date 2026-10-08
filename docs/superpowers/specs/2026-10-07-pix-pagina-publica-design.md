# Página pública do Pix (QR do Canva) — Design

## Contexto

O código Pix copia-e-cola ([[2026-10-07-pix-copia-e-cola-design]]) já é gerado e exibido na ficha do cliente. Mas o Lucca descobriu, testando no próprio registro "Luccas Madia", que o QR dinâmico do Canva **não aceita colar o código Pix no campo "URL"** — esse campo exige uma URL de verdade, porque o QR do Canva sempre redireciona via `canvaqr.com` (mesma limitação já registrada em [[2026-09-29-controle-qrcodes-design]]: "QR do Canva não codifica o destino real").

A NFC que o Lucca já tem pronta não tem essa restrição — ela pode gravar o texto do código Pix diretamente, sem mudança nenhuma nesta spec.

Pro QR do Canva funcionar, falta uma página pública por cliente que mostre o QR Pix (gerado a partir do código) e o copia-e-cola, pra colar a URL dessa página no campo "URL" do Canva.

Decisões já tomadas com o Lucca:
- A página fica no repositório do Portfólio (`Portifolio Luccas Madia`, Vite + React Router, deploy Vercel) — mesma infraestrutura que ele já usa, sem servidor novo.
- Publicação é uma ação manual por cliente: botão "Publicar Pix" no cartão Pix da ficha do cliente, que já grava e empurra (commit + push) pro repositório do Portfólio — não entra no fluxo existente de "Publicar"/"Commitar e enviar" do Portfólio (que é por projeto, não por cliente).
- URL pública feia e numérica: `/pix/<id-do-cliente>`, sem slug.

## Escopo

1. CRM-Madia: gravar/atualizar uma entrada de Pix num arquivo JSON no repo do Portfólio, e commitar+enviar.
2. CRM-Madia: botão "Publicar Pix" na ficha do cliente.
3. Portfólio: página `/pix/:id` que lê esse JSON e mostra QR + copia-e-cola.

**Fora de escopo:** confirmação de pagamento, qualquer mudança na NFC, qualquer mudança no fluxo de publicação de projetos já existente, autenticação na página pública (ela é pública por natureza — é o destino do QR escaneado pelo cliente final).

## CRM-Madia — backend

### `server/portfolio/pix.js` (novo)

```js
export const CAMINHO_PIX_JSON = 'src/data/pix.json';

export function lerPixAtual(repo) // lê o JSON do repo (objeto vazio {} se o arquivo não existe)

export function gravarPix(repo, { id, nome, codigo }) // faz merge: lê o atual, grava atual[String(id)] = { nome, codigo }, escreve de volta formatado
```

Formato do `src/data/pix.json`: objeto plano indexado pelo id do cliente (string), ex.:
```json
{ "42": { "nome": "Popy", "codigo": "000201...6304ABCD" } }
```
Um objeto (não array) permite lookup O(1) na página do Portfólio por `pixData[id]` e merge simples sem duplicar entradas.

### `server/portfolio/git.js`

Generaliza a lógica de commit/push já usada por `commitarPortfolio` (incluindo o caso de reenviar um commit cujo push falhou antes) numa função `commitarCaminhos(repo, { caminhos, mensagem, semMudancas, push })`, e `commitarPortfolio` passa a ser um wrapper fino dela — comportamento e mensagens inalterados (os testes existentes de `commitarPortfolio` continuam passando sem alteração). Nova função `commitarPix(repo, { push = true } = {})`:

```js
export function commitarPix(repo, { push = true } = {}) {
  return commitarCaminhos(repo, {
    caminhos: [CAMINHO_PIX_JSON],
    mensagem: 'chore(pix): atualiza link Pix via CRM',
    semMudancas: 'Nada para commitar: o Pix já está atualizado.',
    push,
  });
}
```
(`CAMINHO_PIX_JSON` importado de `./pix.js`, mesmo padrão de `CAMINHO_JSON`/`PASTA_IMAGENS` importados de `./write.js`.)

### `server/routes/clientes.js`

Nova rota `POST /:id/publicar-pix` (fica `/api/clientes/:id/publicar-pix`, já que o router é montado em `/api/clientes`):

- 404 se o cliente não existe.
- 400 (`ErroHttp`) se o cliente não tem `chave_pix` cadastrada — mensagem "Cadastre a chave Pix antes de publicar".
- Lê `portfolio_repo_path` de `obterConfig` (mesma chave já usada pela publicação do Portfólio) e valida com `validarRepo` (mesma função usada em `routes/publicacao.js`) — 400 com os erros se a pasta não estiver configurada/for inválida.
- Gera o código via `gerarCodigoPix` (já importado nesse arquivo), grava com `gravarPix`, comita com `commitarPix`, e responde `res.json(commitarPix(repo))` — mesmo formato `{ commitado, saida }` que a rota `/portfolio/git` já devolve.

## CRM-Madia — frontend

### `web/src/pages/ClienteDetalhe.jsx`

No `CartaoPix`, abaixo do botão "Copiar", novo botão "Publicar Pix" que chama `POST /clientes/:id/publicar-pix` (via `api()` + `useEnvio`, mesmo padrão de outras ações da página) e mostra o resultado: sucesso (`"Publicado! Cole esta URL no QR do Canva: <base-do-portfólio>/pix/<id>"` — o Lucca sabe o domínio do próprio Portfólio, não precisamos guardar/configurar isso) ou o erro devolvido pela API (ex.: repo não configurado).

## Portfólio (repo `Portifolio Luccas Madia`)

### `src/data/pix.json`
Arquivo gerado pelo CRM (não editado à mão); não existe até a primeira publicação — a página trata ausência/id não encontrado.

### `package.json`
Nova dependência: `qrcode.react` (renderiza QR como SVG a partir de uma string, zero configuração de servidor).

### `src/pages/PixPage.jsx` (novo) + `src/pages/PixPage.css` (novo)
- Lê `src/data/pix.json` (import estático, mesmo padrão de outros dados do site) e busca `pixData[params.id]`.
- Se não encontrado: mensagem simples "Código Pix não encontrado."
- Se encontrado: nome do negócio, `<QRCodeSVG value={codigo} />` da lib `qrcode.react`, o texto do código num bloco com botão "Copiar" (`navigator.clipboard.writeText`), e uma instrução curta: "Abra o Pix no app do seu banco e escaneie o QR ou cole o código."
- Estilo mínimo reaproveitando as variáveis já existentes em `src/index.css` (`--bg`, `--accent`, `--text`, `--font-heading`, `--font-body`) e as classes `.btn--primary`/`.btn--outline` já usadas no resto do site — não precisa replicar o header/footer do site, é uma página standalone (chega direto pelo QR escaneado).

### `src/App.jsx`
Nova rota:
```jsx
<Route path="/pix/:id" element={<PixPage />} />
```

## Testes

- `server/portfolio/pix.test.js` (novo): `gravarPix` cria o arquivo com `mkdir -p` quando `src/data/` não existe; grava o JSON formatado; uma segunda chamada com outro `id` faz merge (mantém a entrada anterior); uma chamada repetindo o mesmo `id` sobrescreve só aquela entrada. `lerPixAtual` retorna `{}` quando o arquivo não existe.
- `server/portfolio/git.test.js`: mantém os testes existentes de `commitarPortfolio` inalterados (comportamento idêntico pós-refatoração); novos testes equivalentes para `commitarPix` (commita só `src/data/pix.json`, mensagem de commit correta, "nada para commitar" na segunda chamada sem mudanças) — reaproveitando o mesmo fixture de repo+remoto git real (`mkdtempSync` + `git init --bare`) já usado nos testes de `commitarPortfolio`.
- `server/routes/clientes.test.js`: novos casos para `POST /:id/publicar-pix` — 400 sem chave Pix cadastrada; 400 sem `portfolio_repo_path` configurado; sucesso grava `src/data/pix.json` no repo (fixture de repo+remoto git real, mesmo padrão de `git.test.js`, configurado via `PUT /api/config`) com a entrada do cliente e devolve `{ commitado: true, ... }`.
- Portfólio — `src/pages/PixPage.test.jsx` (novo, Vitest + Testing Library já configurados no repo): mostra nome/QR/código quando o id existe no `pix.json` de teste; mostra a mensagem de não encontrado quando o id não existe; botão "Copiar" chama `navigator.clipboard.writeText` com o código (mesma técnica de `vi.spyOn(navigator.clipboard, 'writeText')` usada em `ClienteDetalhe.test.jsx` do CRM, já que o jsdom tem um stub próprio de clipboard que não pode ser substituído por `Object.defineProperty`).
