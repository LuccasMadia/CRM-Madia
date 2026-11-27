# Alertas de token (falha e validade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar o Lucca quando o token de uma integração parou de funcionar (checagem real) ou está perto de vencer (validade informada por ele), em todos os serviços com token.

**Architecture:** Um serviço `server/conexoes/servico.js` junta o estado de todas as conexões (GitHub, Figma, Vercel, Supabase por conta, Instagram). Falha: chamada leve ao serviço com cache de 10 min, chaveada pelo fim do token (token novo = checagem nova); só 401/403 conta como "parou de funcionar" (sem internet não alerta). Validade: data opcional guardada em `config` (`github_validade`, `figma_validade`, `vercel_validade`) ou no campo `validade` de cada conta do Supabase; Instagram usa a `instagram_token_expira_em` que já existe (somente leitura). Alertas aparecem na faixa de Início, em Serviços › Sites e sistemas e em cada cartão de Configurações.

**Tech Stack:** Express, node:sqlite, React, vitest. Modelos: `server/routes/supabase.js`, `server/supabase/contas.js`, `web/src/components/AvisosSites.jsx`, `web/src/components/PedeAtencao.jsx`, `web/src/pages/servicos/atencaoSites.js`; cache `criarCache` de `server/github/cache.js`; fake fetch `githubFalso` (`server/test/githubFalso.js`; para dois tokens no mesmo endereço usar um fetch próprio que lê `init.headers`, como em `server/routes/supabase.test.js`).

**Spec:** conversa com o Lucca em 2026-11-26 (sem arquivo de design): "faz os dois" = alerta de token que parou de funcionar + lembrete por validade, para todos os serviços.

## Global Constraints
- Alerta de validade: faltando 7 dias ou menos → atenção ("Token do X vence em N dias", 0 dias = "vence hoje"); vencida → perigo ("Token do X venceu há N dias"). Falha → perigo ("Token do X parou de funcionar"). Se falhou e venceu, mostra só o de falha.
- Só 401/403 vira "parou de funcionar"; erro de rede ou 5xx nunca alerta.
- Sem validade informada: nenhum alerta de validade. Nunca devolver tokens em resposta nenhuma.
- Nome nas mensagens: GitHub, Figma, Vercel, Supabase (com o e-mail da conta: "Token do Supabase (ana@exemplo.com)"), Instagram.
- `/conexoes/atencao` nunca devolve erro HTTP (`{alertas: []}` em qualquer falha).
- Arquivos CRLF; UI em português; sem dependência nova.

## Review Focus
- Sem internet ou serviço fora do ar não gera "parou de funcionar" nem derruba Início/Serviços (Task 1).
- Colar token novo limpa o alerta de falha logo (cache chaveado pelo token) (Task 1).
- Validade no mesmo dia (0 dias) e validade já passada (Task 1).
- Conta do Supabase removida some dos alertas; duas contas com problemas geram dois alertas distintos (Task 1).

---

### Task 1: Serviço e rotas de conexões

**Files:**
- Create: `server/conexoes/validade.js` (+ `.test.js`), `server/conexoes/servico.js`, `server/routes/conexoes.js`, `server/routes/conexoes.test.js`
- Modify: `server/app.js` (`ctx.conexoes`, `rotasConexoes`), `server/routes/backup.js` (`github_validade`, `figma_validade`, `vercel_validade` fora da cópia), `server/routes/backup.test.js`

**Interfaces:**
- Produces: `situacaoValidade(validade: string|null, hoje: string, limiteDias = 7): null | {estado: 'ok'|'vence'|'venceu', dias: number}` (`dias` = dias que faltam, ou que passaram para `venceu`); `criarServicoConexoes({db, fetch, hoje}) → {listar({forcar}): Promise<[{servico, nome, conta_id?, conta?, validade, validade_estado, dias, editavel, falhou, mensagem}]>, alertas({forcar}): Promise<[{codigo, tom, texto, para}]>}` (só serviços conectados; `editavel:false` no Instagram); rotas `GET /conexoes[?atualizar=1]`, `GET /conexoes/atencao`, `PUT /conexoes/validade {servico, conta_id?, validade}` (`validade` `AAAA-MM-DD` real ou `''` para limpar; servico `github|figma|vercel|supabase`; supabase exige `conta_id` existente, senão 404; `instagram` → 400 "O Instagram renova a validade sozinho."; data inválida → 400 no campo `validade`; devolve a lista).

- [ ] **Step 1: Testes que falham.** `validade.test.js`: sem data → `null`; faltam 30 dias → `ok`; 7 → `vence` 7; 0 → `vence` 0; ontem → `venceu` 1. `conexoes.test.js` (via rotas, `criarContexto({fetch})`): sem conexões lista vazia; token do GitHub válido → `falhou:false`; 401 → `falhou:true` com a mensagem e alerta perigo "Token do GitHub parou de funcionar"; erro de rede e 500 → `falhou:false` e sem alerta; idem Figma e Vercel; duas contas Supabase, uma revogada → só ela alerta (com o e-mail no texto) e a outra segue; validade em 5 dias → alerta atenção "vence em 5 dias"; 0 dias → "vence hoje"; passada → perigo "venceu há 2 dias"; falhou + venceu → só falha; Instagram com `instagram_token_expira_em` em 3 dias → alerta atenção e `editavel:false`; PUT validade (grava/limpa, datas inválidas `2026-02-30` e `abc` → 400, supabase sem `conta_id` ou com conta inexistente → 404, instagram → 400); trocar o token invalida o cache da checagem (falhou → token novo bom → some o alerta); `/conexoes/atencao` com falha inesperada devolve `{alertas: []}`; backup sem `*_validade`.
- [ ] **Step 2: Rodar** `npx vitest run server/conexoes server/routes/conexoes.test.js server/routes/backup.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementar.** Checagens: GitHub `criarClienteGithub(...).usuario()`, Figma `criarClienteFigma(...).usuario()`, Vercel `criarClienteVercel(...).listarProjetos()`, Supabase `criarClienteSupabase(...).listarProjetos()` por conta; cache `criarCache(10 min)` com chave `servico:conta_id:ultimos8DoToken`; só `erro.tokenInvalido` marca `falhou`. Validade do Supabase em `contas[i].validade` (via `lerContas`/`salvarContas`).
- [ ] **Step 4: Rodar** os mesmos testes e `npx vitest run server` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: alertas de token que falhou ou vai vencer`.

### Task 2: Cartões de Configurações

**Files:**
- Create: `web/src/pages/config/ValidadeToken.jsx` (+ teste)
- Modify: `web/src/pages/config/ConexaoGithub.jsx`, `ConexaoFigma.jsx`, `ConexaoVercel.jsx`, `ConexaoSupabase.jsx` (um por conta), `ConexaoInstagram.jsx` (só o texto de situação) e seus testes de mock (`GET /conexoes`), `web/src/styles.css`

**Interfaces:**
- Consumes: `GET /conexoes`, `PUT /conexoes/validade`.
- Produces: `<ValidadeToken servico contaId? />` — carrega `/conexoes`, acha a sua linha; mostra a situação ("Token parou de funcionar: MENSAGEM", "Venceu há N dias", "Vence em N dias", "Válido até dd/mm/aaaa" ou nada), e quando `editavel` um campo de data "Vence em" + **Salvar** e **Limpar** (PUT; recarrega); `servico="instagram"` só mostra a situação.

- [ ] **Step 1: Testes que falham:** cada estado de texto; salvar data envia `{servico, validade}` (e `conta_id` no Supabase); limpar envia `''`; erro 400 mostrado; some quando o serviço não está conectado.
- [ ] **Step 2: Rodar** `npx vitest run web/src/pages/config` — Expected: FAIL.
- [ ] **Step 3: Implementar** e encaixar no fim de cada cartão conectado (no Supabase, dentro de cada conta da lista).
- [ ] **Step 4: Rodar** `npx vitest run web` — Expected: PASS (ajustar mocks de `/conexoes` onde faltar).
- [ ] **Step 5: Commit** `feat: validade e situação do token nos cartões de configuração`.

### Task 3: Faixas de aviso (Início e Serviços)

**Files:**
- Create: `web/src/components/AvisosConexoes.jsx` (+ teste)
- Modify: `web/src/pages/Inicio.jsx` (+ teste), `web/src/pages/servicos/SitesSistemas.jsx`, `web/src/pages/servicos/atencaoSites.js`, `web/src/pages/servicos/SitesSistemas.test.jsx`

**Interfaces:**
- Consumes: `GET /conexoes/atencao`.
- Produces: `<AvisosConexoes />` — faixa com cada alerta como link para `/configuracoes` (perigo/atenção pela `tom`), `null` quando não há alertas ou se a chamada falha; em Início logo abaixo de `<AvisosSites mostrar="fora_do_ar" />`; em Serviços › Sites e sistemas os alertas entram na faixa "Pede atenção" por `conexoesAlertas` em `itensAtencaoSites` (fonte fora de `fontes`, falha ignorada, como GitHub e Supabase).

- [ ] **Step 1: Testes que falham:** `AvisosConexoes` mostra perigo e atenção com o link certo e some sem alertas ou com erro 500; Início a renderiza; faixa de Serviços mostra os alertas e continua se `/conexoes/atencao` falhar.
- [ ] **Step 2: Rodar** `npx vitest run web/src/components/AvisosConexoes.test.jsx web/src/pages/Inicio.test.jsx web/src/pages/servicos/SitesSistemas.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo verde.
- [ ] **Step 5: Commit** `feat: faixas de aviso de token no Início e em Serviços`.
