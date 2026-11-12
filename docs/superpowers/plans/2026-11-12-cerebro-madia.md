# Cérebro da Madia — Plano de implementação (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a pasta `Cerebro-Madia` (regras + skills da Madia), a skill que gera o relatório de projetos a partir do CRM e a tela `/cerebro` em anéis dentro do CRM.

**Architecture:** O CRM ganha duas rotas de leitura. `GET /api/cerebro/projetos` devolve o relatório de projetos já calculado, com as mesmas regras do `/api/painel`. `GET /api/cerebro` devolve tudo que a tela desenha: a pasta do cérebro lida do disco e os pontos de memória lidos do banco. A skill só chama a primeira rota e formata o resultado. A tela é SVG em React, sem biblioteca nova.

**Tech Stack:** Node ≥ 24, Express 5, better-sqlite via `server/db/connection.js`, React 19 + react-router 8, Vitest + supertest + testing-library.

**Spec:** `docs/superpowers/specs/2026-11-12-cerebro-madia-design.md`

## Global Constraints

- O CRM é a fonte única de clientes e projetos. O cérebro **não copia** dado do CRM para arquivo, exceto o relatório gerado em `relatorios/`.
- A skill só faz `GET` em `http://127.0.0.1:5174`. Nunca `POST`, `PUT` nem `DELETE`. Nunca abre `data/crm.db`.
- Projetos com `ficticio = 1` e com etapa `perdido` ficam fora do relatório e da tela.
- Entregue entra no relatório e na tela só se `data_entrega` estiver nos últimos 30 dias **ou** se tiver tarefa aberta ou parcela não paga.
- A ordem das etapas é `['ideia', 'prototipo', 'apresentado', 'valor_definido', 'teste', 'andamento', 'entregue']` (`ORDEM_ETAPAS` em `server/domain/orcamentos.js`). Exporte essa constante de lá e use-a; não crie uma cópia.
- Parcela atrasada = `estadoParcela(p, hoje) === 'atrasada'` (`server/domain/financeiro.js`). Venda de placa atrasada = `vendasPlacasComoParcelas(db, hoje)` com `estado === 'atrasada'`. Iguais ao `/api/painel`.
- Tarefa vencida = `concluida = 0` e `prazo` no formato `AAAA-MM-DD` com data menor que hoje. Prazo vazio ou fora desse formato nunca vence.
- Os três serviços entram, cada um na sua seção, nesta ordem: `site_sistema`, `google_meu_negocio`, `placas_nfc`.
- Nenhuma dependência nova no `package.json`. Nenhuma migration nova: o caminho do cérebro usa a tabela `config` (chave/valor) que já existe.
- A pasta do cérebro nunca guarda senha, token ou chave.
- Textos de tela e de relatório em português, diretos, sem jargão.
- Commits em Conventional Commits, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pasta do cérebro não configurada, apagada ou com arquivo quebrado** (`rotinas.json` com JSON inválido, skill sem frontmatter): `/api/cerebro` responde 200 com o que conseguiu ler e um `avisos[]` legível, e a tela continua desenhando memória e apps. Testes na Task 5.
2. **CRM sem nenhum projeto** (banco novo) **ou com projeto sem prazo, sem parcela e sem tarefa**: o relatório volta com seções vazias e nada quebra. Testes na Task 2.
3. **Números que não batem com o Início**: a contagem de atrasadas do relatório tem que ser igual à de `/api/painel` com os mesmos dados. Teste na Task 2.
4. **Muitos pontos numa área** (centenas de tarefas): a tela não trava e os pontos não "pulam" de lugar a cada recarga (a posição depende só do id). Teste na Task 6.
5. **Celular**: com 375 px de largura, os anéis cabem sem rolagem lateral e o painel de detalhe abre como folha de baixo. Verificado no Chrome na Task 7.

**Desvio consciente do spec:** o spec pedia que a skill usasse as rotas que já existem antes de pedir rota nova. O plano cria `GET /api/cerebro/projetos` porque montar o relatório juntando `/painel`, `/projetos`, `/parcelas` e `/tarefas` na conversa faria o Claude recalcular regras a cada vez. O risco é justamente o anti-objetivo "números que não batem". Com a rota, as regras ficam num lugar só e testado, e a tela reaproveita as mesmas.

---

### Task 0: Commitar o spec e o plano

- [ ] **Step 1:** `git add docs/superpowers/specs/2026-11-12-cerebro-madia-design.md docs/superpowers/plans/2026-11-12-cerebro-madia.md && git commit -m "docs: desenho e plano do cérebro da Madia"`

### Task 1: Pasta `Cerebro-Madia` com o centro, apps e rotinas

Repositório separado, ao lado do CRM: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Cerebro-Madia`.

**Files (todos novos, no repositório `Cerebro-Madia`):**
- `CLAUDE.md`
- `README.md`
- `apps.json`
- `rotinas.json`
- `relatorios/.gitkeep`
- `.gitignore` (vazio de regras, só um comentário: a pasta é versionada inteira)

**Interfaces:**
- Produces: formato de `apps.json` e `rotinas.json`, lido pela Task 5.

```json
// apps.json
[{ "id": "vercel", "nome": "Vercel", "para_que": "Hospedagem dos sites", "conexao": "crm:vercel_token" }]
// conexao: "crm:<chave da tabela config>" (conectado se a chave tiver valor) ou "manual" (sempre "não conectado ao CRM")

// rotinas.json
[{ "id": "checar-sites", "nome": "Checar sites no ar", "o_que_faz": "...", "frequencia": "a cada 5 minutos",
   "estado": "ativa", "onde_roda": "CRM (server/index.js)", "ultima_execucao": null }]
// estado: "ativa" | "planejada"
```

- [ ] **Step 1: Criar a pasta e `git init`** (branch `main`).
- [ ] **Step 2: Escrever `CLAUDE.md`** com estas seções, nesta ordem:
  1. `# Madia Consultoria`: quem é, em 2–3 frases. Os três serviços com os nomes do CRM: `site_sistema`, `google_meu_negocio`, `placas_nfc`.
  2. `## Como a Madia trabalha`: o ciclo proposta → aprovação → implementação → entrega em fases. Aponta para a seção "Estrutura de proposta de escopo" de `~/.claude/CLAUDE.md`, sem copiar.
  3. `## Onde está cada coisa`: a tabela "Onde as coisas ficam" do spec, com caminhos absolutos.
  4. `## Como ler o CRM`: base `http://127.0.0.1:5174/api`, a rota `GET /cerebro/projetos` e a regra "só GET; nunca escrever no CRM sem o Lucca pedir; se o CRM não responder, avise e pare".
  5. `## Padrão de relatório`: português, direto, o que pede ação primeiro, valores em R$ com duas casas.
  6. `## Regras desta pasta`: nunca guardar senha, token ou chave aqui.
- [ ] **Step 3: Escrever `apps.json`.** Vercel → `crm:vercel_token`. Instagram → `crm:instagram_token`. Figma, Supabase, Gmail e GitHub → `manual`.
- [ ] **Step 4: Escrever `rotinas.json`**, com quatro itens:
  - `checar-sites`: ativa, a cada 5 minutos.
  - `sync-instagram`: ativa, ao iniciar e a cada 6 horas.
  - `publicar-agendados`: ativa, a cada 60 segundos.
  - `relatorio-semanal`: planejada, toda segunda.

  `onde_roda` das três ativas: `CRM (server/index.js)`.
- [ ] **Step 5: Escrever `README.md`.** O que é a pasta, como abrir uma sessão do Claude nela e o que cada arquivo faz, em uma linha cada.
- [ ] **Step 6: Verificar o JSON.**
  Run: `node -e "JSON.parse(require('fs').readFileSync('apps.json'));JSON.parse(require('fs').readFileSync('rotinas.json'));console.log('ok')"`
  Expected: `ok`
- [ ] **Step 7: Commit no repositório `Cerebro-Madia`.**
  `git add -A && git commit -m "feat: cria a pasta do cérebro da Madia com regras, apps e rotinas"`

---

### Task 2: Rota `GET /api/cerebro/projetos` (dados do relatório)

**Files:**
- Modify: `server/domain/orcamentos.js:74`: `export const ORDEM_ETAPAS`.
- Create: `server/domain/cerebro.js`: funções puras.
- Create: `server/domain/cerebro.test.js`
- Create: `server/routes/cerebro.js`: `rotasCerebro(ctx)`, só a rota `/cerebro/projetos` nesta task.
- Create: `server/routes/cerebro.test.js`
- Modify: `server/app.js`: `app.use('/api', rotasCerebro(ctx));` junto das outras rotas `/api`.

**Interfaces:**
- Produces (domínio, `server/domain/cerebro.js`):
  - `tarefaVencida(tarefa: {concluida, prazo}, hoje: string): boolean`
  - `entregueRelevante(projeto, {tarefasAbertas: number, parcelasAbertas: number}, hoje: string): boolean`: regra dos 30 dias **ou** algo pendurado.
  - `SERVICOS_ORDEM = ['site_sistema', 'google_meu_negocio', 'placas_nfc']`
- Produces (HTTP): `GET /api/cerebro/projetos` →

```js
{
  gerado_em: 'AAAA-MM-DD',
  pede_acao: {
    projetos_atrasados: [{ projeto_id, titulo, cliente_nome, servico, prazo_entrega }],
    parcelas_atrasadas: { quantidade, total_centavos, itens: [{ projeto_id|null, titulo, cliente_nome, valor_centavos, vencimento }] },
    sites_fora_do_ar: [{ projeto_id, titulo, url, status_desde }],
    tarefas_vencidas: [{ tarefa_id, texto, prazo, projeto_id, projeto_titulo }],
  },
  servicos: [ // sempre os 3, na ordem de SERVICOS_ORDEM
    { servico, nao_entregues: [Ficha], entregues: [Ficha] },
  ],
  numeros: { por_etapa: { [etapa]: number }, a_receber_centavos, vencido_centavos },
}
// Ficha = { projeto_id, titulo, cliente_id, cliente_nome, etapa, prazo_entrega, atrasado: boolean, data_entrega,
//           tarefas: { feitas, total, abertas: [{ id, texto, prazo, vencida }] },
//           parcelas: { pagas_centavos, atrasadas_centavos, a_vencer_centavos },
//           mensalidade: { ativa: boolean, valor_centavos } }
// nao_entregues de site_sistema vem ordenado por ORDEM_ETAPAS e depois por prazo_entrega (nulos por último).
```

- "Projeto atrasado" = não entregue, `prazo_entrega` preenchido e menor que hoje.
- `parcelas_atrasadas` junta as parcelas atrasadas e as vendas de placa atrasadas, exatamente como `atrasadas` em `server/routes/painel.js`.
- A rota chama `gerarTodasMensalidades(db, hoje())` antes de ler, igual ao painel.

- [ ] **Step 1: Testes de domínio** em `server/domain/cerebro.test.js`:
  - `tarefaVencida`:
    - `{concluida:0, prazo:'2026-09-22'}` com hoje `'2026-09-23'` → `true`
    - prazo `'2026-09-23'` → `false`
    - prazo `null` → `false`
    - prazo `'sexta'` → `false`
    - `concluida:1` com prazo passado → `false`
  - `entregueRelevante`:
    - entregue em `'2026-08-25'`, hoje `'2026-09-23'`, nada aberto → `true` (29 dias)
    - entregue em `'2026-08-20'`, nada aberto → `false`
    - entregue em `'2026-08-20'` com `parcelasAbertas: 1` → `true`
- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run server/domain/cerebro.test.js`. Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implementar `server/domain/cerebro.js`** e exportar `ORDEM_ETAPAS` em `orcamentos.js`.
- [ ] **Step 4: Testes de rota** em `server/routes/cerebro.test.js`, usando `criarContexto({ hoje: '2026-09-23' })` e criando os dados pela API, como em `painel.test.js`:
  - `'banco vazio devolve os três serviços com listas vazias'` → `servicos.map(s => s.servico)` igual a `SERVICOS_ORDEM`, todas as listas `[]`, e `numeros.a_receber_centavos === 0`.
  - `'separa não entregues por serviço e ordena pelo funil'`: um site em `andamento`, um em `ideia` e um GMN em `andamento` → em `site_sistema.nao_entregues` vêm `['ideia','andamento']`; em `google_meu_negocio.nao_entregues` vem 1.
  - `'deixa de fora fictícios e perdidos'`.
  - `'entregue antigo sem pendência fica de fora; com parcela aberta entra'`.
  - `'projeto com prazo passado aparece em pede_acao.projetos_atrasados'`.
  - `'tarefa sem prazo não vence'`: tarefa criada sem `prazo` não aparece em `tarefas_vencidas`.
  - `'parcelas atrasadas batem com o painel'`: mesmos dados do primeiro teste de `painel.test.js` → `pede_acao.parcelas_atrasadas.quantidade` e `.total_centavos` iguais a `cartoes.atrasadas` de `GET /api/painel`.
  - `'site fora do ar aparece em pede_acao'`: inserir em `hospedagens` direto pelo `ctx.db` com `status = 'fora_do_ar'`.
- [ ] **Step 5: Rodar e ver falhar.** Run: `npx vitest run server/routes/cerebro.test.js`. Expected: FAIL (404).
- [ ] **Step 6: Implementar `rotasCerebro`** com a rota `/cerebro/projetos` e registrar em `server/app.js`. Para não repetir lógica, as consultas reaproveitam `vendasPlacasComoParcelas`, `estadoParcela` e `gerarTodasMensalidades`.
- [ ] **Step 7: Rodar os dois arquivos e o painel.** Run: `npx vitest run server/domain/cerebro.test.js server/routes/cerebro.test.js server/routes/painel.test.js server/domain/orcamentos`. Expected: PASS.
- [ ] **Step 8: Commit.** `feat: rota de leitura com o relatório de projetos para o cérebro`

---

### Task 3: Skill `relatorio-projetos`

**Files (repositório `Cerebro-Madia`):**
- Create: `.claude/skills/relatorio-projetos/SKILL.md`

**Interfaces:**
- Consumes: `GET http://127.0.0.1:5174/api/cerebro/projetos` (Task 2).

- [ ] **Step 1: Escrever o frontmatter.**
  - `name: relatorio-projetos`
  - `description`: dispara com "relatório dos projetos", "projetos pendentes", "como estão os projetos", "o que falta entregar".
- [ ] **Step 2: Escrever as instruções da skill:**
  1. Buscar a rota com `curl -s` (ou `Invoke-RestMethod` no PowerShell). Se falhar, responder: "O CRM não está respondendo em 127.0.0.1:5174. Abra o CRM (pm2) e peça de novo." e parar.
  2. Montar o relatório em Markdown nesta ordem:
     - `## Pede ação agora`, com as 4 listas de `pede_acao`; seções vazias são omitidas; se todas estiverem vazias, escrever "Nada pedindo ação hoje.".
     - Uma seção `##` por serviço, com os títulos "Sites e sistemas", "Google Meu Negócio" e "Placas NFC". Em sites, "Não entregues" agrupados por etapa. Em GMN e placas, "Para entregar" e "Entregues".
     - `## Números`.
  3. Formato da ficha, uma linha de cabeçalho + bullets:
     - `**Título** — Cliente · etapa · prazo DD/MM (atrasado)`
     - tarefas `feitas/total` + as abertas
     - parcelas pagas / atrasadas / a vencer em R$
     - mensalidade, se ativa
  4. Salvar em `relatorios/AAAA-MM-DD-projetos.md` (data de `gerado_em`), sobrescrevendo se existir, e mostrar o mesmo texto na conversa.
  5. Nunca chamar outra rota que não seja `GET`.
- [ ] **Step 3: Teste de aceite (manual, com o CRM no ar).** Abrir uma sessão nova do Claude na pasta `Cerebro-Madia` e pedir só "organiza um relatório dos projetos pendentes". Expected: o arquivo é criado, e os números de atrasadas batem com o card "Atrasadas" do Início do CRM.
  Este passo depende da Task 2 estar no ar (`npm run build && pm2 restart crm-madia-api`). **Só reinicie o pm2 com a autorização do Lucca.**
- [ ] **Step 4: Commit no `Cerebro-Madia`.** `feat: skill de relatório de projetos lendo o CRM`

---

### Task 4: Caminho da pasta do cérebro em Configurações

**Files:**
- Modify: `server/routes/publicacao.js` (onde ficam `GET/PUT /config`): nova chave `cerebro_path`.
- Modify: `server/routes/publicacao.test.js`
- Modify: `web/src/pages/Config.jsx`: nova seção "Pasta do cérebro", logo depois de "Repositório do portfólio".
- Modify: `web/src/pages/Config.test.jsx`

**Interfaces:**
- Produces: `obterConfig(db, 'cerebro_path')` → `string | null`. A Task 5 usa.

- [ ] **Step 1: Testes do servidor:**
  - `PUT /api/config {cerebro_path: <pasta temporária existente>}` → 200, e `GET /api/config` devolve o caminho.
  - `PUT` com pasta inexistente → 400 com `erros[0].campo === 'cerebro_path'` e a mensagem `'Pasta não encontrada: <caminho>'`.
  - `PUT {cerebro_path: ''}` → 200 e limpa o valor (volta `null`).
- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run server/routes/publicacao.test.js`.
- [ ] **Step 3: Implementar.** Validar só "existe e é pasta" (`statSync(...).isDirectory()`). Não exigir `CLAUDE.md` dentro: a Task 5 avisa quando faltar.
- [ ] **Step 4: Teste da tela.** Mesmo padrão do primeiro teste de `Config.test.jsx`: o rótulo `'Caminho da pasta do cérebro'`, o botão `'Salvar pasta do cérebro'` e o erro aparece ao lado do campo.
- [ ] **Step 5: Implementar a seção na tela** reaproveitando `Campo`, `Aviso` e o mesmo fluxo de salvar do portfólio. Placeholder: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Cerebro-Madia`.
- [ ] **Step 6: Rodar.** Run: `npx vitest run server/routes/publicacao.test.js web/src/pages/Config.test.jsx`. Expected: PASS.
- [ ] **Step 7: Commit.** `feat: configurar a pasta do cérebro`

---

### Task 5: Rota `GET /api/cerebro` (tudo que a tela desenha)

**Files:**
- Create: `server/cerebro/pasta.js`: `lerPasta(caminho: string | null)`
- Create: `server/cerebro/pasta.test.js`
- Create: `server/cerebro/memoria.js`: `montarMemoria(db, hoje: string)`
- Create: `server/cerebro/memoria.test.js`
- Modify: `server/routes/cerebro.js`: adiciona `GET /cerebro`.
- Modify: `server/routes/cerebro.test.js`

**Interfaces:**
- Consumes: `obterConfig(db, 'cerebro_path')` (Task 4). `tarefaVencida` e `entregueRelevante` (Task 2). O formato de `apps.json` e `rotinas.json` (Task 1).
- Produces:

```js
// lerPasta(caminho) →
{ configurada: boolean,
  centro: { texto: string } | null,
  skills: [{ id, nome, descricao }],          // de .claude/skills/*/SKILL.md (frontmatter name/description)
  rotinas: [{ id, nome, o_que_faz, frequencia, estado, ultima_execucao }],
  apps_base: [{ id, nome, para_que, conexao }],
  avisos: [string] }                          // ex.: 'rotinas.json não é um JSON válido'

// montarMemoria(db, hoje) →
{ areas: [{ id, rotulo, pontos: [{ id: 'projeto:12', rotulo, destaque: boolean, link: '/projetos/12', resumo: string }] }] }
// ordem e ids das áreas: clientes, comercial, projetos, processos, administrativo, conteudo

// GET /api/cerebro →
{ centro, skills, rotinas, apps: [{ ...app, conectado: boolean }], memoria: { areas }, pede_atencao: [{ texto, tom, para }], avisos }
```

- Áreas e pontos:

  | Área | Pontos |
  |---|---|
  | `clientes` | cada cliente |
  | `comercial` | projetos (não fictícios) em `ideia`, `apresentado`, `valor_definido`, `teste` + orçamentos |
  | `projetos` | projetos em `prototipo` e `andamento` + entregues em que `entregueRelevante` é verdadeiro |
  | `processos` | tarefas não concluídas |
  | `administrativo` | parcelas não pagas + hospedagens + ferramentas não canceladas |
  | `conteudo` | conteúdos |

  Projetos `perdido` e fictícios ficam fora.
- `destaque = true` quando o ponto é:
  - projeto atrasado;
  - parcela atrasada;
  - hospedagem `fora_do_ar`;
  - tarefa vencida.
- `pede_atencao` usa o formato de `PedeAtencao` e é montado com a mesma contagem de `pede_acao` da Task 2, sem cálculo novo:
  - `'N projetos atrasados'` → `perigo`
  - `'N parcelas atrasadas'` → `perigo`
  - `'N sites fora do ar'` → `perigo`
  - `'N tarefas vencidas'` → `atencao`

  Itens com N = 0 são omitidos.
- `apps[].conectado` = `conexao` começa com `crm:` e `obterConfig(db, chave)` tem valor. Os de `manual` saem `false`.

- [ ] **Step 1: Testes de `lerPasta`.** Montar pastas temporárias com `mkdtempSync`:
  - `null` → `{configurada:false, centro:null, skills:[], rotinas:[], apps_base:[], avisos:[]}`
  - pasta inexistente → `configurada:false` e `avisos` contendo `'Pasta do cérebro não encontrada'`
  - pasta completa → centro com o texto, 1 skill `{id:'relatorio-projetos', nome:'relatorio-projetos', descricao:'...'}`, rotinas e apps lidos
  - `rotinas.json` inválido → `rotinas: []` e aviso `'rotinas.json não é um JSON válido'`; o resto continua lido
  - `SKILL.md` sem frontmatter → a skill entra com `nome` = nome da pasta e `descricao: ''`
- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run server/cerebro/pasta.test.js`.
- [ ] **Step 3: Implementar `lerPasta`** com `node:fs` síncrono. O frontmatter é lido à mão: o bloco entre as duas primeiras linhas `---`, só as linhas `chave: valor`.
- [ ] **Step 4: Testes de `montarMemoria`.** Usar `criarContexto` e criar os dados pela API:
  - as 6 áreas sempre presentes, na ordem
  - projeto `teste` em `comercial` e não em `projetos`
  - projeto `prototipo` em `projetos`
  - nenhum id aparece em duas áreas (conferir com `Set`)
  - fictício e perdido ausentes
  - tarefa vencida com `destaque: true` e `link: '/projetos/<id>'`
- [ ] **Step 5: Implementar `montarMemoria`.** Links:
  - cliente → `/clientes/:id`
  - projeto, tarefa e parcela → `/projetos/:projeto_id`
  - orçamento → `/orcamentos/:id`
  - hospedagem → `/projetos/:projeto_id`
  - ferramenta → `/financeiro`
  - conteúdo → `/conteudo`
- [ ] **Step 6: Testes da rota `GET /api/cerebro`:**
  - sem `cerebro_path` → 200, `centro: null`, `memoria.areas.length === 6`, `apps: []`
  - com pasta válida e `vercel_token` definido via `definirConfig` → app `vercel` com `conectado: true` e `figma` com `conectado: false`
  - `pede_atencao` com 1 projeto atrasado → `[{ texto: '1 projeto atrasado', tom: 'perigo', para: '/projetos/<id>' }]`

  Para N = 1, use o singular. O `para` aponta para o projeto quando há só um; quando há mais de um, para `/servicos?aba=sites`.
- [ ] **Step 7: Implementar a rota** em `server/routes/cerebro.js`.
- [ ] **Step 8: Rodar.** Run: `npx vitest run server/cerebro server/routes/cerebro.test.js`. Expected: PASS.
- [ ] **Step 9: Commit.** `feat: rota com a pasta e a memória do cérebro para a tela`

---

### Task 6: Tela `/cerebro` em anéis

**Files:**
- Create: `web/src/pages/Cerebro.jsx`: busca `api('/cerebro')`, monta `PedeAtencao` + `AneisCerebro` + `PainelPonto`.
- Create: `web/src/pages/Cerebro.test.jsx`
- Create: `web/src/pages/cerebro/AneisCerebro.jsx`: o SVG.
- Create: `web/src/pages/cerebro/posicoes.js`: `posicionarPontos(areas, raioInterno, raioExterno)` → `[{ id, area, x, y }]`, determinístico.
- Create: `web/src/pages/cerebro/posicoes.test.js`
- Create: `web/src/pages/cerebro/PainelPonto.jsx`: painel lateral (folha de baixo em telas estreitas).
- Create: `web/src/pages/cerebro/cerebro.css`: importado pela página, com as variáveis de cor do tema.
- Modify: `web/src/App.jsx`: `<Route path="/cerebro" element={<Cerebro />} />`.
- Modify: `web/src/components/Sidebar.jsx`: item `{ para: '/cerebro', rotulo: 'Cérebro', icone: 'cerebro' }`, depois de "Tarefas".
- Modify: `web/src/components/Icone.jsx`: ícone `cerebro`, no mesmo estilo de traço dos outros.

**Interfaces:**
- Consumes: a resposta de `GET /api/cerebro` (Task 5). `PedeAtencao({ itens })`.

**Desenho (viewBox `0 0 600 600`, centro 300,300):**

| Anel | Raio | Conteúdo |
|---|---|---|
| Centro | r = 22 | Rótulo "CLAUDE.md" |
| Skills | r = 70 | Círculo tracejado com as skills distribuídas |
| Memória | de 95 a 200 | Fatias iguais por área, com rótulo da área |
| Rotinas | r = 235 | Ponto cheio = ativa, vazado = planejada |
| Apps | r = 275 | Hexágonos; aceso = conectado, apagado = não conectado |

- Ponto com `destaque` ganha a cor de perigo do tema e um anel de brilho.
- A animação respeita `prefers-reduced-motion` (sem animação nesse caso).
- Sem pasta configurada: o centro mostra "Configure a pasta do cérebro" com link para `/configuracoes`.

- [ ] **Step 1: Testes de `posicionarPontos`:**
  - mesma entrada → mesma saída (determinístico)
  - adicionar um ponto novo numa área não muda a posição dos outros pontos da **mesma área**; use semente por id, sem depender do índice
  - todos os pontos dentro da fatia angular da sua área e entre os raios
  - 500 pontos numa área → roda em menos de 50 ms
- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run web/src/pages/cerebro/posicoes.test.js`.
- [ ] **Step 3: Implementar `posicionarPontos`.** Ângulo e raio vêm de um hash do `id` (ex.: FNV-1a), dentro da fatia da área.
- [ ] **Step 4: Testes da página** em `Cerebro.test.jsx`, com `mockApi`/`renderizar`:
  - com dados completos: mostra o texto de `pede_atencao` e os rótulos das 6 áreas
  - clicar num ponto (`role="button"` com `aria-label` = rótulo do ponto) abre o painel com o resumo e um link "Abrir no CRM" com o `href` do `link`
  - `centro: null` → mostra o link "Configure a pasta do cérebro"
  - `avisos` não vazio → os avisos aparecem num `Aviso`
  - clicar no rótulo de uma área aproxima aquela fatia (o `viewBox` do SVG muda) e um botão "Ver tudo" volta ao anel inteiro
- [ ] **Step 5: Implementar a página, o SVG e o painel.** Cada ponto é um `<circle>` com `role="button"`, `tabIndex=0` e `aria-label`. Enter ou espaço abrem o painel. O `<title>` mostra o nome ao passar o mouse.
- [ ] **Step 6: Rodar.** Run: `npx vitest run web/src/pages/Cerebro.test.jsx web/src/pages/cerebro web/src/App.test.jsx`. Expected: PASS.
- [ ] **Step 7: Commit.** `feat: tela do cérebro em anéis no CRM`

---

### Task 7: Verificação final

- [ ] **Step 1: Suíte inteira e build.** Run: `npm test && npm run build`. Expected: todos passam, build sem erro.
- [ ] **Step 2: Rodar em desenvolvimento** (`npm run dev`, porta 5173, sem mexer no pm2).
- [ ] **Step 3: Checar no Chrome, como o Lucca usaria.** Configurar a pasta em Configurações e abrir `/cerebro`.
  - Os anéis aparecem e o ponto em destaque bate com o Início.
  - O clique abre o painel e "Abrir no CRM" leva à página certa.
  - Com 375 px de largura, não há rolagem lateral e o painel abre como folha de baixo.
- [ ] **Step 4: Publicar no pm2**, só com a autorização do Lucca. Não há migration nova, então basta `npm run build && pm2 restart crm-madia-api`. Depois, rodar o teste de aceite da Task 3.
