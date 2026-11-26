# Calendário ligado ao Apple Calendar (CalDAV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela Calendário no CRM (criar/editar/apagar eventos) sincronizada de ida e volta com o iCloud via CalDAV, mostrando também prazos de tarefas e parcelas.

**Architecture:** Cliente CalDAV próprio e pequeno (`server/calendario/caldav.js`, `fetch` injetável), conversor VEVENT↔evento (`ics-evento.js`), sincronização (`sync.js`: a cada 5 min, ao abrir a tela e pelo botão; gravação imediata), tabela `eventos`, rotas `/api/eventos` e `/api/calendario`, página `/calendario` (mês, semana, lista). Sem dependência nova.

**Tech Stack:** Express, node:sqlite, React, vitest. `npx vitest run` na raiz; fetch falso `githubFalso(rotas)` de `server/test/githubFalso.js` (aceita corpo, `{status, corpo, headers}` ou função; para CalDAV devolver texto XML/ICS em `corpo` string); modelos: `server/instagram/publicador.js` (cliente com `fetch`), `server/agenda/ics.js` (geração ICS já existente), `web/src/pages/config/ConexaoAgenda.jsx`.

**Spec:** docs/superpowers/specs/2026-11-24-calendario-apple-design.md

## Global Constraints
- Chamadas só para o iCloud (`https://caldav.icloud.com`); sem endereço público.
- Senha de app em `config` (`apple_senha`), nunca devolvida pela API nem mostrada; `apple_usuario`, `apple_senha`, `apple_calendario_href`, `apple_ultima_sync`, `apple_erro` fora do backup.
- O UID é a identidade do evento: nunca criar evento com UID já conhecido. Conflito de etag (412): vale a versão do iCloud e o Lucca é avisado. Falha de rede ao gravar → `pendente = 1`, reenviado na próxima sincronização.
- O CRM só altera/apaga no iCloud eventos que ele criou ou que o Lucca editou/apagou pela tela; nunca apaga por conta de sincronização o que não conhece.
- Fuso: America/Sao_Paulo; dia inteiro como `VALUE=DATE`. Recorrentes (RRULE): expandir FREQ simples (diário, semanal, mensal, anual) na janela, somente leitura; regras complexas mostram só a primeira ocorrência com selo.
- Erros curtos em português: "Apple ID ou senha de app inválidos.", "Não foi possível falar com o iCloud. Verifique a internet.", "O calendário escolhido não existe mais no iCloud."
- Arquivos CRLF; UI em português; no celular a tela abre em Lista e o formulário vira folha de baixo.

## Review Focus
- Sincronizar duas vezes seguidas não duplica nem apaga nada (UID estável; evento ausente no iCloud só some do CRM se ele veio de lá) (Task 3).
- Evento de dia inteiro e evento que cruza a meia-noite aparecem no dia certo no fuso de São Paulo (Tasks 2 e 5).
- Senha inválida ou iCloud fora do ar mostram erro e não derrubam o CRM; o calendário local continua mostrando prazos e parcelas (Tasks 4 e 5).
- Eventos recorrentes e eventos sem título/sem fim não quebram a leitura (Task 2).
- Evento com título muito longo ou caracteres especiais (`;`, `,`, quebras de linha) sai e volta do ICS idêntico (Task 2).

---

### Task 1: Tabela de eventos e CRUD local

**Files:**
- Create: `server/db/migrations/046_eventos.sql`, `server/repos/eventos.js`, `server/routes/eventos.js`, `server/routes/eventos.test.js`
- Modify: `server/app.js`, `server/routes/backup.js` (chaves `apple_*`)

**Interfaces:**
- Produces: tabela `eventos(id, titulo NOT NULL, inicio TEXT NOT NULL, fim TEXT, dia_inteiro INTEGER DEFAULT 0, local, notas, cliente_id REFERENCES clientes ON DELETE SET NULL, projeto_id REFERENCES projetos ON DELETE SET NULL, uid TEXT UNIQUE NOT NULL, href, etag, origem TEXT DEFAULT 'crm', recorrente INTEGER DEFAULT 0, pendente INTEGER DEFAULT 0, apagado INTEGER DEFAULT 0, criado_em, atualizado_em)`; `repoEventos(db) → {listar({de, ate}), obter(id), criar(dados), atualizar(id, dados), marcarApagado(id), apagarDefinitivo(id), porUid(uid)}`; rotas `GET /eventos?de=&ate=`, `POST /eventos`, `PUT /eventos/:id`, `DELETE /eventos/:id` (datas `AAAA-MM-DD` ou `AAAA-MM-DDTHH:MM`; `fim >= inicio`; recorrente → 409 "Evento recorrente é somente leitura."; `uid` gerado `crypto.randomUUID()@crm-madia`).

- [ ] **Step 1: Testes que falham:** criar/listar na janela, validações (título obrigatório, fim antes do início → 400), editar, apagar, recorrente não edita (409), cliente/projeto inexistente → 400.
- [ ] **Step 2: Rodar** `npx vitest run server/routes/eventos.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementar** (padrão de `server/repos/crud.js` e das rotas existentes).
- [ ] **Step 4: Rodar** o mesmo teste — Expected: PASS.
- [ ] **Step 5: Commit** `feat: eventos do calendário no CRM`.

### Task 2: Conversor ICS de eventos

**Files:**
- Create: `server/calendario/ics-evento.js`, `server/calendario/ics-evento.test.js`

**Interfaces:**
- Produces: `eventoParaIcs(evento): string` (VCALENDAR/VEVENT com UID, DTSTAMP, SUMMARY, DTSTART/DTEND em `TZID=America/Sao_Paulo` ou `VALUE=DATE` com fim exclusivo, LOCATION, DESCRIPTION; escape de `\`, `;`, `,` e quebras; linhas dobradas em 75 octetos); `icsParaEventos(texto, {de, ate}): [{uid, titulo, inicio, fim, dia_inteiro, local, notas, recorrente}]` (lê várias VEVENT, desdobra linhas, entende `DTSTART` com TZID, UTC `Z` (converte para São Paulo), `VALUE=DATE`, `DURATION`, evento sem `DTEND`; RRULE simples expandida dentro da janela com `recorrente:1`, complexa → primeira ocorrência).

- [ ] **Step 1: Testes que falham:** ida e volta idêntica para evento comum, dia inteiro, título com `; , \` e quebra de linha, título de 200 caracteres (dobra de linha); UTC `Z` 23:30 vira 20:30 em SP; evento sem DTEND/com DURATION; RRULE semanal e mensal expandidas na janela; RRULE complexa (`BYDAY=MO,WE;COUNT=3` com `BYSETPOS`) vira primeira ocorrência marcada; VEVENT sem SUMMARY → título "(sem título)".
- [ ] **Step 2: Rodar** `npx vitest run server/calendario/ics-evento.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementar** sem biblioteca.
- [ ] **Step 4: Rodar** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: conversor de eventos ICS`.

### Task 3: Cliente CalDAV e sincronização

**Files:**
- Create: `server/calendario/caldav.js`, `caldav.test.js`, `server/calendario/sync.js`, `sync.test.js`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `ErroCaldav(mensagem, {status, credencial})`; `criarClienteCaldav({usuario, senha, fetch, timeoutMs}) → { descobrir(): Promise<{calendarHome}>, listarCalendarios(): Promise<[{href, nome}]>, criarCalendario(nome): Promise<href> (MKCALENDAR), ler(href, {de, ate}): Promise<[{href, etag, ics}]> (REPORT calendar-query), gravar(href, uid, ics, {etag}): Promise<{href, etag}> (PUT com `If-Match` ou `If-None-Match: *`), apagar(href, etag): Promise<void> }` (Basic auth, PROPFIND depth 0/1, parsing de XML por regex tolerante); `criarSync({db, fetch, hoje}) → {sincronizar({de, ate}): Promise<{lidos, enviados, conflitos}>, gravarEvento(id), apagarEvento(id)}`: lê a janela (de −30 a +180 dias), insere eventos novos com `origem='apple'`, atualiza os existentes pela etag, remove do CRM os de origem `apple` que sumiram do iCloud, reenvia `pendente`, apaga no iCloud os `apagado=1`, em 412 aplica a versão do iCloud e conta conflito.

- [ ] **Step 1: Testes que falham:** descoberta e listagem (respostas XML de exemplo do iCloud); `ler` com REPORT; `gravar` usa `If-None-Match: *` novo e `If-Match` com etag; 401 → `credencial:true`; sync: duas execuções seguidas não duplicam; evento novo do iCloud entra; evento alterado atualiza; sumiu do iCloud: origem `apple` sai, origem `crm` fica e vira `pendente`; falha de rede ao gravar → `pendente=1` e reenvio na próxima; 412 → versão do iCloud vence e `conflitos: 1`; apagar no CRM apaga no iCloud (DELETE com etag) e remove definitivo.
- [ ] **Step 2: Rodar** `npx vitest run server/calendario` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: cliente CalDAV e sincronização com o iCloud`.

### Task 4: Rotas de conexão e sincronização

**Files:**
- Create: `server/routes/calendario.js`, `server/routes/calendario.test.js`
- Modify: `server/app.js` (`ctx.calendario`, rotas, `setInterval` de 5 min só fora dos testes, mesmo padrão do `sincronizarInstagram`), `server/routes/eventos.js` (gravar/apagar no iCloud logo após o CRUD local, sem falhar a resposta se o iCloud falhar), `server/routes/backup.js`

**Interfaces:**
- Produces: `GET /calendario` → `{conectado, usuario, calendario: {href, nome}|null, ultima_sync, erro}` (sem a senha); `PUT /calendario/conexao {usuario, senha}` (valida com `descobrir()`; 400 no campo `senha` se credencial; salva); `GET /calendario/calendarios`; `PUT /calendario/calendario {href}` ou `{criar: 'CRM Madia'}`; `POST /calendario/sincronizar` → `{lidos, enviados, conflitos}`; `DELETE /calendario/conexao` (limpa `apple_*`; eventos de origem `apple` saem do CRM, os de origem `crm` ficam como locais).

- [ ] **Step 1: Testes que falham:** conexão válida/inválida sem vazar a senha em nenhuma resposta; escolher e criar calendário; sincronizar manual; POST /eventos conectado envia ao iCloud; iCloud fora do ar → evento criado local com `pendente:1`; desconectar mantém eventos do CRM; backup sem `apple_*`.
- [ ] **Step 2: Rodar** `npx vitest run server/routes/calendario.test.js server/routes/eventos.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** esses testes e `npx vitest run server` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: rotas do calendário e sincronização automática`.

### Task 5: Tela Calendário

**Files:**
- Create: `web/src/pages/calendario/Calendario.jsx` (+ teste), `GradeMes.jsx`, `GradeSemana.jsx`, `ListaEventos.jsx`, `FormEvento.jsx` (+ testes), `datasCalendario.js` (+ teste)
- Modify: `web/src/App.jsx` (rota `/calendario`), sidebar, `web/src/styles.css`

**Interfaces:**
- Consumes: `GET /eventos?de&ate`, `POST/PUT/DELETE /eventos`, `POST /calendario/sincronizar`, `GET /calendario`, prazos de tarefas (`GET /tarefas`) e parcelas (`GET /financeiro/parcelas`) já existentes.
- Produces: `/calendario` com abas Mês | Semana | Lista (celular abre em Lista), navegação ← Hoje →, botão **+ Evento**, botão **Atualizar** (sincroniza), chave "Mostrar prazos e parcelas" (liga por padrão; tarefas e parcelas com ícone/cor próprios, somente leitura, link para o item), selo "Pendente" nos eventos não enviados, "Recorrente" somente leitura; `FormEvento` (título, dia, início/fim ou dia inteiro, local, notas, cliente/projeto opcionais, Excluir com confirmação); `datasCalendario.js`: `diasDoMes(ano, mes)`, `diasDaSemana(data)`, `eventosDoDia(eventos, dia)` (evento que cruza meia-noite aparece nos dois dias), em fuso local de São Paulo.

- [ ] **Step 1: Testes que falham:** `datasCalendario` (mês com semanas parciais, evento multi-dia, dia inteiro); tela: renderiza mês com eventos e prazos, chave liga/desliga prazos, criar evento (POST), editar e excluir, recorrente sem botão Editar, sem conexão mostra prazos e o chamado para conectar, erro de sincronização mostra aviso e mantém a grade, formulário rejeita fim antes do início.
- [ ] **Step 2: Rodar** `npx vitest run web/src/pages/calendario` — Expected: FAIL.
- [ ] **Step 3: Implementar** (tema escuro atual; no celular o formulário vira folha de baixo).
- [ ] **Step 4: Rodar** esses testes e `npx vitest run web` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: tela de calendário`.

### Task 6: Configurações e Cérebro

**Files:**
- Create: `web/src/pages/config/ConexaoApple.jsx` (+ teste)
- Modify: `web/src/pages/Config.jsx`, `server/routes/cerebro.test.js`; `C:\Users\lucca\Documents\orca\Cerebro-Madia\apps.json` (fora do repo: avisar o Lucca; adicionar `{ "id": "apple", "nome": "Apple Agenda", "para_que": "Calendário de eventos", "conexao": "crm:apple_senha" }` se ainda não existir)

**Interfaces:**
- Produces: cartão "Apple Calendário" ao lado do "Agenda" (ICS): passo a passo da senha de app (appleid.apple.com → Segurança → Senhas de app), campos "Apple ID" e "Senha de app" (aviso: fica salva neste computador, fora do backup), depois seleção do calendário ou "Criar o calendário CRM Madia", estado "Conectado como X · última sincronização HH:MM", **Sincronizar agora**, **Desconectar**; erro de credencial no campo.

- [ ] **Step 1: Testes que falham:** conectar (senha no campo `senha` com erro), escolher/criar calendário, sincronizar agora, desconectar; Cérebro: Apple conectado só com `apple_senha` salvo.
- [ ] **Step 2: Rodar** `npx vitest run web/src/pages/config/ConexaoApple.test.jsx server/routes/cerebro.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementar**, espelhando `ConexaoFigma.jsx`; editar o `apps.json` do Cérebro.
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: verde.
- [ ] **Step 5: Commit** `feat: conexão com o Apple Calendário e Cérebro`.
