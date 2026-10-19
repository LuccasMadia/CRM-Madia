# Sites no ar + corte por falta de pagamento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O CRM checa a cada 5 min se cada site/sistema hospedado está no ar, avisa mensalidade atrasada com o fluxo "avisei o cliente → 7 dias → tirar do ar?", e pausa/despausa o projeto na Vercel só quando o Lucca confirma.

**Architecture:** Tabela nova `hospedagens` (1 linha por projeto `site_sistema`) + `hospedagem_pausas` (histórico). Módulos em `server/hospedagem/`: cliente da Vercel, checagem HTTP + monitor periódico, e uma função pura de situação de cobrança sobre as parcelas de mensalidade que já existem. Uma rota nova (`server/routes/hospedagem.js`) serve conexão, cadastro, ações e avisos; no front entram Configurações → Vercel, uma aba "Hospedagem" no projeto, uma faixa de avisos no Início e uma coluna de status na lista de Sites.

**Tech Stack:** Express 5, node:sqlite, React 19, Vitest + supertest + Testing Library (mesma do CRM).

**Spec:** `docs/superpowers/specs/2026-10-19-sites-no-ar-e-corte-por-pagamento-design.md`

## Global Constraints

- O CRM **nunca** pausa nem religa sozinho; "Tirar do ar" e "Colocar no ar" só por clique + confirmação.
- Confirmações usam o `Modal` do app (`web/src/components/Modal.jsx`), nunca `alert`/`confirm`.
- Token da Vercel: guardado em `config` (chave `vercel_token`), colado em Configurações, **nunca** devolvido em resposta da API nem logado.
- Testes nunca falam com a Vercel nem com a internet: usar `fetchFalso` de `server/test/instagramFalso.js` (para host ≠ graph.instagram.com a chave é a URL completa, ex.: `'POST https://api.vercel.com/v1/projects/prj_1/pause'`).
- Só projetos `servico = 'site_sistema'` têm hospedagem.
- Monitoramento: intervalo **5 min**; **2** falhas seguidas = fora do ar; timeout **10 s**; 5xx/erro de rede/timeout = falha; 4xx = no ar; redirecionamentos seguidos.
- Prazo padrão entre "avisei o cliente" e "tirar do ar": **7 dias** (config `corte_prazo_dias`, inteiro 1–60).
- Fictícios (`projetos.ficticio = 1`): monitorados, sem aviso de cobrança e sem "Tirar do ar".
- Dinheiro na tela via `formatarDinheiro` (respeita "ocultar valores").
- Migration nova: **023** (`023_hospedagem_sites.sql`) — se o main já tiver uma 023 na hora de implementar, usar o próximo número livre.
- Conventional Commits em português sem acento; `git add`/`git commit -- <arquivos>` sempre nomeando arquivos (outras sessões trabalham no mesmo repo).
- Textos da interface em português do Brasil.

## Review Focus

1. Endereço digitado sem protocolo (`rangodobicho.com.br`) — deve virar `https://rangodobicho.com.br`; texto que não é endereço → erro no campo `url`. (Teste na Task 5.)
2. Token da Vercel aparecendo em alguma resposta — nenhuma rota pode devolvê-lo. (Teste na Task 5.)
3. Site pausado enquanto uma checagem estava em andamento — a checagem não pode sobrescrever "pausado" com "fora do ar"; rodadas do monitor não podem se sobrepor. (Teste na Task 3.)
4. Pagamento parcial — com duas mensalidades atrasadas e só uma paga, o aviso continua e a data de "avisei" é mantida; com todas pagas, o aviso some e a data é zerada. (Testes nas Tasks 4 e 5.)
5. Vercel recusando a pausa (token vencido, projeto apagado) — estado não muda e a mensagem em português aparece na tela. (Testes nas Tasks 5 e 7.)

---

### Task 1: Migration e repositório de hospedagens

**Files:**
- Create: `server/db/migrations/023_hospedagem_sites.sql`
- Create: `server/repos/hospedagens.js`
- Test: `server/repos/hospedagens.test.js`

**Interfaces:**
- Produces (tabela `hospedagens`): `projeto_id INTEGER PRIMARY KEY REFERENCES projetos(id) ON DELETE CASCADE`, `tipo TEXT NOT NULL CHECK (tipo IN ('vercel','sem_hospedagem'))`, `url TEXT`, `vercel_projeto_id TEXT`, `vercel_projeto_nome TEXT`, `status TEXT NOT NULL DEFAULT 'desconhecido' CHECK (status IN ('desconhecido','no_ar','fora_do_ar','pausado'))`, `status_desde TEXT`, `falhas_seguidas INTEGER NOT NULL DEFAULT 0`, `ultimo_motivo TEXT`, `ultima_checagem TEXT`, `cliente_avisado_em TEXT` (data `YYYY-MM-DD`), `atualizado_em TEXT NOT NULL`.
- Produces (tabela `hospedagem_pausas`): `id INTEGER PRIMARY KEY`, `projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE`, `acao TEXT NOT NULL CHECK (acao IN ('pausou','religou'))`, `em TEXT NOT NULL`.
- Produces `repoHospedagens(db)` → `{ obter(projetoId) → linha|null, salvarCadastro(projetoId, { tipo, url, vercel_projeto_id, vercel_projeto_nome }) → linha, atualizar(projetoId, campos) → linha, listarMonitorados() → linhas com tipo='vercel' AND url NOT NULL AND status <> 'pausado', listarTodas() → linhas, registrarPausa(projetoId, acao, em), listarPausas(projetoId) → [{acao, em}] mais recente primeiro }`.
- `salvarCadastro` faz upsert; quando `url` ou `tipo` mudam em relação ao que estava salvo, zera `status='desconhecido'`, `status_desde`, `falhas_seguidas`, `ultimo_motivo`, `ultima_checagem` — exceto se o status atual for `pausado` (continua pausado).

- [ ] **Step 1: Testes que falham** em `server/repos/hospedagens.test.js` (usar `openDb(':memory:')` e criar cliente + projeto `site_sistema` direto via SQL):
  - `salvarCadastro` cria e depois atualiza a mesma linha (`obter` devolve `tipo`, `url`, `status: 'desconhecido'`).
  - trocar a `url` de um site `no_ar` volta o status para `desconhecido` e `falhas_seguidas` para 0; trocar a url de um site `pausado` mantém `pausado`.
  - `listarMonitorados` não traz `sem_hospedagem`, nem sem url, nem `pausado`.
  - `listarPausas` devolve a mais recente primeiro.
  - apagar o projeto apaga hospedagem e pausas (`ON DELETE CASCADE`, com `PRAGMA foreign_keys` ligado como em `openDb`).
- [ ] **Step 2:** `npx vitest run server/repos/hospedagens.test.js` → FAIL (módulo inexistente).
- [ ] **Step 3:** Escrever a migration e o repo (seguir o estilo de `server/repos/conteudoMidias.js`/`crud.js`; `atualizado_em` = `new Date().toISOString()`).
- [ ] **Step 4:** `npx vitest run server/repos/hospedagens.test.js server/db` → PASS (inclui os testes de migrations existentes).
- [ ] **Step 5:** Commit `feat: tabela de hospedagem dos sites e historico de pausas`.

### Task 2: Cliente da Vercel

**Files:**
- Create: `server/hospedagem/vercel.js`
- Test: `server/hospedagem/vercel.test.js`

**Interfaces:**
- Produces `class ErroVercel extends Error` com `status` (0 = sem rede) e `tokenInvalido` (401/403).
- Produces `criarClienteVercel({ token, fetch })` → `{ listarProjetos() → Promise<[{ id, nome }]> (ordenado por nome), pausar(projetoId) → Promise<void>, religar(projetoId) → Promise<void>, estaPausado(projetoId) → Promise<boolean> }`.
- Endpoints (base `https://api.vercel.com`, cabeçalho `Authorization: Bearer <token>`, sem `teamId` — o escopo padrão do token é o time do Lucca): `GET /v10/projects?limit=100` (`projects[].id/.name`), `POST /v1/projects/{id}/pause`, `POST /v1/projects/{id}/unpause`, `GET /v9/projects/{id}` (pausado = `corpo.paused === true`). **Antes de implementar, confirmar na documentação atual da Vercel** (REST API → Projects) que esses caminhos e o campo `paused` continuam assim; se mudaram, ajustar e anotar no relatório.
- Mensagens (exatas): sem rede → `Não foi possível falar com a Vercel. Verifique a internet.`; 401/403 → `Token da Vercel inválido ou sem permissão. Cole um novo em Configurações → Vercel.`; 404 → `Projeto não encontrado na Vercel.`; outro → `A Vercel respondeu ${status}.`

- [ ] **Step 1: Testes que falham** com `fetchFalso`:
  - `listarProjetos` devolve `[{ id: 'prj_a', nome: 'alfa' }, { id: 'prj_b', nome: 'barbearia' }]` a partir de `{ projects: [{ id: 'prj_b', name: 'barbearia' }, { id: 'prj_a', name: 'alfa' }] }` e manda `Authorization: Bearer tok` (estender `fetchFalso` só se precisar registrar cabeçalhos: adicionar `headers` em `requisicoes`, sem quebrar os testes do Instagram).
  - `pausar('prj_1')` faz `POST https://api.vercel.com/v1/projects/prj_1/pause`; `religar` faz `.../unpause`.
  - `estaPausado` → `true` com `{ paused: true }`, `false` com `{}`.
  - 401 → `ErroVercel` com `tokenInvalido: true` e a mensagem de token; 404 → mensagem de projeto; `fetch` que rejeita → `status: 0` e a mensagem de internet.
- [ ] **Step 2:** `npx vitest run server/hospedagem/vercel.test.js` → FAIL.
- [ ] **Step 3:** Implementar (mesma forma de `server/instagram/cliente.js`: um `requisitar` comum).
- [ ] **Step 4:** `npx vitest run server/hospedagem server/instagram` → PASS.
- [ ] **Step 5:** Commit `feat: cliente da vercel para listar, pausar e religar projetos`.

### Task 3: Checagem de site e monitor periódico

**Files:**
- Create: `server/hospedagem/checagem.js`
- Create: `server/hospedagem/monitor.js`
- Modify: `server/app.js` (criar o monitor e expor em `app.locals.monitorSites`), `server/index.js` (rodar ao subir e a cada 5 min)
- Test: `server/hospedagem/checagem.test.js`, `server/hospedagem/monitor.test.js`

**Interfaces:**
- Consumes: `repoHospedagens` (Task 1), `criarClienteVercel` (Task 2), `obterConfig(db, 'vercel_token')`, `criarExecutorUnico` de `server/instagram/executor.js`.
- Produces `checarSite({ url, fetch, timeoutMs = 10_000 })` → `Promise<{ ok: boolean, motivo: string|null }>`. `fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })`; `ok = status < 500`. Motivos exatos: timeout → `Sem resposta em 10 s` (usar o valor de `timeoutMs` em segundos); 5xx → `Erro ${status}`; outra falha de rede → `Não conectou (${erro.message})`.
- Produces `criarMonitor({ db, fetch, agora = () => new Date() })` → `{ checarTodos() → Promise<void> }`, envolvido em `criarExecutorUnico` para nunca rodar duas rodadas ao mesmo tempo.
- Regras da rodada, por site de `listarMonitorados()` (checagens em paralelo):
  - ok → `status='no_ar'`, `falhas_seguidas=0`, `ultimo_motivo=null`; `status_desde=agora` só se o status anterior era outro.
  - falha → `falhas_seguidas+1`, `ultimo_motivo=motivo`. Com `falhas_seguidas >= 2` e status ≠ `fora_do_ar`: se houver token e `vercel_projeto_id` e `estaPausado` → `status='pausado'` (sem registrar em `hospedagem_pausas`); senão (ou se a consulta à Vercel falhar) → `status='fora_do_ar'`, `status_desde=agora`.
  - sempre `ultima_checagem=agora`.
  - **Antes de gravar, reler a linha**: se nesse meio-tempo virou `pausado` ou a `url` mudou, descartar o resultado.
- `server/index.js`: `monitorSites.checarTodos()` ao subir e `setInterval(..., 5 * 60_000)`, com `try/catch` + `console.error('[monitor] ...')` como o agendador.

- [ ] **Step 1: Testes que falham:**
  - `checarSite`: 200 → ok; 404 → ok; 503 → `{ ok: false, motivo: 'Erro 503' }`; fetch que rejeita com `AbortError`/`TimeoutError` → `Sem resposta em 10 s`; rejeição comum → motivo começa com `Não conectou`.
  - monitor: 1 falha → continua `desconhecido`/`no_ar` com `falhas_seguidas: 1`; 2 falhas → `fora_do_ar` com `status_desde` = agora; volta ao ar → `no_ar` e `falhas_seguidas: 0`.
  - 2 falhas com token salvo e Vercel respondendo `{ paused: true }` → `pausado`.
  - Review Focus 3: durante a checagem (rota do fetch falso é uma função que, antes de responder 503, faz `UPDATE hospedagens SET status='pausado'`), o resultado é descartado e o status fica `pausado`.
  - Review Focus 3: duas chamadas simultâneas de `checarTodos()` fazem uma única requisição por site.
- [ ] **Step 2:** `npx vitest run server/hospedagem` → FAIL.
- [ ] **Step 3:** Implementar `checagem.js`, `monitor.js` e ligar em `app.js`/`index.js`.
- [ ] **Step 4:** `npx vitest run server` → PASS.
- [ ] **Step 5:** Commit `feat: monitor que checa os sites a cada 5 minutos`.

### Task 4: Situação de cobrança

**Files:**
- Create: `server/hospedagem/cobranca.js`
- Test: `server/hospedagem/cobranca.test.js`

**Interfaces:**
- Consumes: `somarDias` de `server/domain/datas.js`.
- Produces `situacaoCobranca({ projeto, hospedagem, parcelas, hoje, prazoDias })` → `null | { fase, atrasada_desde, valor_centavos, avisado_em, prazo_ate }` (função pura).
  - `null` se `projeto.ficticio`, se `hospedagem?.tipo !== 'vercel'`, ou se não há atraso e o site não está pausado.
  - Atrasadas = parcelas com `mensalidade = 1`, sem `pago_em`, `vencimento < hoje`. `atrasada_desde` = menor vencimento; `valor_centavos` = soma.
  - Com atraso: sem `cliente_avisado_em` → `fase: 'atrasada'`; com → `prazo_ate = somarDias(avisado_em, prazoDias)`; `hoje >= prazo_ate` → `'prazo_vencido'`, senão `'avisado'`. Exceção: site já `pausado` com atraso → `fase: 'pausado_atrasado'` (já cortado; só resta esperar o pagamento), com os mesmos campos de valor/datas.
  - Sem atraso e `hospedagem.status === 'pausado'` e `projeto.mensalidade_ativa` → `fase: 'pago_pausado'` (campos de valor `0`/`null`).
- Produces `PRAZO_PADRAO_DIAS = 7`.

- [ ] **Step 1: Testes que falham** (hoje `'2026-11-20'`, prazo 7):
  - parcela vencida em `2026-11-10` sem pagamento, sem aviso → `{ fase: 'atrasada', atrasada_desde: '2026-11-10', valor_centavos: <valor> }`.
  - vencimento `2026-11-20` (hoje) → `null` (só atrasa no dia seguinte).
  - avisado em `2026-11-15` → `{ fase: 'avisado', prazo_ate: '2026-11-22' }`; avisado em `2026-11-13` → `'prazo_vencido'` (prazo_ate = hoje).
  - Review Focus 4: duas atrasadas (out e nov), só a de out paga, avisado em `2026-11-15` → continua `'avisado'` com o valor só da de nov.
  - fictício → `null`; `sem_hospedagem` → `null`; parcela não-mensalidade atrasada → `null`.
  - sem atraso + pausado + mensalidade ativa → `'pago_pausado'`; com atraso + pausado → `'pausado_atrasado'`.
- [ ] **Step 2:** `npx vitest run server/hospedagem/cobranca.test.js` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat: situacao de cobranca da mensalidade para o corte`.

### Task 5: Rotas de hospedagem

**Files:**
- Create: `server/routes/hospedagem.js`
- Modify: `server/app.js` (montar `app.use('/api', rotasHospedagem(ctx))` antes do 404 de `/api`), `server/http/erros.js` só se precisar mapear algo novo
- Test: `server/routes/hospedagem.test.js`

**Interfaces:**
- Consumes: Tasks 1–4, `obterConfig`/`definirConfig`, `validar`, `ErroHttp`/`ErroValidacao`/`naoEncontrado`, `gerarTodasMensalidades(db, hoje())`, `repoParcelas`, `repoProjetos`, `ctx.hoje`, `ctx.fetch`, `app.locals.monitorSites`.
- Rotas (todas sob `/api`):
  - `GET /vercel/estado` → `{ conectado: boolean, prazo_dias: number }` (nunca o token).
  - `PUT /vercel/conexao` `{ token }` → valida com `listarProjetos()`; `tokenInvalido` → 400 `{ erros: [{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }`; `status 0` → 502; ok → salva `vercel_token`, devolve o estado.
  - `DELETE /vercel/conexao` → apaga `vercel_token`, 204.
  - `PUT /vercel/prazo` `{ dias }` inteiro 1–60 → salva `corte_prazo_dias`, devolve o estado.
  - `GET /vercel/projetos` → `[{ id, nome }]`; sem token → 409 `Conecte a Vercel em Configurações.`; erro da Vercel → 502 com a mensagem do `ErroVercel`.
  - `GET /projetos/:id/hospedagem` → `{ hospedagem: linha|null, pausas: [...], cobranca: situacaoCobranca(...)|null }`; projeto inexistente → 404; projeto que não é `site_sistema` → 400 `Só sites e sistemas têm hospedagem.`
  - `PUT /projetos/:id/hospedagem` `{ tipo, url?, vercel_projeto_id?, vercel_projeto_nome? }` → `tipo='vercel'` exige `url`; normalizar url (sem protocolo → prefixar `https://`; precisa ser `http:`/`https:` com host contendo ponto, senão 400 campo `url` com `Endereço inválido`); `sem_hospedagem` grava `url`/projeto como `null`. Devolve o mesmo formato do GET. Depois de salvar com url nova, dispara `monitorSites.checarTodos()` sem aguardar.
  - `POST /projetos/:id/hospedagem/avisei` → grava `cliente_avisado_em = hoje()` se houver atraso (`fase` `atrasada`/`avisado`/`prazo_vencido`); senão 409 `Não há mensalidade atrasada.` Devolve o formato do GET.
  - `POST /projetos/:id/hospedagem/pausar` → 409 se fictício (`Site fictício não tem corte.`), sem `vercel_projeto_id` (`Escolha o projeto da Vercel na aba Hospedagem.`), sem token (`Conecte a Vercel em Configurações.`), ou já pausado (`O site já está fora do ar.`). Chama `pausar`; erro → 502 com a mensagem e **nada muda**. Ok → `status='pausado'`, `status_desde=agora`, `falhas_seguidas=0`, `registrarPausa('pausou')`.
  - `POST /projetos/:id/hospedagem/religar` → 409 se não está pausado; mesmos 409 de projeto/token; erro → 502 sem mudança; ok → `status='desconhecido'`, `status_desde=null`, `registrarPausa('religou')`, dispara `checarTodos()` sem aguardar.
  - `GET /hospedagem/avisos` → roda `gerarTodasMensalidades`, depois devolve `{ fora_do_ar: [{ projeto_id, titulo, cliente_nome, url, desde, motivo }], cobrancas: [{ projeto_id, titulo, cliente_nome, ...situacao }] }`. Aqui também se zera `cliente_avisado_em` dos projetos que não têm mais atraso (o pagamento é marcado na rota de parcelas, que não conhece hospedagem).
  - `GET /hospedagem/status` → `[{ projeto_id, tipo, status, status_desde }]` para a lista de Sites.

- [ ] **Step 1: Testes que falham** (supertest via `criarContexto({ hoje, fetch })`; criar cliente + projeto `site_sistema` com `POST /api/clientes` e `POST /api/projetos` ou SQL):
  - conexão: token ok → `{ conectado: true, prazo_dias: 7 }`; 401 da Vercel → 400 no campo `token`; Review Focus 2: depois de conectar com `'segredo-vercel'`, o texto de `GET /vercel/estado`, `GET /projetos/:id/hospedagem` e `GET /hospedagem/avisos` não contém `segredo-vercel`.
  - prazo: `PUT /vercel/prazo { dias: 10 }` → `prazo_dias: 10`; `dias: 0` → 400.
  - Review Focus 1: `PUT .../hospedagem { tipo: 'vercel', url: 'rangodobicho.com.br' }` → `url: 'https://rangodobicho.com.br'`; `url: 'abc'` → 400 campo `url`.
  - projeto GMN → 400 `Só sites e sistemas têm hospedagem.`
  - pausar: chama `POST https://api.vercel.com/v1/projects/prj_1/pause`, status vira `pausado` e `pausas[0].acao === 'pausou'`; Review Focus 5: Vercel 401 → 502 com `Token da Vercel inválido...` e status continua o anterior, sem pausa registrada; fictício → 409.
  - religar: chama `.../unpause`, status `desconhecido`, pausa `religou`.
  - avisos: projeto com mensalidade ativa e parcela atrasada aparece em `cobrancas` com `fase: 'atrasada'`; `avisei` → `fase: 'avisado'`; Review Focus 4: marcar a parcela como paga (`PUT /api/parcelas/:id` com `pago_em`, ver `parcelas.test.js`) → some de `cobrancas` e `GET .../hospedagem` mostra `hospedagem.cliente_avisado_em: null`.
  - avisos: site com `status='fora_do_ar'` aparece em `fora_do_ar` com `desde` e `motivo`.
- [ ] **Step 2:** `npx vitest run server/routes/hospedagem.test.js` → FAIL.
- [ ] **Step 3:** Implementar e montar no `app.js`.
- [ ] **Step 4:** `npx vitest run server` → PASS.
- [ ] **Step 5:** Commit `feat: rotas de hospedagem, corte e avisos de sites`.

### Task 6: Configurações → Vercel e componente de confirmação

**Files:**
- Create: `web/src/pages/config/ConexaoVercel.jsx`, `web/src/components/Confirmacao.jsx`
- Modify: `web/src/pages/Config.jsx` (logo abaixo de `<ConexaoInstagram />`)
- Test: `web/src/pages/config/ConexaoVercel.test.jsx`, `web/src/components/Confirmacao.test.jsx`

**Interfaces:**
- Consumes: `GET /vercel/estado`, `PUT/DELETE /vercel/conexao`, `PUT /vercel/prazo`.
- Produces `<Confirmacao titulo mensagem rotuloConfirmar onConfirmar onFechar />`: usa `Modal`; botões `rotuloConfirmar` (classe `btn btn--perigo` se existir no CSS, senão `btn btn--primario`) e `Cancelar`; enquanto `onConfirmar` (async) roda, os botões ficam desabilitados; erro de `onConfirmar` aparece dentro do modal via `Aviso` e o modal continua aberto; sucesso fecha.
- `ConexaoVercel`: seção `cartao` com título `Vercel`; campo rotulado `Token da Vercel` + botão `Conectar` (igual ao fluxo de `ConexaoInstagram.jsx`); conectado → `Conectado` + botão `Desconectar`; ajuda "Como gerar o token": vercel.com → Account Settings → Tokens → Create, escopo no time `luccasmadia07-5360's projects`. Campo `Dias entre avisar o cliente e tirar do ar` (número) + `Salvar`.

- [ ] **Step 1: Testes que falham** com `mockApi`:
  - conecta: digita `abc` em `Token da Vercel`, clica `Conectar`, vê `Conectado`; corpo do PUT = `{ token: 'abc' }`.
  - erro 400 no campo token aparece.
  - salvar prazo manda `PUT /vercel/prazo` com `{ dias: 10 }`.
  - `Confirmacao`: clicar no rótulo chama `onConfirmar`; rejeição mostra a mensagem e mantém o diálogo; `Cancelar` chama `onFechar`.
- [ ] **Step 2:** `npx vitest run web/src/pages/config web/src/components/Confirmacao.test.jsx` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando + `web/src/pages/Config.test.jsx` → PASS.
- [ ] **Step 5:** Commit `feat: conexao com a vercel em configuracoes`.

### Task 7: Aba Hospedagem no projeto

**Files:**
- Create: `web/src/pages/projeto/AbaHospedagem.jsx`, `web/src/lib/hospedagem.js`
- Modify: `web/src/pages/projeto/Projeto.jsx` (aba `['hospedagem', 'Hospedagem']` só quando `projeto.servico === 'site_sistema'`), `web/src/styles.css` (bolinha de status)
- Test: `web/src/pages/projeto/AbaHospedagem.test.jsx`, `web/src/lib/hospedagem.test.js`

**Interfaces:**
- Consumes: rotas da Task 5, `Confirmacao` (Task 6).
- Produces em `web/src/lib/hospedagem.js`: `ROTULO_STATUS = { desconhecido: 'Verificando…', no_ar: 'No ar', fora_do_ar: 'Fora do ar', pausado: 'Pausado por você' }` e `textoStatus(h)` → `'Fora do ar desde 19/11 14:32'` / `'No ar'` / `'Pausado por você desde 20/11 14:05'` / `'Verificando…'` (data `dd/MM HH:mm` local); `<BolinhaStatus status />` (span `status-site status-site--<status>` com `aria-label` do rótulo).
- Tela:
  - Cadastro: escolha `Vercel` / `Sem hospedagem (instalado no cliente)`; com Vercel, campo `Endereço do site` e select `Projeto da Vercel` (de `GET /vercel/projetos`; com 409 mostrar `Conecte a Vercel em Configurações para escolher o projeto.` e deixar salvar só com o endereço); botão `Salvar`.
  - Status: bolinha + `textoStatus`, `Última checagem: …`, e `ultimo_motivo` quando fora do ar.
  - Cobrança (quando `cobranca` não é null): `atrasada` → `Mensalidade de R$ X atrasada desde dd/mm/aaaa` + botão `Avisei o cliente`; `avisado` → `Cliente avisado em … — prazo até …`; `prazo_vencido` → `Prazo de N dias venceu — tirar do ar?`; `pago_pausado` → `Pago — colocar no ar?`.
  - Botões: `Tirar do ar` (não aparece em fictício nem quando pausado) e `Colocar no ar` (só quando pausado), cada um abrindo `Confirmacao` com `Tirar <titulo> do ar?` / `Colocar <titulo> no ar?` e o endereço na mensagem.
  - Histórico: lista `Tirado do ar em …` / `Colocado no ar em …`.

- [ ] **Step 1: Testes que falham** com `mockApi`:
  - `textoStatus` para cada status (com `status_desde` fixo).
  - salvar cadastro manda `PUT /projetos/5/hospedagem` com `{ tipo: 'vercel', url: 'rangodobicho.com.br', vercel_projeto_id: 'prj_1', vercel_projeto_nome: 'rango-do-bicho-site' }`.
  - `Tirar do ar` → confirmação → `POST /projetos/5/hospedagem/pausar`; Review Focus 5: com resposta 502 `{ erro: 'Token da Vercel inválido...' }` a mensagem aparece no diálogo.
  - `Avisei o cliente` manda `POST .../avisei` e mostra `Cliente avisado em`.
  - fictício não mostra `Tirar do ar`; aba não aparece para projeto GMN (teste em `Projeto.test.jsx`).
- [ ] **Step 2:** `npx vitest run web/src/pages/projeto web/src/lib/hospedagem.test.js` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat: aba hospedagem com status, cobranca e corte do site`.

### Task 8: Avisos no Início e status na lista de Sites

**Files:**
- Create: `web/src/components/AvisosSites.jsx`
- Modify: `web/src/pages/Inicio.jsx` (logo abaixo de `<AvisosPublicacao />`), `web/src/pages/servicos/SitesSistemas.jsx` (coluna `No ar`), `README.md` (seção curta: colar o token da Vercel em Configurações; preencher a aba Hospedagem de cada site; tudo só roda com o PC ligado)
- Test: `web/src/components/AvisosSites.test.jsx`, `web/src/pages/servicos/SitesSistemas.test.jsx`

**Interfaces:**
- Consumes: `GET /hospedagem/avisos`, `GET /hospedagem/status`, `POST .../avisei|pausar|religar`, `Confirmacao`, `textoStatus`/`BolinhaStatus`.
- `AvisosSites`: some quando as duas listas estão vazias (mesmo padrão de `AvisosPublicacao.jsx`). Fora do ar: `<titulo> — fora do ar desde … (motivo)` + link `Abrir` para `/projetos/:id`. Cobranças: mesmos textos e botões da Task 7 (`Avisei o cliente`, `Tirar do ar`, `Colocar no ar` com `Confirmacao`); `avisado`/`pausado_atrasado` só texto + `Abrir`. Depois de cada ação recarrega.
- Lista de Sites: coluna `No ar` com `BolinhaStatus` (sem linha de hospedagem ou `sem_hospedagem` → `—`).

- [ ] **Step 1: Testes que falham** com `mockApi`:
  - nada a avisar → não renderiza nada.
  - fora do ar aparece com `fora do ar desde` e link para `/projetos/7`.
  - `prazo_vencido` mostra `Tirar do ar` → confirmação → `POST /projetos/7/hospedagem/pausar`.
  - `atrasada` mostra `Mensalidade de` com valor formatado e `Avisei o cliente`.
  - lista de Sites mostra a bolinha `Fora do ar` para o projeto com esse status e `—` para o sem hospedagem.
- [ ] **Step 2:** `npx vitest run web/src/components/AvisosSites.test.jsx web/src/pages/servicos web/src/pages/Inicio.test.jsx` → FAIL.
- [ ] **Step 3:** Implementar + README.
- [ ] **Step 4:** `npx vitest run` (suíte inteira) → PASS.
- [ ] **Step 5:** Commit `feat: avisos de sites no inicio e status na lista`.

---

## Depois do merge (com o Lucca)

1. Backup de `data/` (`data/backup-antes-023-<data>`), `npm run build`, `pm2 restart crm-madia-api`.
2. Lucca cria o token na Vercel e cola em Configurações → Vercel.
3. Preencher a aba Hospedagem dos sites reais e fictícios; Canecas da Dri = "Sem hospedagem".
4. Teste de corte num projeto de portfólio que não seja fictício no CRM, ou num projeto de teste — nunca num cliente real.
