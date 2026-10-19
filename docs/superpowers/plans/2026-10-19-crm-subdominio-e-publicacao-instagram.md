# CRM no subdomínio + publicar/agendar no Instagram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o CRM acessível com login em `crm.luccasmadia.com.br` (Cloudflare Tunnel + Access) e permitir publicar agora ou agendar Reels, posts de foto e carrosséis de imagens direto dos rascunhos do Conteúdo.

**Architecture:** O Express passa a servir o front compilado e aceita o host público. O Cloudflare (configurado à mão pelo Lucca) cuida do login. A publicação usa o fluxo de contêiner da API do Instagram: a mídia sai por uma rota pública temporária (`/publico/midia/<token>/<arquivo>`), e o estado de publicação fica no banco para evitar post duplicado e permitir retomar depois de um reinício do pm2. Um agendador no processo da API confere os agendados a cada minuto.

**Tech Stack:** Node 24 + Express 5 + `node:sqlite`, React 19 + Vite 8 + vite-plugin-pwa, Vitest/supertest/Testing Library, `sharp` (dependência nova, para converter imagens em JPEG), Instagram API com login do Instagram (`graph.instagram.com`), Cloudflare Tunnel/Access.

**Spec:** `docs/superpowers/specs/2026-10-19-crm-subdominio-e-publicacao-instagram-design.md`

## Global Constraints

- Host público: `crm.luccasmadia.com.br`, lido de `process.env.CRM_HOST_PUBLICO` com esse valor como padrão. URL base pública: `https://${HOST_PUBLICO}`.
- O servidor continua escutando só em `127.0.0.1`. Escritas continuam exigindo o cabeçalho `X-CRM: 1`.
- Nenhuma rota fica acessível pelo host público sem passar pelo Access, exceto `GET /publico/midia/:token/:arquivo`.
- Formatos: Reels = exatamente 1 vídeo; post = exatamente 1 imagem; carrossel = 2 a 10 imagens. Vídeo em carrossel é recusado com a mensagem exata `Carrossel aceita só imagens — para vídeo, use um Reels.`
- Envio de mídia de post só pelo PC. Pelo host público, a resposta é 403 com `Suba a mídia pelo PC.`
- Legenda com até 2.200 caracteres e até 30 hashtags.
- Agendado cujo horário passou há mais de 10 minutos vira `atrasado` e **nunca** é publicado sozinho.
- Mensagens para o usuário em português. Commits em Conventional Commits, em português e sem acento, como no histórico, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Trabalhar em worktree/branch própria (a árvore principal tem trabalho do Lucca sem commit).
- A migration nova é a `019_publicacao_instagram.sql`. Fazer backup de `data/crm.db` em `data/backup-antes-019-<data>` antes de aplicar no banco real.
- pm2 roda sem watch: depois do deploy, `npm run build && pm2 restart crm-madia-api`.

## Review Focus

1. **Clique duplo em "Publicar agora", ou botão e agendador ao mesmo tempo** → só uma publicação. A trava no banco é testada na Task 10.
2. **pm2 reinicia no meio da publicação** → retoma o mesmo contêiner. Se o reinício aconteceu depois do `media_publish`, marca `falhou` com "confira no Instagram se saiu" em vez de publicar de novo. Testado na Task 10.
3. **Fuso do agendamento**: o `datetime-local` do navegador vira ISO UTC no próprio navegador, e o servidor recusa horário no passado. Testado nas Tasks 11 e 14.
4. **Token sem a permissão de publicar** (erro OAuth da Meta) → mensagem apontando para Configurações → gerar token com permissão de publicação. Testado na Task 8.
5. **Editar, excluir ou trocar mídia de um conteúdo em `publicando`** → 409 `Este post está sendo publicado.` Excluir um conteúdo apaga os arquivos de mídia dele. Testado nas Tasks 7 e 11.

---

## Etapa 1 — Subdomínio

### Task 1: Aceitar o host público na proteção

**Files:**
- Modify: `server/http/protecao.js`
- Test: `server/http/protecao.test.js`

**Interfaces:**
- Produces: `export const HOST_PUBLICO: string`, `export const URL_PUBLICA: string` (`https://${HOST_PUBLICO}`), `export function ehAcessoPublico(req): boolean` (host sem porta === `HOST_PUBLICO`).

- [ ] **Step 1: Escrever os testes que falham** (no `describe` existente)

```js
it('aceita o host público (chega pelo túnel do Cloudflare)', async () => {
  const { app } = criarContexto();
  await request(app).get('/api/painel').set('Host', 'crm.luccasmadia.com.br').expect(200);
});
it('continua exigindo X-CRM pelo host público', async () => {
  const { app } = criarContexto();
  await request(app).post('/api/clientes').set('Host', 'crm.luccasmadia.com.br').send({ nome: 'Ana' }).expect(403);
});
```

- [ ] **Step 2:** `npx vitest run server/http/protecao.test.js` → FAIL com 403 no primeiro teste.
- [ ] **Step 3: Implementar.** Incluir `HOST_PUBLICO` em `HOSTS_PERMITIDOS` e exportar `ehAcessoPublico`. Atualizar o comentário do topo do arquivo: o Access do Cloudflare faz o login; o servidor só escuta em 127.0.0.1, então só o `cloudflared` local chega pelo host público. Registrar no comentário que **não** validamos o JWT do Access, pelo motivo acima.
- [ ] **Step 4:** Rodar o arquivo de teste → PASS.
- [ ] **Step 5:** Commit `feat: aceita o host publico crm.luccasmadia.com.br`.

### Task 2: Express serve o front compilado + guia do túnel

**Files:**
- Modify: `server/app.js`, `server/index.js`, `vite.config.js`, `package.json`, `ecosystem.config.cjs`, `README.md`
- Create: `docs/tunel-cloudflare.md`
- Test: `server/app.test.js` (criar se não existir)

**Interfaces:**
- Produces: `criarApp({ db, dataDir, hoje, fetch, distDir })`. `distDir` é opcional; se a pasta existir, serve os estáticos e devolve `index.html` para GETs fora de `/api`, `/uploads` e `/publico`.

- [ ] **Step 1: Teste que falha.** Criar uma pasta temporária com `index.html` (`<p>crm</p>`) e passar como `distDir` ao `criarApp`. Esperar que `GET /conteudo` → 200 contendo `crm`, e que `GET /api/inexistente` continue → 404 JSON.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar.** Usar `express.static(distDir)` e um fallback SPA depois das rotas `/api`. Em `index.js`, passar `distDir: path.join(raiz, 'dist')`. Em `vite.config.js`: `build: { outDir: '../dist', emptyOutDir: true }` e incluir `/^\/publico\//, /^\/cdn-cgi\//` no `navigateFallbackDenylist`. No `package.json`, adicionar o script `"build": "vite build"`. No `ecosystem.config.cjs`, remover o app `crm-madia-web` (o túnel aponta para `127.0.0.1:5174`).
- [ ] **Step 4:** Rodar o teste → PASS. Rodar `npm run build` → gera `dist/index.html`.
- [ ] **Step 5: Docs.** Escrever `docs/tunel-cloudflare.md` com o passo a passo manual do Lucca: registros da Vercel em "DNS only" (A `@` → `216.198.79.1`, CNAME `www` → `cname.vercel-dns.com`), troca de nameservers no Registro.br (aceitar desativar o DNSSEC), `cloudflared` instalado como serviço do Windows com túnel nomeado `crm.luccasmadia.com.br` → `http://127.0.0.1:5174`, aplicação Access com política Allow só para `luccasmadia07@gmail.com` (One-time PIN, sessão de 1 mês) e uma aplicação separada com política **Bypass** para o caminho `crm.luccasmadia.com.br/publico/*`. No README: novo jeito de subir (`npm run build && pm2 restart crm-madia-api`; o desenvolvimento continua com `npm run dev`).
- [ ] **Step 6:** Commit `feat: serve o front compilado pelo express para o tunel`.

### Task 3: Sessão do Access expirada no front

**Files:**
- Modify: `web/src/api/client.js`
- Test: `web/src/api/client.test.js`

**Interfaces:**
- Produces: `api()` passa `redirect: 'manual'`. Quando `resposta.type === 'opaqueredirect'`, chama `window.location.reload()` e lança `ErroApi(401, { erro: 'Sua sessão expirou. Recarregando para entrar de novo…' })`.

- [ ] **Step 1: Teste que falha.** Mock de `fetch` resolvendo `{ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() }` e spy em `window.location.reload`. Esperar rejeição com a mensagem acima e `reload` chamado 1 vez.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run web/src/api/client.test.js` → PASS (testes antigos inclusive).
- [ ] **Step 5:** Commit `feat: recarrega para o login quando a sessao do cloudflare expira`.

---

## Etapa 2 — Publicação

### Task 4: Migration 019 (mídias do rascunho + estados de publicação)

**Files:**
- Create: `server/db/migrations/019_publicacao_instagram.sql`
- Modify: `server/domain/regras.js`, `web/src/lib/rotulos.js`
- Test: `server/db/migracao-019.test.js` (seguir o padrão `migrate(db, { ate })` dos testes de migração existentes)

**Interfaces:**
- Produces, tabela `conteudo_midias(id INTEGER PK, conteudo_id INTEGER NOT NULL REFERENCES conteudos(id) ON DELETE CASCADE, arquivo TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('imagem','video')), largura INTEGER, altura INTEGER, ordem INTEGER NOT NULL)`.
- Produces, em `conteudos` (recriar a tabela, como a 016 fez): `estado` com CHECK `('rascunho','pronto','agendado','publicando','publicado','falhou','atrasado')`, sem a coluna `arte`, e com as novas colunas `agendado_para TEXT` (ISO UTC), `publicacao_erro TEXT`, `publicacao_token TEXT`, `publicacao_container_id TEXT`, `publicacao_enviado_em TEXT` (gravado logo antes do `media_publish`) e `publicacao_midia_id TEXT`.
- Produces: `ESTADOS_CONTEUDO` continua `['rascunho','pronto']` (os únicos que o usuário define pelo formulário). Novo `ESTADOS_PUBLICACAO = ['agendado','publicando','publicado','falhou','atrasado']`. `ROTULO_ESTADO_CONTEUDO` ganha `agendado: 'Agendado', publicando: 'Publicando…', publicado: 'Publicado', falhou: 'Falhou', atrasado: 'Atrasado'`.

- [ ] **Step 1: Teste que falha.** Aplicar até a 018, inserir um conteúdo com `arte = 'x.png'` e outro sem arte, e aplicar a 019. Esperar: `conteudo_midias` com uma linha `{ conteudo_id, arquivo: 'x.png', tipo: 'imagem', ordem: 0 }`, a coluna `arte` não existe mais e os ids/`midia_id` dos conteúdos foram preservados.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Escrever a migration.
- [ ] **Step 4:** Rodar o teste → PASS. Rodar `npm test`: falhas que dependem de `arte` são esperadas aqui e corrigidas na Task 7. Listar quais falharam no commit.
- [ ] **Step 5:** Commit `feat: migration 019 com midias do rascunho e estados de publicacao`.

### Task 5: Regras de publicação (validação pura)

**Files:**
- Create: `server/instagram/regrasPublicacao.js`
- Test: `server/instagram/regrasPublicacao.test.js`

**Interfaces:**
- Produces: `validarParaPublicar(conteudo: { tipo, legenda }, midias: { tipo, largura, altura }[]): string[]` (lista vazia = ok). `aceitaVideo(tipoConteudo): boolean` (só `reels`). `MENSAGEM_CARROSSEL_VIDEO` com o texto exato das Global Constraints.

- [ ] **Step 1: Testes que falham**, com as mensagens exatas:
  - reels sem mídia ou com imagem → `['Reels precisa de exatamente 1 vídeo.']`
  - post com 0 ou 2 imagens → `['Post precisa de exatamente 1 imagem.']`
  - carrossel com 1 ou 11 imagens → `['Carrossel precisa de 2 a 10 imagens.']`
  - carrossel com vídeo → contém `MENSAGEM_CARROSSEL_VIDEO`
  - imagem 1000×2000 (proporção fora de 4:5 a 1,91:1) → `['A imagem 1 está fora das proporções aceitas pelo Instagram (de 4:5 a 1,91:1).']`
  - legenda com 2.201 caracteres → `['A legenda passa de 2.200 caracteres.']`
  - 31 hashtags → `['A legenda tem mais de 30 hashtags.']`
  - casos válidos dos três tipos → `[]`
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: regras de validacao para publicar no instagram`.

### Task 6: Upload de mídia de post (imagem → JPEG, vídeo)

**Files:**
- Modify: `server/http/upload.js`, `package.json` (adicionar `sharp`)
- Create: `server/instagram/midiaArquivo.js`
- Test: `server/instagram/midiaArquivo.test.js`

**Interfaces:**
- Produces: em `upload.js`, `EXTENSOES_MIDIA_POST` (png, jpeg, webp, `video/mp4` → `.mp4`, `video/quicktime` → `.mov`). `criarUpload(dataDir, extensoes, { tamanhoMaximo })`: o padrão continua 10 MB, e a mídia de post usa 300 MB (conferir o limite atual de Reels da Meta ao implementar e ajustar se mudou).
- Produces: `prepararMidia(arquivo: { path, filename, mimetype }, uploadsDir): Promise<{ arquivo: string, tipo: 'imagem'|'video', largura: number|null, altura: number|null }>`. Imagem: converte para JPEG com `sharp` (qualidade 90, largura máxima 1440 sem ampliar), grava `<uuid>.jpg`, apaga o original e devolve as dimensões. Vídeo: devolve como está, com dimensões `null`.

- [ ] **Step 1: Testes que falham.** Gerar um PNG 800×1000 com `sharp` em memória → `prepararMidia` devolve `.jpg`, `largura: 800, altura: 1000`, tipo `imagem`, e o PNG some do disco. Um PNG de 3000×3000 sai com largura 1440. Um `.mp4` qualquer volta com tipo `video` e o arquivo intacto.
- [ ] **Step 2:** `npm i sharp` e rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: prepara midias de post convertendo imagens para jpeg`.

### Task 7: Rotas de mídias do rascunho (substituem `/arte`)

**Files:**
- Modify: `server/routes/conteudos.js`, `server/routes/conteudos.test.js`, `server/routes/instagram.js` (o grid devolve as mídias)
- Create: `server/repos/conteudoMidias.js`

**Interfaces:**
- Consumes: `ehAcessoPublico` (Task 1), `aceitaVideo`/`MENSAGEM_CARROSSEL_VIDEO` (Task 5), `prepararMidia` e `EXTENSOES_MIDIA_POST` (Task 6).
- Produces: toda resposta de conteúdo (lista, item e `prontos` do grid) traz `midias: { id, url: '/uploads/<arquivo>', tipo, largura, altura, ordem }[]` em ordem e `capa_url` (url da 1ª mídia ou `null`).
- Produces, rotas: `POST /api/conteudos/:id/midias` (multipart, campo `midias`, vários arquivos, adiciona no fim); `DELETE /api/conteudos/:id/midias/:midiaId`; `PUT /api/conteudos/:id/midias/ordem` com `{ ids }`. As rotas `/arte` são removidas.
- Produces: `exigirEditavel(conteudo)` lança `ErroHttp(409, 'Este post está sendo publicado.')` quando `estado === 'publicando'`. Vale para PUT, DELETE e todas as rotas de mídia.

- [ ] **Step 1: Testes que falham** (adaptar os antigos de `/arte`):
  - enviar PNG → 200, `midias[0].tipo === 'imagem'`, url terminando em `.jpg`
  - enviar MP4 num carrossel → 400 com `erros: [{ campo: 'midias', mensagem: MENSAGEM_CARROSSEL_VIDEO }]`, e nenhum arquivo sobra em `uploads`
  - enviar com `Host: crm.luccasmadia.com.br` → 403 `{ erro: 'Suba a mídia pelo PC.' }`
  - reordenar com ids que não batem com as mídias → 400
  - excluir o conteúdo → os arquivos das mídias somem do disco
  - qualquer escrita num conteúdo com `estado = 'publicando'` (setado direto no banco) → 409
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar. Arquivos que falham na validação são removidos (`removerArquivos`), como o `/arte` já fazia.
- [ ] **Step 4:** `npm test` → o server inteiro verde (incluindo o que a Task 4 quebrou).
- [ ] **Step 5:** Commit `feat: rascunho com lista ordenada de midias no lugar da arte`.

### Task 8: Métodos de publicação no cliente do Instagram

**Files:**
- Modify: `server/instagram/cliente.js`, `server/test/instagramFalso.js`
- Test: `server/instagram/cliente.test.js`

**Interfaces:**
- Produces: `fetchFalso` passa a aceitar `(entrada, init)` e registra `{ url, metodo, corpo }`. As rotas podem ser chaveadas por `'POST /caminho'`, além de `'/caminho'`, sem quebrar os testes existentes.
- Produces, no cliente: `criarContainer(usuarioId, parametros: Record<string,string>): Promise<string>` (POST `/{usuarioId}/media`, devolve `id`); `statusContainer(id): Promise<{ status: 'FINISHED'|'IN_PROGRESS'|'ERROR'|'EXPIRED'|'PUBLISHED', mensagem: string|null }>` (GET `fields=status_code,status`); `publicarContainer(usuarioId, creationId): Promise<string>` (POST `/{usuarioId}/media_publish`, devolve o id da mídia). Parâmetros vão no corpo `application/x-www-form-urlencoded`, com o `access_token` junto.
- Produces: `ErroInstagram` ganha `semPermissao: boolean` (código 10 ou 200, ou mensagem citando a permissão). A mensagem fica `O token não tem permissão para publicar. Em Configurações → Instagram, gere um token novo com a permissão de publicação e cole de novo.`

- [ ] **Step 1: Testes que falham.** `criarContainer` faz POST com `video_url` e `media_type=REELS` no corpo e devolve o id. `statusContainer` traduz `status_code`. Uma resposta `{ error: { code: 10 } }` gera `semPermissao: true` com a mensagem acima.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar o arquivo e o `sync.test.js` → PASS.
- [ ] **Step 5:** Commit `feat: cliente do instagram cria e publica conteineres`.

### Task 9: Rota pública da mídia em publicação

**Files:**
- Create: `server/routes/publico.js`
- Modify: `server/app.js` (montar **antes** do `protegerLocal`)
- Test: `server/routes/publico.test.js`

**Interfaces:**
- Produces: `GET /publico/midia/:token/:arquivo` serve `uploads/<arquivo>` só se existir um conteúdo com `publicacao_token = token` e `estado = 'publicando'` que tenha essa mídia. Em qualquer outro caso → 404 vazio. Funciona com qualquer `Host`.

- [ ] **Step 1: Testes que falham.** Com token certo e estado `publicando` → 200 e os bytes do arquivo. Token errado, estado `publicado`, arquivo de outro conteúdo ou `..` no nome → 404.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar. Token gerado com `randomBytes(24).toString('hex')` na Task 10.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: rota publica temporaria para o instagram baixar a midia`.

### Task 10: Publicador (trava, contêineres, retomada)

**Files:**
- Create: `server/instagram/publicador.js`
- Modify: `server/instagram/sync.js` (ligar os publicados depois de sincronizar)
- Test: `server/instagram/publicador.test.js`, `server/instagram/sync.test.js`

**Interfaces:**
- Consumes: Tasks 4, 5, 8 e 9, mais `vincular` de `vinculo.js`.
- Produces: `criarPublicador({ db, fetch, urlPublica, sincronizar, esperar = (ms) => new Promise(r => setTimeout(r, ms)), intervaloMs = 5000, limiteMs = 15 * 60 * 1000 })`, que devolve:
  - `iniciar(conteudoId): void`. Trava de forma síncrona (`UPDATE conteudos SET estado='publicando', publicacao_token=?, publicacao_erro=NULL WHERE id=? AND estado IN ('rascunho','pronto','agendado','falhou','atrasado')`). Se `changes !== 1`, lança `ErroHttp(409, 'Este post já está sendo publicado.')`. Antes, roda `validarParaPublicar`, e se houver erro lança `ErroValidacao` com `campo: 'publicacao'`. Depois dispara `processar(id)` sem aguardar.
  - `processar(conteudoId): Promise<void>`. Pega `perfil().id`. Reusa `publicacao_container_id` se existir; senão cria o(s) contêiner(es) com a URL `${urlPublica}/publico/midia/<token>/<arquivo>` (reels: `media_type=REELS`, `video_url`, `caption`; post: `image_url`, `caption`; carrossel: um contêiner por imagem com `is_carousel_item=true` e depois `media_type=CAROUSEL`, `children` e `caption`) e grava o id do contêiner final logo após criar. Consulta o status até `FINISHED`. Grava `publicacao_enviado_em` e chama `publicarContainer`. Grava `publicacao_midia_id` e `estado='publicado'`, chama `sincronizar()` e tenta `vincular`.
  - Erros: qualquer erro, `ERROR`/`EXPIRED` ou estouro do `limiteMs` → `estado='falhou'` com `publicacao_erro` (mensagem do `ErroInstagram`, ou `O Instagram recusou a mídia: <mensagem>` / `O Instagram demorou demais para processar o vídeo. Tente de novo.`), limpando `publicacao_container_id` para a próxima tentativa recomeçar.
  - `retomar(): void` (chamado ao subir): para cada conteúdo em `publicando`, se `publicacao_enviado_em` estiver setado → `falhou` com `A publicação foi interrompida depois de enviada. Confira no Instagram se o post saiu antes de tentar de novo.` Senão → `processar(id)`.
- Produces, em `sync.js`: depois de gravar as mídias, liga (`vincular`) todo conteúdo com `publicacao_midia_id` presente em `instagram_midias` e ainda sem `midia_id`.

- [ ] **Step 1: Testes que falham** (com `fetchFalso` e `esperar` instantâneo):
  - reels: os POSTs saem na ordem `media` → `media_publish`, o `video_url` contém `/publico/midia/<token>/`, e o estado final é `publicado` com `publicacao_midia_id`
  - carrossel com 3 imagens: 3 contêineres com `is_carousel_item`, mais 1 `CAROUSEL` com `children` listando os 3 ids
  - `iniciar` duas vezes seguidas → a segunda lança 409, e só um `media` POST é feito
  - status `ERROR` → `falhou` com a mensagem, e o container id é limpo
  - `retomar` com `publicacao_container_id` setado e sem `enviado_em` → não cria contêiner novo e só consulta e publica
  - `retomar` com `publicacao_enviado_em` setado → `falhou` com a mensagem de interrupção e **nenhum** POST
  - token sem permissão → `falhou` com a mensagem da Task 8
  - sync: um conteúdo com `publicacao_midia_id = 'M1'` fica com `midia_id = 'M1'` depois de uma sync que traz M1
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar os dois arquivos → PASS.
- [ ] **Step 5:** Commit `feat: publicador do instagram com trava e retomada`.

### Task 11: Rotas de publicar, agendar e avisos

**Files:**
- Modify: `server/routes/conteudos.js`, `server/app.js` (criar o publicador e colocar no `ctx`)
- Test: `server/routes/conteudos-publicacao.test.js`

**Interfaces:**
- Consumes: `criarPublicador` (Task 10).
- Produces, em `criarApp`: aceita `publicador` injetável (para os testes); o padrão é `criarPublicador({ db, fetch, urlPublica: URL_PUBLICA, sincronizar: () => sincronizarInstagram.reiniciar() })`. Exposto em `app.locals.publicador`.
- Produces, rotas:
  - `POST /api/conteudos/:id/publicar` → 202 com o conteúdo (`estado: 'publicando'`)
  - `POST /api/conteudos/:id/agendar` `{ agendado_para: ISO }` → valida a mídia (Task 5). Recusa horário ≤ agora com `{ campo: 'agendado_para', mensagem: 'Escolha um horário no futuro.' }`. Grava `estado='agendado'`, de `rascunho`, `pronto`, `agendado`, `falhou` ou `atrasado`.
  - `DELETE /api/conteudos/:id/agendamento` → `estado='rascunho'`, `agendado_para=NULL`
  - `GET /api/conteudos/avisos` → `{ atrasados: Conteudo[], falhas: Conteudo[] }`
  - A lista `GET /api/conteudos` aceita `estado` com qualquer valor de `ESTADOS_CONTEUDO`/`ESTADOS_PUBLICACAO`. O grid (`/instagram/grid`) inclui em `prontos` também `agendado` e `publicando`, ordenados por `agendado_para` antes dos prontos.

- [ ] **Step 1: Testes que falham** (com um publicador falso que registra as chamadas):
  - publicar → 202 e `iniciar(id)` chamado
  - agendar no passado → 400 com a mensagem exata; no futuro → 200 `agendado`
  - agendar um carrossel sem imagens → 400 com a mensagem da Task 5
  - cancelar agendamento → `rascunho`
  - avisos lista os `atrasado` e `falhou`
  - PUT num `publicando` → 409
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS. Depois `npm test`.
- [ ] **Step 5:** Commit `feat: rotas para publicar, agendar e listar avisos`.

### Task 12: Agendador

**Files:**
- Create: `server/instagram/agendador.js`
- Modify: `server/index.js`
- Test: `server/instagram/agendador.test.js`

**Interfaces:**
- Produces: `verificarAgendados({ db, agora: Date, publicador, toleranciaMs = 10 * 60 * 1000 }): void`. Para cada `agendado` com `agendado_para <= agora`: se `agora - agendado_para > toleranciaMs`, marca `atrasado`; senão, chama `publicador.iniciar(id)` (um 409 é ignorado em silêncio).
- Em `index.js`: no `listen`, chamar `app.locals.publicador.retomar()` e depois `setInterval(() => verificarAgendados(...), 60_000)`, com a primeira verificação imediata. Erros vão para `console.error`, nunca derrubam o processo.

- [ ] **Step 1: Testes que falham.** Agendado 2 min atrás → `iniciar` chamado. Agendado 11 min atrás → vira `atrasado` e `iniciar` **não** é chamado. Agendado no futuro → nada. `iniciar` lançando 409 → não propaga.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: agendador publica no horario e marca atrasados`.

### Task 13: Front — mídias no formulário do rascunho

**Files:**
- Modify: `web/src/components/FormConteudo.jsx`, `web/src/lib/conteudos.js`, `web/src/pages/conteudo/GridInstagram.jsx`, `web/src/pages/Conteudo.jsx`, `web/src/pages/projeto/AbaConteudos.jsx`, `web/src/styles.css`
- Create: `web/src/components/MidiasConteudo.jsx`
- Test: `web/src/components/MidiasConteudo.test.jsx` e os testes existentes desses arquivos

**Interfaces:**
- Consumes: as rotas e o formato `midias`/`capa_url` da Task 7.
- Produces: `<MidiasConteudo conteudo={c} onMudou={(atualizado) => …} />`, com miniaturas em ordem (vídeo com `<video muted>`), botões ←/→ para reordenar, × para remover e um input de arquivos `multiple`. O `accept` depende do tipo: reels `video/mp4,video/quicktime`; post/carrossel `image/png,image/jpeg,image/webp`. Fora de `127.0.0.1`/`localhost`, o input some e aparece o aviso `Suba a mídia pelo PC.` Só aparece para conteúdo já salvo (para um novo: `Salve o rascunho para adicionar mídias.`).
- Os lugares que usavam `arte` passam a usar `capa_url`. A lógica de arte sai de `salvarConteudo`.

- [ ] **Step 1: Testes que falham.** Renderizar com 2 imagens e clicar → na 2ª chama `PUT …/midias/ordem` com os ids trocados. Escolher arquivo chama `POST …/midias` com `FormData`. Com `window.location.hostname = 'crm.luccasmadia.com.br'` (stub), o input não existe e o aviso aparece. Um erro 400 do servidor (vídeo em carrossel) mostra a mensagem dele.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → verde.
- [ ] **Step 5:** Commit `feat: formulario do rascunho com lista de midias`.

### Task 14: Front — publicar agora, agendar e estados

**Files:**
- Create: `web/src/components/PublicarConteudo.jsx`
- Modify: `web/src/components/FormConteudo.jsx` (encaixar o componente), `web/src/pages/conteudo/GridInstagram.jsx`, `web/src/pages/conteudo/ListaRascunhos.jsx`, `web/src/lib/datas.js`
- Test: `web/src/components/PublicarConteudo.test.jsx`, `web/src/lib/datas.test.js`

**Interfaces:**
- Produces: em `datas.js`, `localParaIso(valorDatetimeLocal: string): string` (`new Date(valor).toISOString()`) e `isoParaLocal(iso): string` (formato `YYYY-MM-DDTHH:mm` no fuso local).
- Produces: `<PublicarConteudo conteudo={c} onMudou={fn} />` mostra a prévia (capa e legenda) e, conforme o estado:
  - rascunho/pronto/falhou/atrasado: botões **Publicar agora** e **Agendar** (campo `datetime-local`); em `falhou`, mostra `publicacao_erro` e o botão vira **Tentar de novo**
  - agendado: `Agendado para <data e hora>` com **Reagendar** e **Cancelar agendamento**
  - publicando: `Publicando…`, e consulta `GET /conteudos/:id` a cada 5 s até mudar
  - publicado: link para o post, quando já ligado
- No grid, itens `agendado` mostram um rótulo com a data e hora curtas, e os `publicando` mostram `Publicando…`.

- [ ] **Step 1: Testes que falham.** `localParaIso('2026-10-20T18:00')` volta a `isoParaLocal` com o mesmo valor (ida e volta). Agendar envia `agendado_para` igual a `localParaIso(valor digitado)`. Um 400 `agendado_para` mostra a mensagem no campo. Em `falhou`, aparece o erro e o botão "Tentar de novo" chama `/publicar`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → verde.
- [ ] **Step 5:** Commit `feat: publicar agora e agendar pelo rascunho`.

### Task 15: Faixa de avisos + textos de ajuda

**Files:**
- Create: `web/src/components/AvisosPublicacao.jsx`
- Modify: `web/src/pages/Inicio.jsx`, `web/src/pages/Conteudo.jsx`, `web/src/pages/config/ConexaoInstagram.jsx`, `README.md`
- Test: `web/src/components/AvisosPublicacao.test.jsx`

**Interfaces:**
- Consumes: `GET /api/conteudos/avisos` (Task 11).
- Produces: `<AvisosPublicacao />` não renderiza nada sem avisos. Com avisos, mostra uma faixa: `N post(s) agendado(s) não saíram no horário` com cada título e as ações **Publicar agora**, **Reagendar** (abre o rascunho) e **Voltar para rascunho**; e `N publicação(ões) falharam` com o título, o erro e **Tentar de novo**.
- Em "Como gerar o token" (ConexaoInstagram) e no README, incluir a permissão `instagram_business_content_publish` ao gerar o token.

- [ ] **Step 1: Testes que falham.** Sem avisos → container vazio. Com 1 atrasado → texto e botões, e "Voltar para rascunho" chama `DELETE …/agendamento`. Com 1 falha → mostra o erro.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → verde.
- [ ] **Step 5:** Commit `feat: avisos de posts atrasados e falhas no inicio e no conteudo`.

### Task 16: Deploy local (manual, com o Lucca)

- [ ] **Step 1:** Backup: copiar `data/crm.db` para `data/backup-antes-019-<data>/`, com o CRM parado (`pm2 stop crm-madia-api`).
- [ ] **Step 2:** Merge da branch no `main`, `npm install` e `npm run build`.
- [ ] **Step 3:** `pm2 delete crm-madia-web` e `pm2 restart crm-madia-api`. Conferir `http://127.0.0.1:5174` abrindo o CRM e a migration 019 aplicada (`schema_migrations`).
- [ ] **Step 4:** Depois que o Lucca terminar o `docs/tunel-cloudflare.md`: abrir `https://crm.luccasmadia.com.br` numa aba anônima → pede o código de e-mail; abrir `https://crm.luccasmadia.com.br/publico/midia/x/y` → 404 do CRM (não a tela de login).
- [ ] **Step 5:** Com o token novo colado, publicar um post de teste escolhido pelo Lucca e conferir que ele aparece ligado no grid.
