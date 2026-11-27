# Supabase com várias contas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O CRM aceita várias contas do Supabase (um token por conta, porque o plano gratuito limita 2 projetos por conta) e junta os projetos de todas elas.

**Architecture:** Contas ficam em `config` na chave `supabase_contas` (JSON `[{id, nome, token}]`, apagada quando vazia). O token antigo `supabase_token` migra sozinho para a conta "Principal". Cada conta tem cache próprio; falha de uma conta não derruba as outras.

**Tech Stack:** Igual ao plano do Supabase (`docs/superpowers/plans/2026-11-26-supabase.md`, já executado): `server/supabase/*`, `server/routes/supabase.js`, `web/src/pages/config/ConexaoSupabase.jsx`, `web/src/pages/projeto/CartaoSupabase.jsx`; testes com `githubFalso` e `mockApi`.

**Spec:** docs/superpowers/specs/2026-11-26-supabase-design.md (esta mudança é o complemento "várias contas", pedido pelo Lucca em 2026-11-26).

## Global Constraints
- Tokens nunca saem em nenhuma resposta da API (só `{id, nome}`), nunca vão no backup (`supabase_contas` e o antigo `supabase_token` saem da cópia).
- Nome da conta: obrigatório, único sem diferenciar maiúsculas → 400 no campo `nome` "Já existe uma conta com esse nome".
- Token ruim ao adicionar: 400 no campo `token` "Token inválido ou sem permissão"; nada é guardado.
- Continua só leitura. Erros por conta: "Conta NOME: MENSAGEM".
- Arquivos CRLF; UI em português.

## Review Focus
- Quem já tinha `supabase_token` conectado continua conectado após a atualização (migração para "Principal") (Task 1).
- Uma conta com token revogado não esconde os projetos das outras nem some da lista (Tasks 1 e 3).
- Remover uma conta não apaga a ligação `supabase_ref` dos projetos; o cartão passa a mostrar "não encontrado" (Task 2).

---

### Task 1: Contas e serviço

**Files:**
- Create: `server/supabase/contas.js`, `server/supabase/contas.test.js`
- Modify: `server/supabase/servico.js`, `server/routes/backup.js`, `server/routes/backup.test.js`

**Interfaces:**
- Produces: `lerContas(db): [{id: number, nome, token}]` (migra `supabase_token` → `[{id:1, nome:'Principal', token}]` e apaga a chave antiga); `salvarContas(db, contas)` (lista vazia apaga a chave); `criarServicoSupabase({db, fetch})` passa a devolver `estado(): {conectado, contas: [{id, nome}]}`, `projetos({forcar}): Promise<{projetos: [{ref, nome, regiao, estado, link, conta, conta_id}], erros: [{conta_id, conta, erro}]}>` (consulta cada conta com cache próprio `projetos:ID`; erro de uma conta vai para `erros`), `detalheProjeto(projeto, {forcar})` (acrescenta `conta`; se o ref não aparece e há `erros`, lança `ErroSupabase` com a mensagem da primeira), `alertas()` (todas as contas, ignorando as com erro), `limparCache()`.

- [ ] **Step 1: Testes que falham:** `contas.test.js` (migração do token antigo, lista vazia apaga a chave, ids crescentes); serviço via rotas na Task 2. Backup: cópia sem `supabase_contas`.
- [ ] **Step 2: Rodar** `npx vitest run server/supabase server/routes/backup.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementar** `contas.js`, adaptar `servico.js` e a lista de chaves removidas no backup.
- [ ] **Step 4: Rodar** os mesmos testes — Expected: PASS (os de `server/routes/supabase.test.js` ficam para a Task 2).
- [ ] **Step 5: Commit** `feat: contas do Supabase e serviço com várias contas`.

### Task 2: Rotas

**Files:**
- Modify: `server/routes/supabase.js`, `server/routes/supabase.test.js`, `server/routes/cerebro.test.js`; `C:\Users\lucca\Documents\orca\Cerebro-Madia\apps.json` (fora do repo: avisar o Lucca)

**Interfaces:**
- Produces: `GET /supabase` → `{conectado, contas: [{id, nome}]}`; `POST /supabase/contas {nome, token}` (valida o token listando os projetos; devolve o estado); `DELETE /supabase/contas/:id` (404 se não existe); `GET /supabase/projetos[?atualizar=1]` → `{projetos, erros}` (409 sem contas); `GET /projetos/:id/supabase` → detalhe com `conta`; `GET /supabase/atencao` igual. Saem `PUT/DELETE /supabase/conexao`. Cérebro: `crm:supabase_contas`.

- [ ] **Step 1: Testes que falham** (adaptar os existentes e acrescentar): adicionar duas contas e ver os projetos das duas na lista com o nome da conta; nome repetido → 400; token ruim → 400 e nada guardado; remover conta; token antigo migrado aparece como "Principal"; conta com 401 vai em `erros` e as outras listam; detalhe com ref de conta que falhou → 502; alertas somam as contas; sem token em nenhuma resposta; Cérebro conectado só com contas.
- [ ] **Step 2: Rodar** `npx vitest run server/routes/supabase.test.js server/routes/cerebro.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementar**; trocar `crm:supabase_token` por `crm:supabase_contas` no `apps.json` do Cérebro.
- [ ] **Step 4: Rodar** `npx vitest run server` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: rotas do Supabase com várias contas`.

### Task 3: Telas

**Files:**
- Modify: `web/src/pages/config/ConexaoSupabase.jsx` (+ teste), `web/src/pages/projeto/CartaoSupabase.jsx` (+ teste)

**Interfaces:**
- Consumes: rotas da Task 2.
- Produces: Configurações → Supabase com a lista de contas (nome + **Remover**), formulário "Nome da conta" + "Token do Supabase" + **Adicionar conta** (erros nos campos), passo a passo mantido (com a dica "um token por conta"); cartão do projeto: opções "Nome (região) · Conta", detalhe mostra o nome da conta ao lado da região, avisos "Conta NOME: erro" quando a lista traz `erros`; selo e botões como antes.

- [ ] **Step 1: Testes que falham:** adicionar conta, erro no campo token e nome, remover conta, duas contas listadas; cartão: opções com o nome da conta, `erros` de uma conta aparecem sem esconder as outras, detalhe mostra a conta.
- [ ] **Step 2: Rodar** `npx vitest run web/src/pages/config/ConexaoSupabase.test.jsx web/src/pages/projeto/CartaoSupabase.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo verde.
- [ ] **Step 5: Commit** `feat: telas do Supabase com várias contas`.
