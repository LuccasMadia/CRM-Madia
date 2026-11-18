# Mission Control (novo Início) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Início (`/`) no Mission Control. O topo mostra números em R$, a esquerda um to-do com criação rápida e a direita o resumo do dia (pede ação, follow-ups, para entregar, divulgação e agenda reservada). Os gráficos ficam embaixo.

**Architecture:** `GET /api/painel` ganha os campos novos, calculados no servidor com as funções que já existem (`pedeAtencao` do cérebro, `alertasOrcamento`, o mesmo conjunto de parcelas pagas dos gráficos). O front troca o `Inicio.jsx` por uma montagem de componentes pequenos em `web/src/pages/inicio/`.

**Tech Stack:** Node ≥ 24, Express 5, SQLite (`node:sqlite`), React 19 + react-router 8, Vitest + supertest + testing-library.

**Spec:** `docs/superpowers/specs/2026-11-18-mission-control-design.md`

## Global Constraints

- **Sem migration e sem dependência nova.**
- Os campos atuais de `/api/painel` **ficam** (`cartoes.*`, `para_entregar`, `tarefas_por_projeto`, `divulgacao`). Só entram campos novos.
- **Todo valor em R$ na tela** passa por `formatarDinheiro` (`web/src/lib/dinheiro.js`), para o "ocultar valores" esconder.
- **Os números batem com as outras telas:**
  - "Recebido no mês" é o mesmo do Financeiro › Visão geral.
  - "Vencido" é o mesmo `cartoes.atrasadas`.
  - "Pede ação" é o mesmo `pede_atencao` do cérebro.
  - "Orçamento sem resposta" é o mesmo `alertasOrcamento(...).sem_resposta`.
- **Fictícios** ficam fora de tudo que é novo. **Perdidos** ficam fora do to-do e dos follow-ups.
- **Textos de tela**, exatos:
  - título: "Mission Control"
  - sobretítulo: "Olá, Lucca"
  - campo: "Nova tarefa", botão: "Adicionar"
  - link: "Ver todas (N)"
  - follow-ups vazios: "Ninguém esperando por você."
  - agenda: "Agenda do dia — em breve (Google Agenda)"
  - O menu continua "Início".
- **Commits** em Conventional Commits, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **CRM vazio** (banco novo): o Início abre com zeros, to-do vazio e follow-ups com "Ninguém esperando por você.", sem quebrar. Testes nas Tasks 1, 2 e 4.
2. **Tarefa sem projeto e sem cliente** no to-do e em "aguardando cliente": o link vai para `/tarefas` e o grupo se chama "Sem cliente". Testes nas Tasks 2 e 3.
3. **Falha ao criar ou concluir tarefa** (erro 400 ou 500): mostra um aviso, a tarefa não some da lista e o texto digitado não se perde. Teste na Task 3.
4. **Prazo em formato que não é data** (texto livre, que o CRM aceita): nunca conta como atrasado e não quebra a ordenação. Teste na Task 2.
5. **Ocultar valores ligado:** nenhum R$ aparece na página. Teste na Task 4.

---

### Task 1: Painel — recebido no mês, detalhe de andamento e pede ação

**Files:**
- Create: `server/cerebro/pedeAtencao.js`. Move para cá a função `pedeAtencao(pede_acao)` que hoje vive dentro de `server/routes/cerebro.js` (linha 11), **sem mudar o comportamento**.
- Modify: `server/routes/cerebro.js`, que passa a importar de lá.
- Modify: `server/routes/painel.js`
- Test: `server/routes/painel.test.js`

**Interfaces:**
- Produces:
  - `pedeAtencao(pede_acao) → [{ texto, tom, para }]`, exportada de `server/cerebro/pedeAtencao.js`.
  - Em `server/routes/painel.js`, a função interna `parcelasPagas(db, dia)` → o mesmo conjunto que `/painel/graficos` usa hoje (parcelas pagas de projeto não fictício, mais vendas de placa com `pago_em`). `/painel/graficos` passa a usá-la também.
  - `GET /api/painel` ganha:
    - `cartoes.recebido_mes_centavos: number`: soma de `parcelasPagas` com `pago_em` no mês de `hoje`.
    - `cartoes.em_andamento_detalhe: { prototipo: number, andamento: number }`: a mesma base de `em_andamento` (site/sistema, não fictício).
    - `pede_atencao`: `pedeAtencao(montarRelatorioProjetos(db, dia).pede_acao)`.

- [ ] **Step 1: Testes** em `painel.test.js`:
  - `'recebido no mês soma parcelas e placas pagas no mês atual e ignora outro mês e fictício'`: hoje `'2026-09-23'`. Parcela paga em `'2026-09-10'` de 1000, parcela paga em `'2026-08-30'` de 500, parcela paga de projeto fictício de 700 → `recebido_mes_centavos === 1000`.
  - `'recebido no mês bate com o mês atual de /painel/graficos'`: o mesmo valor que `recebido_por_mes` traz para `'2026-09'`.
  - `'em_andamento_detalhe separa protótipo e versão final e soma em_andamento'`: `prototipo + andamento === em_andamento`.
  - `'pede_atencao é igual ao do cérebro'`: com 1 parcela atrasada, `body.pede_atencao` é igual a `GET /api/cerebro`.body.pede_atencao.
  - `'banco vazio: recebido 0, detalhe {0,0}, pede_atencao []'`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run server/routes/painel.test.js`.
- [ ] **Step 3: Implementar.** Mover `pedeAtencao`, criar `parcelasPagas` e acrescentar os três campos.
- [ ] **Step 4: Rodar.** `npx vitest run server/routes/painel.test.js server/routes/cerebro.test.js` → PASS. Os testes do cérebro passam sem mudança.
- [ ] **Step 5: Commit.** `feat: painel com recebido no mês, detalhe de andamento e pede ação`

---

### Task 2: Painel — tarefas abertas e follow-ups

**Files:**
- Modify: `server/routes/painel.js`. Se o arquivo crescer demais, criar `server/domain/missao.js` com funções puras de ordenação e agrupamento.
- Test: `server/routes/painel.test.js` e, se existir, `server/domain/missao.test.js`.

**Interfaces:**
- Consumes: `alertasOrcamento(o, hoje)` de `server/domain/orcamentos.js`, que precisa de `o.data`, `o.validade_dias`, `o.situacao` e `o.mexido_em`. Também `tarefaVencida(t, hoje)` de `server/domain/cerebro.js` e o helper de diferença de dias que `orcamentos.js` já usa (`diasEntre`).
- Produces, em `GET /api/painel`:
  - **`tarefas_abertas: { total, itens }`**, com no máximo 15 itens.
    - Cada item: `{ id, texto, prazo, etapa, projeto_id, projeto_titulo, cliente_id, cliente_nome, dias_atraso, link }`.
    - **Filtro:** `concluida = 0` e `(projeto_id IS NULL OR (p.ficticio = 0 AND p.etapa <> 'perdido'))`, com `LEFT JOIN` em projetos e clientes. O cliente sai de `t.cliente_id`.
    - **`dias_atraso`:** os dias desde o prazo quando `tarefaVencida`. Caso contrário, 0.
    - **`link`:** `/projetos/:projeto_id`; se não houver projeto, `/clientes/:cliente_id`; se não houver nenhum dos dois, `/tarefas`.
    - **Ordem:** primeiro as vencidas, com o maior `dias_atraso` antes. Depois as que têm prazo válido (`AAAA-MM-DD`), pelo prazo. Depois as sem prazo ou com prazo inválido, por `criado_em` decrescente.
    - **`total`:** quantas tarefas passam no filtro, sem o corte de 15.
  - **`follow_ups: { orcamentos, projetos, aguardando }`**
    - `orcamentos`: `[{ id, cliente_nome, dias, link: '/orcamentos/:id' }]`. Só os orçamentos `situacao = 'enviado'` com `alertasOrcamento(o, hoje).sem_resposta`. `dias` = dias desde `o.data`. Do mais antigo para o mais novo.
    - `projetos`: `[{ id, titulo, cliente_nome, dias, link: '/projetos/:id' }]`. Projetos com `servico = 'site_sistema'`, `ficticio = 0`, etapa em `('prototipo', 'apresentado', 'valor_definido', 'teste', 'andamento')` e `atualizado_em` (a parte da data) há **mais de 14 dias**. Do mais parado para o menos.
    - `aguardando`: `[{ cliente_id, cliente_nome, quantidade, link }]`. Tarefas abertas na etapa `aguardando_cliente`, com o mesmo filtro do to-do, agrupadas por `cliente_id`.
      - Com `cliente_id` nulo: `cliente_nome: 'Sem cliente'` e `link: '/tarefas'`. Com cliente: `link: '/clientes/:id'`.
      - Ordem: maior quantidade primeiro.

- [ ] **Step 1: Testes.** Hoje `'2026-09-23'`. Dados criados pela API e, quando precisar, direto no `ctx.db` (por exemplo para `atualizado_em`, `data` do orçamento ou `etapa`).
  - `'tarefas abertas: vencidas primeiro, depois por prazo, depois sem prazo da mais nova'`.
  - `'tarefa com prazo que não é data não conta como atrasada e vai para o fim'`: prazo `'sexta'` → `dias_atraso === 0`.
  - `'inclui tarefa interna e exclui fictício, perdido e concluída'`.
  - `'link da tarefa: projeto, senão cliente, senão /tarefas'`.
  - `'corta em 15 e total conta todas'`: 18 tarefas → `itens.length === 15` e `total === 18`.
  - `'orçamento enviado há 8 dias aparece; há 7 não; rascunho não'`.
  - `'projeto de site parado há 15 dias aparece; GMN parado, entregue e fictício não'`.
  - `'aguardando cliente agrupa por cliente e junta sem cliente em Sem cliente'`.
  - `'banco vazio: tarefas_abertas {total 0, itens []} e follow_ups com listas vazias'`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run server/routes/painel.test.js`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar.** `npx vitest run server/routes/painel.test.js server/domain` → PASS.
- [ ] **Step 5: Commit.** `feat: painel com tarefas abertas e follow-ups`

---

### Task 3: Componentes do Mission Control

**Files:**
- Modify: `web/src/components/Numero.jsx`. Nova prop opcional `para`: quando existe, o cartão inteiro vira um `Link` do react-router, com o mesmo visual e um estado de foco visível.
- Create: `web/src/pages/inicio/TodoInicio.jsx` e `web/src/pages/inicio/TodoInicio.test.jsx`.
- Create: `web/src/pages/inicio/ResumoDia.jsx` e `web/src/pages/inicio/ResumoDia.test.jsx`.

**Interfaces:**
- Consumes: os campos das Tasks 1 e 2. `PedeAtencao({ itens })`. `ROTULO_ETAPA_TAREFA` e as classes `etiqueta--andamento` e `etiqueta--aguardando` (`web/src/lib/rotulos.js` e o `Inicio.jsx` atual). `api()` de `web/src/api/client.js`.
- Produces:
  - **`<TodoInicio tarefas={tarefas_abertas} aoMudar={() => void} />`**
    - Campo "Nova tarefa" (rótulo acessível "Nova tarefa") e botão "Adicionar". Enter também adiciona.
      - Faz `POST /tarefas` com `{ texto }`.
      - Texto vazio ou só com espaços não envia.
      - Deu certo: limpa o campo e chama `aoMudar()`.
      - Deu erro: mostra `Aviso` e mantém o texto.
    - Cada linha:
      - Caixa de seleção "Concluir: <texto>", que faz `PUT /tarefas/:id` com `{ concluida: true }`. Deu certo: chama `aoMudar()`. Deu erro: mostra `Aviso` e a linha continua.
      - O texto, com link `link` quando ele não for `/tarefas`.
      - O projeto ou o cliente em texto menor.
      - Etiquetas: "atrasada Nd" (classe `item-atrasado`) quando `dias_atraso > 0`, e a etiqueta da etapa para `fazendo` e `aguardando_cliente`.
    - Link "Ver todas (N)" para `/tarefas` quando `total > itens.length`.
    - Vazio: "Nenhuma tarefa aberta."
  - **`<ResumoDia pedeAtencao followUps paraEntregar divulgacao />`**, com os blocos nesta ordem e com estes títulos:
    1. "Pede ação": `<PedeAtencao itens>`.
    2. "Follow-ups": orçamentos ("Orçamento · {cliente} · enviado há {dias} d"), projetos ("{titulo} · {cliente} · parado há {dias} d") e aguardando ("{cliente} · {n} tarefa(s) aguardando"), cada linha com link. Tudo vazio: "Ninguém esperando por você."
    3. "Para entregar": GMN e Placas NFC a partir de `para_entregar.itens`, com o link `/clientes/:cliente_id?aba=${ABA_DO_SERVICO[servico]}`, como hoje.
    4. "Divulgação": o "Falta divulgar" de hoje, com as etiquetas Instagram/Portfólio.
    5. "Agenda": "Agenda do dia — em breve (Google Agenda)".

- [ ] **Step 1: Testes.**
  - **`TodoInicio`:**
    - `'adiciona com Enter, limpa o campo e chama aoMudar'`.
    - `'texto vazio não envia'`.
    - `'erro ao criar mostra o aviso e mantém o texto'`.
    - `'concluir faz PUT com concluida true'`.
    - `'erro ao concluir mostra o aviso e mantém a linha'`.
    - `'mostra atrasada 3d e aguardando cliente'`.
    - `'Ver todas (18) quando há mais que os itens'`.
  - **`ResumoDia`:**
    - `'mostra os títulos na ordem'`.
    - `'follow-ups vazios mostram Ninguém esperando por você.'`.
    - `'Sem cliente vai para /tarefas'`.
    - `'agenda reservada aparece'`.
  - **`Numero` com `para`:** `'vira link com o href'`. Pode ficar em `ResumoDia.test.jsx` ou num teste próprio.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run web/src/pages/inicio web/src/components/Numero`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar.** O mesmo comando → PASS.
- [ ] **Step 5: Commit.** `feat: componentes do Mission Control (to-do e resumo do dia)`

---

### Task 4: Página do Mission Control

**Files:**
- Modify: `web/src/pages/Inicio.jsx` (reescrita), `web/src/pages/Inicio.test.jsx` (reescrita) e o CSS onde ficam os estilos do Início hoje (procurar `inicio__` em `web/src/styles.css` ou equivalente).

**Interfaces:**
- Consumes: Tasks 1–3, e os componentes `AvisosPublicacao`, `AvisosSites`, `Numero`, `CartaoGrafico`, `Funil` e `GraficoRosca` do `Inicio.jsx` atual.

**A página:**
- **Cabeçalho:** "Olá, Lucca", o título "Mission Control" e a data de hoje, como hoje.
- **Avisos:** `AvisosPublicacao` e `AvisosSites mostrar="fora_do_ar"`, como hoje. O lembrete "N cobranças atrasadas" **sai**.
- **Cinco `Numero` com `para`:**

  | Cartão | Valor | Detalhe | Link |
  |---|---|---|---|
  | Recebido no mês | `formatarDinheiro(recebido_mes_centavos)` | — | `/financeiro` |
  | A receber no mês | `formatarDinheiro(a_receber_mes_centavos)` | — | `/financeiro?aba=recebimentos` |
  | Vencido | `formatarDinheiro(atrasadas.total_centavos)`, com `tom="perigo"` quando a quantidade for maior que 0 | "N parcela(s)" | `/financeiro?aba=recebimentos` |
  | Projetos em andamento | `em_andamento` | "N em protótipo, N em versão final" | `/servicos?aba=sites` |
  | Propostas abertas | `propostas.quantidade` | o total em R$ | `/servicos?aba=sites` |

- **Duas colunas:** `TodoInicio` (cerca de 55%) e `ResumoDia`. Depois do sucesso no to-do, o painel é recarregado (`aoMudar` chama o recarregar do `useCarregar`, ou o equivalente que já existe).
- **Embaixo:** o `Graficos()` atual, sem mudança.
- **Visual:**
  - Números grandes (cerca de 2,5rem, `font-variant-numeric: tabular-nums`).
  - Títulos de seção pequenos, em caixa alta e com espaçamento.
  - Um halo `--primaria` suave atrás da faixa de números.
  - Cartões em `--superficie` com borda sutil.
- **Responsivo:**
  - Até 900px: uma coluna, na ordem números → pede ação → to-do → resto do resumo → gráficos. O to-do sobe para depois do "Pede ação".
  - Celular: os números em grade de 2 colunas.
- **Sai do Início:** "Fictícios em construção" e o bloco "Entregas a clientes". As tarefas de sites agora ficam no to-do, e GMN e placas em "Para entregar".

- [ ] **Step 1: Testes** em `Inicio.test.jsx`, com o `mockApi` de `/painel` e `/painel/graficos`:
  - `'mostra Mission Control e os cinco números com links'`.
  - `'Vencido fica em perigo quando há atrasadas'`.
  - `'com ocultar valores ligado nenhum R$ aparece'`: usar o mecanismo de `web/src/lib/privacidade.js` e conferir que nenhum texto bate com `/R\$/`.
  - `'concluir uma tarefa recarrega o painel'`: o mock conta as chamadas de `GET /painel`.
  - `'CRM vazio abre sem quebrar'`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run web/src/pages/Inicio.test.jsx`.
- [ ] **Step 3: Implementar a página e o CSS.**
- [ ] **Step 4: Rodar tudo.** `npm test` → PASS. O teste `Conteudo.test.jsx` "resumo mostra seguidores…" depende da data: se falhar, conferir no commit base.
- [ ] **Step 5: Commit.** `feat: Início vira o Mission Control`

---

### Task 5: Verificação final

- [ ] **Step 1:** `npm test && npm run build` → tudo passa e o build não dá erro.
- [ ] **Step 2: Reiniciar o pm2, só com autorização explícita do Lucca** naquele momento.
- [ ] **Step 3: Conferir no Chrome**, em `http://127.0.0.1:5174/`:
  - Os números batem com o Financeiro e com o "Pede atenção" do cérebro.
  - Criar uma tarefa de teste e concluir em seguida, sem deixar sujeira.
  - Os follow-ups fazem sentido com os dados reais.
  - Ocultar valores (Ctrl+Shift+H).
  - A largura do celular, se a janela aceitar.
