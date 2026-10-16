# Conteúdo conectado ao Instagram (sincronização) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela de Conteúdo passa a mostrar o grid real do Instagram (capas, números, crescimento) com os posts planejados "Pronto" como prévia no começo do grid, ligando-se sozinhos ao post real quando ele sai.

**Architecture:** Um módulo `server/instagram/` (cliente HTTP da Graph API, sincronização, vínculo) grava tudo no SQLite local; as capas são baixadas para `data/uploads/instagram/`. Rotas `/api/instagram/*` expõem estado, grid, seguidores e vínculos; um executor único evita syncs simultâneas e um timer em `server/index.js` roda a cada 6 h. O frontend troca o kanban pela tela "perfil + painel do lado".

**Tech Stack:** Node ≥ 24 (fetch nativo, `node:sqlite`), Express 5, multer, React 19, Vite, Vitest + supertest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-conteudo-instagram-sync-design.md`

## Global Constraints

- API: Instagram API com login do Instagram, base `https://graph.instagram.com`; permissões `instagram_business_basic` + `instagram_business_manage_insights`. Sem OAuth: token colado em Configurações.
- Renovar token quando faltar **menos de 15 dias** para expirar (token de longa duração ≈ 60 dias).
- Sync: ao iniciar o servidor, **a cada 6 horas**, e pelo botão **"Atualizar agora"**; nunca duas ao mesmo tempo.
- Primeira sync pagina todas as mídias; as seguintes reprocessam as mídias dos **últimos 60 dias**.
- Capas em `data/uploads/instagram/` (reels → `thumbnail_url`; post/carrossel → `media_url`).
- Seguidores: um retrato por dia (o último do dia vence); na primeira conexão tentar preencher os **últimos 30 dias**.
- Legenda normalizada para o vínculo: minúsculas, sem acentos, sem emojis, sem hashtags, espaços colapsados, primeiros **60** caracteres. Legenda normalizada vazia **nunca** casa.
- Só vincula automaticamente mídia publicada **depois** de o planejado ter sido criado; vale para Rascunho e Pronto; exatamente um candidato.
- Ligar → `projetos.postou_instagram = 1`; desfazer/apagar **não** desmarca.
- Tipos oferecidos: `post`, `carrossel`, `reels`. Estados: `rascunho`, `pronto`. Sem canal, sem kanban, sem stories.
- Só **Pronto** entra no grid; Rascunhos numa lista separada; marcar Pronto põe no fim da fila.
- API da Meta sempre mockada nos testes (injetar `fetch`).
- Commits em Conventional Commits, em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- pm2 sem watch: depois de mudar o servidor/migrations, `pm2 restart crm-madia-api`.

## Review Focus

1. Token inválido ou expirado no meio da sync → sync grava `instagram_ultimo_erro`, não apaga nada, o grid continua com os dados guardados e a tela mostra aviso com caminho para reconectar (teste na Task 5).
2. Download de capa falha (URL expirada/404) → mídia salva com `capa = NULL`, sync continua, nova tentativa na próxima sync (teste na Task 4).
3. Insights indisponíveis para uma mídia (API devolve 400 para métrica/mídia antiga) → números ficam `NULL`, as outras mídias seguem (teste na Task 4).
4. "Atualizar agora" clicado enquanto o timer está sincronizando → a segunda chamada devolve a sync em andamento, sem duplicar mídias (teste na Task 5).
5. Planejado e post com legenda vazia ou só hashtags → nunca se ligam sozinhos (teste na Task 2/4).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `server/db/migrations/016_instagram.sql` | Recria `conteudos`; cria `instagram_midias`, `instagram_seguidores`, `conteudos_legado` |
| `server/domain/regras.js` | Constantes `TIPOS_CONTEUDO`, `ESTADOS_CONTEUDO` (remove `CANAIS`, `STATUS_CONTEUDO`, `aplicarRegrasConteudo`) |
| `server/routes/conteudos.js` | CRUD de planejados, arte, reordenar fila |
| `server/instagram/legenda.js` | `normalizarLegenda`, `tipoDaMidia` (puro) |
| `server/instagram/cliente.js` | Chamadas HTTP à Graph API |
| `server/instagram/vinculo.js` | Vínculo automático, manual, legado |
| `server/instagram/sync.js` | Orquestra uma sincronização completa |
| `server/instagram/executor.js` | Executor único + timer periódico |
| `server/routes/instagram.js` | Rotas `/api/instagram/*` |
| `server/app.js`, `server/index.js` | Injeta `fetch`, liga executor e timer |
| `server/routes/painel.js`, `server/domain/painel.js` | Próximos conteúdos sem `status`/`canal` |
| `web/src/lib/rotulos.js` | Rótulos de tipo/estado |
| `web/src/components/FormConteudo.jsx` | Form do planejado (estado, arte) |
| `web/src/pages/Conteudo.jsx` + `web/src/pages/conteudo/*` | Tela nova |
| `web/src/pages/projeto/AbaConteudos.jsx` | Planejados + posts do projeto |
| `web/src/pages/Config.jsx` + `web/src/pages/config/ConexaoInstagram.jsx` | Conectar token |
| `README.md` | Passo a passo do token |

---

### Task 1: Esquema novo e rota de planejados

**Files:**
- Create: `server/db/migrations/016_instagram.sql`
- Modify: `server/domain/regras.js:2-4,17-19`, `server/domain/regras.test.js`, `server/routes/conteudos.js`, `server/routes/conteudos.test.js`, `server/routes/painel.js:69-71`, `server/domain/painel.js:17-18`, `server/routes/painel.test.js`, `server/domain/painel.test.js`

**Interfaces:**
- Produces (tabelas):
  - `conteudos(id, projeto_id → projetos ON DELETE SET NULL, tipo CHECK IN ('post','carrossel','reels'), titulo NOT NULL, legenda, estado NOT NULL DEFAULT 'rascunho' CHECK IN ('rascunho','pronto'), ordem INTEGER NOT NULL DEFAULT 0, data_planejada, arte TEXT, midia_id TEXT UNIQUE → instagram_midias(id) ON DELETE SET NULL, criado_em, atualizado_em)`
  - `instagram_midias(id TEXT PK, tipo CHECK IN ('post','carrossel','reels'), legenda, permalink, publicado_em TEXT NOT NULL (ISO), capa TEXT, curtidas, comentarios, alcance, visualizacoes, salvamentos, compartilhamentos INTEGER NULL, projeto_id → projetos ON DELETE SET NULL, removido INTEGER NOT NULL DEFAULT 0 CHECK IN (0,1), atualizado_em TEXT NOT NULL)`
  - `instagram_seguidores(dia TEXT PK, seguidores INTEGER NOT NULL)`
  - `conteudos_legado(id PK, projeto_id, tipo, data_publicada)` — os antigos `publicado`.
- Produces (API): `GET /api/conteudos?projeto_id=&estado=` (só os não ligados, `midia_id IS NULL`, ordenados por `estado`, `ordem`, `id`, com `projeto_titulo`); `POST /api/conteudos`; `PUT /api/conteudos/:id`; `DELETE /api/conteudos/:id`; `POST /api/conteudos/:id/arte` (multipart campo `arte`); `DELETE /api/conteudos/:id/arte`; `PUT /api/conteudos/ordem` body `{ ids }` (exatamente os prontos não ligados).
- Produces (JS): `TIPOS_CONTEUDO = ['post','carrossel','reels']`, `ESTADOS_CONTEUDO = ['rascunho','pronto']` em `server/domain/regras.js`.

- [ ] **Step 1: Escrever testes que falham em `server/routes/conteudos.test.js`** (substituir os atuais)

```js
it('cria rascunho por padrão, sem canal', async () => {
  const res = await ctx.http.post('/api/conteudos').send({ titulo: 'Reels', tipo: 'reels' }).expect(201);
  expect(res.body).toMatchObject({ estado: 'rascunho', projeto_id: null, arte: null, midia_id: null });
});
it('rejeita tipo story e estado publicado', async () => {
  const res = await ctx.http.post('/api/conteudos').send({ titulo: 'X', tipo: 'story', estado: 'publicado' }).expect(400);
  expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['estado', 'tipo']);
});
it('marcar pronto põe no fim da fila e reordenar troca a ordem', async () => {
  const a = (await ctx.http.post('/api/conteudos').send({ titulo: 'A', tipo: 'post', estado: 'pronto' })).body;
  const b = (await ctx.http.post('/api/conteudos').send({ titulo: 'B', tipo: 'post' })).body;
  await ctx.http.put(`/api/conteudos/${b.id}`).send({ estado: 'pronto' }).expect(200);
  expect((await ctx.http.get('/api/conteudos?estado=pronto')).body.map((c) => c.titulo)).toEqual(['A', 'B']);
  await ctx.http.put('/api/conteudos/ordem').send({ ids: [b.id, a.id] }).expect(204);
  expect((await ctx.http.get('/api/conteudos?estado=pronto')).body.map((c) => c.titulo)).toEqual(['B', 'A']);
  await ctx.http.put('/api/conteudos/ordem').send({ ids: [b.id] }).expect(400);
});
it('envia e remove a arte, apagando o arquivo', async () => {
  const c = (await ctx.http.post('/api/conteudos').send({ titulo: 'A', tipo: 'post' })).body;
  const res = await ctx.http.post(`/api/conteudos/${c.id}/arte`).attach('arte', Buffer.from('png'), { filename: 'a.png', contentType: 'image/png' }).expect(200);
  const arquivo = path.join(ctx.dataDir, 'uploads', res.body.arte);
  expect(existsSync(arquivo)).toBe(true);
  await ctx.http.delete(`/api/conteudos/${c.id}/arte`).expect(200);
  expect(existsSync(arquivo)).toBe(false);
});
it('excluir apaga a arte', async () => { /* cria, envia arte, DELETE /conteudos/:id → 204 e arquivo some */ });
it('migração converte status antigos e guarda publicados como legado', () => {
  // abrir um db em memória aplicando migrações até 015, inserir conteudos com status
  // ideia/produzindo/agendado/publicado (publicado com projeto e data_publicada),
  // aplicar 016 e conferir: rascunho, rascunho, pronto; publicado em conteudos_legado com projeto_id, tipo, data_publicada.
});
```

Para o teste de migração, exportar de `server/db/connection.js` uma variante `migrate(db, { ate })` que aplica só arquivos com nome `<= ate` (ex.: `'015_projetos_servico.sql'`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run server/routes/conteudos.test.js` → FAIL.

- [ ] **Step 3: Escrever `016_instagram.sql`.** Criar `instagram_midias` e `instagram_seguidores` primeiro; criar `conteudos_legado` e copiar `status = 'publicado'` (tipo `story`/`atualizacao` vira `post`); criar `conteudos_novo`, copiar os demais com `CASE status WHEN 'agendado' THEN 'pronto' ELSE 'rascunho' END`, tipo fora da lista vira `post`, `ordem = id`; `DROP TABLE conteudos; ALTER TABLE conteudos_novo RENAME TO conteudos;` Índices: `conteudos(projeto_id)`, `instagram_midias(publicado_em)`.

- [ ] **Step 4: Reescrever `server/routes/conteudos.js`.** Regras: `projeto_id` inteiro, `tipo` enum obrigatório, `titulo` obrigatório, `legenda` texto, `estado` enum padrão `rascunho`, `data_planejada` data. Ao criar como pronto ou mudar `rascunho → pronto`, `ordem = proximaOrdem` entre os prontos (usar SQL direto; `proximaOrdem` de `repos/ordem.js` exige campo pai). Arte via `criarUpload(dataDir)` com `upload.single('arte')`, gravando `arte = req.file.filename`, removendo a arte anterior. `PUT /conteudos/ordem` declarado **antes** de `/conteudos/:id`. Remover `aplicarRegrasConteudo`, `CANAIS`, `STATUS_CONTEUDO` de `regras.js` e seus testes.

- [ ] **Step 5: Ajustar painel.** Em `server/routes/painel.js` trocar `c.status <> 'publicado'` por `c.midia_id IS NULL`; em `server/domain/painel.js` `contexto: 'Instagram'`. Atualizar asserções em `painel.test.js`/`domain/painel.test.js` que usavam `canal`/`status`.

- [ ] **Step 6: Rodar** — `npm test` → todos PASS.

- [ ] **Step 7: Commit** — `feat: planejados com estado, fila e arte no lugar do kanban`

---

### Task 2: Normalização de legenda e tipo da mídia

**Files:**
- Create: `server/instagram/legenda.js`, `server/instagram/legenda.test.js`

**Interfaces:**
- Produces: `normalizarLegenda(texto: string|null) → string`; `tipoDaMidia({ media_type, media_product_type }) → 'post'|'carrossel'|'reels'`.

- [ ] **Step 1: Testes que falham**

```js
expect(normalizarLegenda('  Olá, MUNDO!  🚀 #nfc #site\n\nnova  linha')).toBe('ola, mundo! nova linha');
expect(normalizarLegenda('#so #hashtags 😀')).toBe('');
expect(normalizarLegenda(null)).toBe('');
expect(normalizarLegenda('a'.repeat(100))).toHaveLength(60);
expect(tipoDaMidia({ media_type: 'VIDEO', media_product_type: 'REELS' })).toBe('reels');
expect(tipoDaMidia({ media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED' })).toBe('carrossel');
expect(tipoDaMidia({ media_type: 'IMAGE', media_product_type: 'FEED' })).toBe('post');
expect(tipoDaMidia({ media_type: 'VIDEO', media_product_type: 'FEED' })).toBe('reels');
```

- [ ] **Step 2: Rodar** — `npx vitest run server/instagram/legenda.test.js` → FAIL.
- [ ] **Step 3: Implementar.** NFD + remover `\p{M}`, remover `#\S+`, remover `\p{Extended_Pictographic}` e `️`, colapsar `\s+`, `trim`, `slice(0, 60)` e `trim` final.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** — `feat: normalizacao de legenda para vincular posts`

---

### Task 3: Cliente da Graph API

**Files:**
- Create: `server/instagram/cliente.js`, `server/instagram/cliente.test.js`

**Interfaces:**
- Produces: `criarClienteInstagram({ token, fetch }) →`
  - `perfil() → Promise<{ id, username, followers_count, media_count }>` (`GET /me?fields=user_id,username,followers_count,media_count` — usar `user_id` como `id`)
  - `midias({ desde?: string ISO }) → Promise<Midia[]>` (`GET /me/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=50`, seguindo `paging.next`; com `desde`, para de paginar quando a última mídia da página tiver `timestamp < desde` e descarta as anteriores a `desde`)
  - `insights(midiaId, tipo) → Promise<{ alcance, visualizacoes, salvamentos, compartilhamentos }>` (`GET /{id}/insights?metric=reach,views,saved,shares`; campo ausente → `null`; **qualquer erro HTTP → todos `null`, sem lançar**)
  - `historicoSeguidores() → Promise<Array<{ dia: 'YYYY-MM-DD', seguidores }>>` (`GET /me/insights?metric=follower_count&period=day` com `since`/`until` dos últimos 30 dias; erro → `[]`). Se a API só devolve **ganho diário**, converter em total retroativo a partir de `followers_count` atual — conferir na doc da Meta e documentar a escolha num comentário.
  - `renovarToken() → Promise<{ token, expiraEm: string ISO }>` (`GET /refresh_access_token?grant_type=ig_refresh_token&access_token=...`, `expires_in` em segundos)
- Erros: `class ErroInstagram extends Error { status; tokenInvalido: boolean }`; `tokenInvalido = true` quando a resposta tiver `error.code === 190` ou status 401.
- Base `https://graph.instagram.com`; token via query `access_token`. Conferir na doc atual os nomes de métricas (`views` substituiu `plays`/`impressions`).

- [ ] **Step 1: Testes que falham** com `fetch` falso que responde por URL:
  - `perfil()` devolve `{ id: '178', username: 'luccasmadia', followers_count: 1284, media_count: 40 }`.
  - `midias()` segue duas páginas e devolve 3 itens na ordem.
  - `midias({ desde: '2026-09-01T00:00:00+0000' })` não pede a página 2 quando a 1 já termina antes de `desde`.
  - `insights` com resposta 400 → `{ alcance: null, visualizacoes: null, salvamentos: null, compartilhamentos: null }`.
  - resposta `{ error: { code: 190 } }` em `perfil()` → rejeita com `ErroInstagram` e `tokenInvalido === true`.
  - `renovarToken()` com `expires_in: 5184000` e "agora" `2026-10-16T00:00:00Z` → `expiraEm: '2026-12-15T00:00:00.000Z'` (aceitar `agora` injetável).
- [ ] **Step 2: Rodar** → FAIL. **Step 3: Implementar.** **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** — `feat: cliente da api do instagram`

---

### Task 4: Sincronização e vínculo

**Files:**
- Create: `server/instagram/vinculo.js`, `server/instagram/vinculo.test.js`, `server/instagram/sync.js`, `server/instagram/sync.test.js`

**Interfaces:**
- Consumes: `criarClienteInstagram` (Task 3), `normalizarLegenda`/`tipoDaMidia` (Task 2), tabelas da Task 1, `obterConfig`/`definirConfig`.
- Produces (`vinculo.js`):
  - `vincular(db, conteudoId, midiaId)` — grava `conteudos.midia_id`, copia `projeto_id` do planejado para a mídia (se o planejado tiver projeto) e faz `UPDATE projetos SET postou_instagram = 1`. Erro de validação se a mídia já estiver ligada a outro planejado.
  - `desvincular(db, midiaId)` — limpa `conteudos.midia_id` e, se `instagram_midias.projeto_id` for igual ao do planejado, volta para `NULL`. Não mexe em `postou_instagram`.
  - `vincularAutomatico(db, midia)` — candidatos: `conteudos` com `midia_id IS NULL`, `criado_em < midia.publicado_em`, `normalizarLegenda(legenda) !== ''` e igual à da mídia; liga só se houver **exatamente um**. Retorna `true|false`.
  - `migrarLegado(db)` — para cada `conteudos_legado`: mídia com `substr(publicado_em,1,10) = data_publicada` e mesmo `tipo`; exatamente uma → `projeto_id` na mídia + `postou_instagram = 1`. Apaga **todas** as linhas de `conteudos_legado` depois (com ou sem par).
  - `candidatosManuais(db, midia) → conteudos[]` — planejados não ligados com `criado_em < midia.publicado_em`, prontos primeiro por `ordem`, depois rascunhos.
- Produces (`sync.js`): `sincronizar({ db, dataDir, fetch, agora = () => new Date() }) → Promise<{ novas: number, atualizadas: number }>`. Passos:
  1. Ler `instagram_token`; sem token → lança `ErroInstagram('Instagram não conectado')`.
  2. Se `instagram_token_expira_em - agora < 15 dias` → `renovarToken()` e gravar token/expiração.
  3. `perfil()` → gravar `instagram_usuario`; `INSERT OR REPLACE` em `instagram_seguidores` com o dia local de `agora` (usar `hojeLocal` de `domain/datas.js`).
  4. Primeira sync (tabela `instagram_midias` vazia) → `historicoSeguidores()` com `INSERT OR IGNORE`; `midias()` sem `desde`. Senão `midias({ desde: agora - 60 dias })`.
  5. Upsert de cada mídia (`tipo`, `legenda`, `permalink`, `publicado_em`, `curtidas`, `comentarios`, `removido = 0`) + `insights`. Capa: se `capa` for `NULL`, baixar com `fetch` para `uploads/instagram/<id>.jpg`; falha → continua com `NULL`.
  6. Mídias da janela que existem no banco e não vieram → `removido = 1` e `desvincular`. (Na primeira sync, a janela é tudo.)
  7. Para cada mídia **nova** → `vincularAutomatico`. Depois `migrarLegado`.
  8. Gravar `instagram_ultima_sync = agora.toISOString()` e limpar `instagram_ultimo_erro`. Em qualquer erro: gravar `instagram_ultimo_erro` (mensagem; com `tokenInvalido` → "O acesso ao Instagram expirou. Reconecte em Configurações.") e relançar.

- [ ] **Step 1: Testes de `vinculo.test.js` que falham** (db via `openDb(':memory:')`):
  - planejado com legenda `'Placa NFC nova! #nfc'` criado antes; mídia com `'placa nfc nova!'` publicada depois → ligado, mídia herda projeto, `postou_instagram = 1`.
  - mesmo caso mas mídia publicada **antes** do `criado_em` → não liga.
  - dois planejados com a mesma legenda → não liga nenhum.
  - legenda `'#so #tags'` nos dois lados → não liga.
  - `desvincular` → `midia_id` nulo, projeto da mídia volta a `NULL`, `postou_instagram` continua `1`.
  - `migrarLegado`: legado `(projeto 9, 'reels', '2026-09-26')` + mídia reels de `2026-09-26T21:00:00+0000` → mídia com projeto 9; legado sem par → linha some e nada muda.
- [ ] **Step 2: Testes de `sync.test.js` que falham** com `fetch` falso (perfil + 2 mídias + insights + capas):
  - primeira sync grava 2 mídias, capas existem em `uploads/instagram/`, seguidores do dia gravados, retorna `{ novas: 2, atualizadas: 0 }`.
  - capa de uma mídia responde 404 → mídia salva com `capa = null`; segunda sync tenta baixar de novo.
  - insights 400 numa mídia → números `null`, a outra mídia tem números.
  - segunda sync em que uma mídia sumiu da resposta → `removido = 1`.
  - token expira em 10 dias → `refresh_access_token` chamado e config atualizada; expira em 30 dias → não chamado.
  - `perfil()` responde code 190 → rejeita, `instagram_ultimo_erro` contém "Reconecte", mídias antigas intactas.
- [ ] **Step 3: Rodar** → FAIL. **Step 4: Implementar `vinculo.js` e `sync.js`.** **Step 5: Rodar** → PASS.
- [ ] **Step 6: Commit** — `feat: sincronizacao do instagram com vinculo automatico`

---

### Task 5: Rotas do Instagram, executor único e timer

**Files:**
- Create: `server/instagram/executor.js`, `server/instagram/executor.test.js`, `server/routes/instagram.js`, `server/routes/instagram.test.js`
- Modify: `server/app.js`, `server/index.js`, `server/test/contexto.js`

**Interfaces:**
- Produces (`executor.js`): `criarExecutorUnico(fn) → { executar(): Promise, emAndamento(): boolean }` (chamada durante uma execução devolve a **mesma** promise); `iniciarPeriodico(executar, { intervaloMs = 6 * 60 * 60 * 1000, setInterval = globalThis.setInterval }) → () => void` (chama já e depois a cada intervalo; erros são só logados).
- `criarApp({ db, dataDir, hoje, fetch = globalThis.fetch })`; cria `ctx.sincronizarInstagram = criarExecutorUnico(() => sincronizar({ db, dataDir, fetch }))` e expõe em `app.locals.sincronizarInstagram`. `criarContexto({ hoje, fetch })` repassa `fetch`.
- `server/index.js`: depois do `listen`, `iniciarPeriodico(() => app.locals.sincronizarInstagram.executar())` só se houver `instagram_token` no momento de cada execução (checar dentro da função).
- Rotas (todas sob `/api`):
  - `GET /instagram/estado` → `{ conectado, usuario, expira_em, ultima_sync, ultimo_erro, sincronizando }`
  - `PUT /instagram/conexao` `{ token }` → valida com `perfil()`; inválido → 400 `{ erros: [{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }`; válido → grava `instagram_token`, `instagram_usuario`, `instagram_token_expira_em` (agora + 60 dias), dispara a sync sem esperar, responde o estado.
  - `DELETE /instagram/conexao` → apaga token, usuário, expiração e erro; mantém mídias. 204.
  - `POST /instagram/sincronizar` → aguarda o executor; 200 com `{ novas, atualizadas }`; erro → 502 `{ erro: <mensagem amigável> }`.
  - `GET /instagram/grid` → `{ prontos: conteudos pronto não ligados por ordem, midias: não removidas por publicado_em desc, cada uma com conteudo_id, conteudo_titulo, projeto_titulo, capa_url: '/uploads/instagram/<arquivo>' | null }`
  - `GET /instagram/midias?projeto_id=` → mesma forma de `midias` filtrada.
  - `GET /instagram/midias/:id/candidatos` → `candidatosManuais`.
  - `PUT /instagram/midias/:id` `{ projeto_id }` → valida projeto; devolve a mídia.
  - `POST /instagram/midias/:id/vinculo` `{ conteudo_id }` → `vincular`; `DELETE /instagram/midias/:id/vinculo` → `desvincular`.
  - `GET /instagram/seguidores` → `[{ dia, seguidores }]` dos últimos 90 dias, crescente.
- O token **nunca** aparece em nenhuma resposta.

- [ ] **Step 1: Testes que falham**
  - executor: duas chamadas simultâneas → `fn` chamada 1 vez, ambas recebem o mesmo resultado; depois de terminar, nova chamada roda de novo.
  - `PUT /instagram/conexao` com fetch que responde 190 → 400 e campo `token`; com perfil válido → `estado.conectado === true`, `usuario === 'luccasmadia'`, corpo sem a string do token.
  - `POST /instagram/sincronizar` duas vezes em paralelo → mídias não duplicadas (count = 2).
  - sync com token inválido → 502 com mensagem contendo "Reconecte"; `GET /instagram/grid` ainda devolve as mídias anteriores; `GET /instagram/estado` traz `ultimo_erro`.
  - grid: planejado pronto aparece em `prontos`; depois de `POST .../vinculo` some de `prontos` e a mídia traz `conteudo_titulo`; `DELETE .../vinculo` volta.
  - `DELETE /instagram/conexao` → `conectado: false`, grid mantém mídias.
- [ ] **Step 2: Rodar** → FAIL. **Step 3: Implementar.** **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: rotas do instagram e sincronizacao a cada 6 horas`

---

### Task 6: Rótulos, formulário do planejado e aba do projeto

**Files:**
- Modify: `web/src/lib/rotulos.js:11-15`, `web/src/components/FormConteudo.jsx`, `web/src/pages/projeto/AbaConteudos.jsx`, `web/src/pages/projeto/AbaConteudos.test.jsx`
- Create: `web/src/components/FormConteudo.test.jsx` (se não existir)

**Interfaces:**
- Produces: `ROTULO_TIPO = { post: 'Post', carrossel: 'Carrossel', reels: 'Reels' }`, `ROTULO_ESTADO_CONTEUDO = { rascunho: 'Rascunho', pronto: 'Pronto' }`; remove `ROTULO_CANAL`, `ROTULO_STATUS_CONTEUDO`, `STATUS_CONTEUDO`.
- `FormConteudo({ inicial, projetoFixo, onSalvar, onExcluir })` — campos: Título, Tipo, Estado, Projeto (opcional), Data planejada (opcional), Legenda, **Arte** (`<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Arte">` com prévia). `onSalvar(dados, arquivoArte | null)`; o chamador faz `POST/PUT /conteudos` e depois, se houver arquivo, `POST /conteudos/:id/arte` com `FormData`. Botão "Remover arte" quando `inicial.arte`.
- `AbaConteudos({ projetoId })` — duas seções: "Planejados" (`GET /conteudos?projeto_id=`) e "Publicados no Instagram" (`GET /instagram/midias?projeto_id=`, com miniatura, data, curtidas, link "Abrir no Instagram").

- [ ] **Step 1: Testes que falham**
  - FormConteudo: preencher título, escolher "Pronto", anexar arquivo → `onSalvar` recebe `{ titulo, tipo: 'post', estado: 'pronto', ... }` e um `File`; não existem campos "Canal", "Status", "Link do post".
  - AbaConteudos: mostra o planejado "Reels bastidores" e o publicado com link `https://www.instagram.com/p/abc/`.
- [ ] **Step 2: Rodar** — `npx vitest run web/src/components web/src/pages/projeto` → FAIL.
- [ ] **Step 3: Implementar.** **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** — `feat: formulario do planejado com arte e aba do projeto`

---

### Task 7: Tela de Conteúdo (layout A)

**Files:**
- Modify: `web/src/pages/Conteudo.jsx`, `web/src/pages/Conteudo.test.jsx`, `web/src/styles.css`
- Create: `web/src/pages/conteudo/ResumoCrescimento.jsx`, `web/src/pages/conteudo/GridInstagram.jsx`, `web/src/pages/conteudo/PainelMidia.jsx`, `web/src/pages/conteudo/ListaRascunhos.jsx`

**Interfaces:**
- Consumes: rotas da Task 5, `FormConteudo` (Task 6), `Calendario`, `useCarregar`, `useEnvio`, `Modal`, `Aviso`, recharts (mesmo padrão dos gráficos da Início, mockado com `web/src/test/mockRecharts.js`).
- Layout (seguir o mockup A): topo com título "Conteúdo", botões **Grid** / **Calendário** (`aria-pressed`), **Atualizar agora**, **+ Planejar**. Abaixo, `ResumoCrescimento` (seguidores atuais, "+N em 30 dias", linha). Depois, duas colunas: `GridInstagram` (3 colunas, 4:5, prontos tracejados primeiro com arte ou título e data; publicados com capa e ícone ▶/❐) e `PainelMidia` (post selecionado: capa, data, tipo, legenda recolhida, Visualizações/Alcance/Curtidas/Comentários/Salvamentos/Compartilhamentos com "—" para `null`, link "Abrir no Instagram", seletor de projeto, vínculo: "Ligado a: <título> · Desfazer" ou, se houver candidatos, "Era um destes planejados?" com o primeiro pré-selecionado e botão "Ligar"). Abaixo do grid, `ListaRascunhos`. Em telas estreitas o painel desce para baixo do grid.
- Clicar num pronto abre o modal com `FormConteudo`. Reordenar prontos com botões "←"/"→" no quadrado (`aria-label="Mover <título> para antes|depois"`) chamando `PUT /conteudos/ordem`.
- Estados: sem conexão → aviso "Conecte seu Instagram em Configurações" com link `/config`, mostrando só prontos e rascunhos. `ultimo_erro` → `Aviso` com a mensagem. Durante "Atualizar agora", botão desabilitado com "Atualizando…". Rodapé pequeno: "Última atualização: <data/hora>".
- Calendário: prontos/rascunhos com `data_planejada` e publicados em `publicado_em.slice(0,10)`.

- [ ] **Step 1: Testes que falham em `Conteudo.test.jsx`** (substituir os de kanban/canal) com `mockApi` de `GET /instagram/estado`, `GET /instagram/grid`, `GET /instagram/seguidores`, `GET /conteudos?estado=rascunho`:
  - grid mostra o pronto "Reels sexta" antes das capas publicadas; rascunho "Ideia bastidores" aparece em "Rascunhos" e **não** no grid.
  - clicar numa mídia mostra "Curtidas 134" e "Salvamentos —" quando `salvamentos: null`.
  - mídia com candidatos → "Era um destes planejados?" e clicar "Ligar" faz `POST /instagram/midias/m1/vinculo` com `{ conteudo_id: 7 }`.
  - "Atualizar agora" faz `POST /instagram/sincronizar` e recarrega o grid.
  - estado desconectado → link "Conecte seu Instagram" para `/config`.
  - mover pronto para depois → `PUT /conteudos/ordem` com ids na nova ordem.
  - resumo mostra "1.284 seguidores" e "+42 em 30 dias" para série de 1.242 → 1.284.
- [ ] **Step 2: Rodar** — `npx vitest run web/src/pages/Conteudo.test.jsx` → FAIL.
- [ ] **Step 3: Implementar** os componentes e estilos (tokens do tema escuro existentes; borda tracejada em `var(--primaria)`).
- [ ] **Step 4: Rodar** → PASS; `npm test` inteiro → PASS.
- [ ] **Step 5: Commit** — `feat: tela de conteudo com grid real do instagram`

---

### Task 8: Conexão em Configurações e passo a passo

**Files:**
- Create: `web/src/pages/config/ConexaoInstagram.jsx`
- Modify: `web/src/pages/Config.jsx`, `web/src/pages/Config.test.jsx`, `README.md`

**Interfaces:**
- `ConexaoInstagram()` — usa `GET /instagram/estado`. Desconectado: campo "Token de acesso" (`type="password"`) + botão "Conectar" (`PUT /instagram/conexao`), erro no campo. Conectado: "Conectado como @usuario · acesso renova sozinho (vence em dd/mm/aaaa)" + botão "Desconectar" (`DELETE`). Um `<details>` "Como gerar o token" com os passos:
  1. Em developers.facebook.com, criar app do tipo "Empresa" e adicionar o produto **Instagram** → "API com login do Instagram".
  2. Em "Funções do app → Testadores do Instagram", adicionar sua conta e aceitar o convite no Instagram (Configurações → Apps e sites).
  3. Na configuração da API, em "Gerar tokens de acesso", clicar em "Adicionar conta", entrar e copiar o token.
  4. Colar aqui e clicar em Conectar.
- README: seção "Instagram" com os mesmos passos e a nota de que o CRM renova o acesso sozinho.

- [ ] **Step 1: Testes que falham** — conectar envia `{ token: 'abc' }` e mostra "Conectado como @luccasmadia"; erro 400 mostra "Token inválido ou sem permissão"; desconectar chama `DELETE /instagram/conexao`.
- [ ] **Step 2: Rodar** → FAIL. **Step 3: Implementar.** **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: conectar instagram nas configuracoes`

---

### Task 9: Verificação com a conta real

- [ ] **Step 1:** Backup: copiar `data/crm.db` para `data/crm.db.antes-016` com o CRM parado (`pm2 stop crm-madia-api`).
- [ ] **Step 2:** `pm2 restart crm-madia-api` e conferir no log que a migração 016 aplicou sem erro (`pm2 logs crm-madia-api --lines 30`).
- [ ] **Step 3:** O Lucca gera o token (passo a passo da Task 8) e conecta em Configurações.
- [ ] **Step 4:** Abrir `/conteudo`: o grid bate com o perfil real (ordem, capas, ícones), números aparecem no painel, resumo de seguidores aparece; os 3 conteúdos antigos do projeto 9 passaram o projeto para os posts do mesmo dia (ou foram descartados).
- [ ] **Step 5:** Criar um planejado Pronto com a legenda de um post que será publicado, publicar no Instagram, clicar "Atualizar agora" e conferir que ligou sozinho.
- [ ] **Step 6:** Commit de ajustes, se houver (`fix: ...`).
