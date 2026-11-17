# Grafo do Cérebro v2 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o SVG da tela `/cerebro` por um grafo em canvas, no estilo do vídeo: nuvens densas com histórico e arquivos, zoom de câmera, painéis de item e de conteúdo, e lista acessível.

**Architecture:**
- **Servidor:** `GET /api/cerebro` ganha `tipo`, `vivo` e `texto` em cada ponto, o histórico e uma 7ª área "Arquivos" (lida da pasta do cérebro).
- **Front, funções puras e testáveis:** posições (`layout.js`), câmera (`camera.js`) e alvo de clique (`alvo.js`).
- **Front, componentes:** `GrafoCanvas.jsx` desenha e trata o mouse e o toque. A página monta os painéis, a lista e os botões dos cantos.
- **Fica de fora:** o relatório e a skill.

**Tech Stack:** Node ≥ 24, Express 5, SQLite (`node:sqlite`), React 19 + react-router 8, Canvas 2D, Vitest + supertest + testing-library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-17-cerebro-grafo-design.md`. Ele continua `docs/superpowers/specs/2026-11-12-cerebro-madia-design.md`.

## Global Constraints

- **Nenhuma dependência nova**: Canvas 2D do navegador, sem WebGL. **Nenhuma migration.**
- **Só leitura.** A tela não escreve nada, e não há rota nova de leitura de arquivo: tudo vem em `GET /api/cerebro`.
- **Todo ponto é registro ou arquivo real.** Nada de partícula decorativa.
- **Histórico** (`vivo: false`) **nunca** tem `destaque: true`. A paridade destaque × `pede_atencao` da Fase 1 continua valendo.
- **Fictícios** ficam fora de tudo. **Perdidos** entram só como histórico.
- **Formato de todo ponto:** `{ id, tipo, rotulo, destaque, vivo, link: string|null, ligacoes: string[], resumo, texto: string|null }`.
- **`tipo`** é um destes: `cliente | projeto | orcamento | tarefa | parcela | venda | hospedagem | ferramenta | conteudo | instagram | arquivo`.
- **Áreas**, nesta ordem: `clientes, comercial, projetos, processos, administrativo, conteudo, arquivos`. Rótulo da 7ª: "Arquivos".
- **Limite de 200 KB** de texto por arquivo, valendo para relatórios, skills e CLAUDE.md. O texto cortado termina com `\n\n[… arquivo cortado em 200 KB]`.
- **Câmera:** zoom de **0,6× a 8×**, voo com suavização de **600 ms**. Com `prefers-reduced-motion`, a câmera pula direto e nada se mexe.
- **Alvo de clique e toque:** raio de **22 px na tela**, seja qual for o zoom. Vence o ponto mais próximo.
- **Fluidez:** precisa aguentar **5.000 pontos**. Para isso, grade espacial no alvo e corte do que está fora da câmera no desenho.
- **Cores:** variáveis do tema do CRM (`--area-*` em `cerebro.css`, mais a nova `--area-arquivos`), lidas com `getComputedStyle` na hora de desenhar. Canto superior esquerdo: "Madia · Cérebro".
- **Textos** em português, diretos.
- **Commits** em Conventional Commits, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Canvas sem contexto** (jsdom, ou navegador que nega o `getContext`). A página não pode quebrar: a lista acessível e os painéis continuam funcionando. Teste na Task 4.
2. **Clique num lugar vazio, ou arrasto que termina em cima de um ponto.** Clique no vazio fecha o cartão. Arrastar mais de 5 px não conta como clique. Teste na Task 4.
3. **Ponto ligado a algo que não está na tela** (ex.: tarefa de projeto entregue antigo). A linha e o item da lista de ligações não podem quebrar: ligação sem posição é ignorada no desenho e aparece no cartão sem o botão de voar. Testes nas Tasks 4 e 5.
4. **Pasta de relatórios vazia, inexistente ou com arquivo gigante.** Área "Arquivos" vazia e sem erro 500. Arquivo acima de 200 KB vem cortado. Teste na Task 2.
5. **Zoom e arrasto nos limites.** Não passa de 0,6×–8× e o cérebro não sai da tela. Teste na Task 3.

---

### Task 1: Memória com `tipo`, `vivo`, histórico e Instagram

**Files:**
- Modify: `server/cerebro/memoria.js`
- Test: `server/cerebro/memoria.test.js`

**Interfaces:**
- Produces: `montarMemoria(db, hoje)` → `{ areas: [6 áreas] }`, com cada ponto no formato das Global Constraints. A Task 2 acrescenta a 7ª área.

**Regras** (do spec, mais o que já existe):
- **Pontos vivos de hoje:** ganham `vivo: true`, `tipo` e `texto: null`.
- **Histórico** (`vivo: false`, `destaque: false`):

  | Área | O que entra |
  |---|---|
  | comercial | projetos `perdido` |
  | projetos | `entregue` que **não** passam em `entregueRelevante` |
  | processos | tarefas `concluida = 1` (soltas, ou de projeto não fictício) |
  | administrativo | parcelas com `pago_em` (de projeto não fictício), vendas de placa pagas (`vendasPlacasComoParcelas` com `pago_em`), ferramentas com `cancelada_em` |
  | conteudo | `instagram_midias` com `removido = 0` e **sem** `conteudos.midia_id` apontando para elas |

- **Ponto do Instagram:**
  - `id: instagram:<id>`, `tipo: 'instagram'`, `link: '/conteudo'`.
  - `rotulo`: os primeiros 40 caracteres da legenda, ou `'Post do Instagram'` sem legenda.
  - `resumo`: `${tipo} publicado em DD/MM/AAAA`.
  - `ligacoes`: `['app:instagram']`, mais `projeto:<projeto_id>` quando houver.
- **Ligações novas:**
  - Tarefa sem projeto, mas com `cliente_id` → `['cliente:<cliente_id>']`.
  - `conteudo` com `projeto_id` → `['app:instagram', 'projeto:<projeto_id>']`.
- **Ordem dentro de cada área:** vivos primeiro, depois o histórico.

- [ ] **Step 1: Testes.** Em `memoria.test.js`, criar os dados pela API e, quando não der, direto pelo `ctx.db`, como os testes da Fase 1.
  - `'todo ponto tem tipo, vivo e texto null'`: `pontos.every(p => typeof p.tipo === 'string' && typeof p.vivo === 'boolean' && p.texto === null)`.
  - `'tarefa concluída e parcela paga entram como histórico apagado e sem destaque'`: tarefa concluída com prazo passado → `{ vivo: false, destaque: false, tipo: 'tarefa' }`. Parcela paga vencida → `{ vivo: false, destaque: false }`.
  - `'projeto perdido entra em comercial como histórico; fictício não entra em lugar nenhum'`.
  - `'entregue antigo vai para projetos como histórico'`: `data_entrega` 60 dias antes de `hoje`, sem pendência.
  - `'post do Instagram sem conteúdo vira ponto; com conteúdo ligado ou removido, não'`: inserir 3 linhas em `instagram_midias` e um `conteudos` com `midia_id` apontando para uma delas. Só a livre e não removida aparece, com `ligacoes` contendo `'app:instagram'`.
  - `'tarefa solta com cliente liga ao cliente'`.
  - `'vivos vêm antes do histórico em cada área'`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run server/cerebro/memoria.test.js`.
- [ ] **Step 3: Implementar** em `memoria.js`, reaproveitando `vivo`, `contarPorProjeto`, `pontoProjeto` (com um parâmetro `vivo`), `brl` e `dataBr`.
- [ ] **Step 4: Rodar a memória, a rota e a paridade.** `npx vitest run server/cerebro server/routes/cerebro.test.js` → PASS. O teste de paridade destaque × `pede_atencao` precisa continuar passando sem alteração.
- [ ] **Step 5: Commit.** `feat: memória do cérebro com histórico, tipo e posts do Instagram`

---

### Task 2: Arquivos do cérebro e texto das skills

**Files:**
- Modify: `server/cerebro/pasta.js`, `server/routes/cerebro.js`
- Test: `server/cerebro/pasta.test.js`, `server/routes/cerebro.test.js`

**Interfaces:**
- Consumes: `montarMemoria` (Task 1).
- Produces:
  - `lerPasta(caminho)` passa a devolver também `arquivos: [{ id: 'arquivo:relatorios/<nome>.md', nome, texto, modificado_em }]`, com o mais recente primeiro (`mtime`). `skills[].texto` passa a trazer o `SKILL.md` inteiro, e `centro.texto` respeita o limite.
  - `GET /api/cerebro` → `memoria.areas` com 7 áreas. A 7ª é `{ id: 'arquivos', rotulo: 'Arquivos', pontos }`, e cada ponto tem:
    - `tipo: 'arquivo'`, `vivo: true`, `destaque: false`, `link: null`, `ligacoes: []`
    - `rotulo` = nome sem `.md`
    - `resumo: 'Relatório · modificado em DD/MM/AAAA'`
    - `texto` = o conteúdo

- [ ] **Step 1: Testes de `lerPasta`:**
  - `'relatorios: só .md do primeiro nível, o mais recente primeiro'`: dois `.md` com `utimesSync` diferentes, um `.txt` e uma subpasta com `.md`.
  - `'arquivo acima de 200 KB vem cortado com o aviso no fim'`: `texto.length <= 200*1024 + 60` e `texto.endsWith('[… arquivo cortado em 200 KB]')`.
  - `'sem pasta relatorios, arquivos é [] sem aviso'`.
  - `'skill traz o texto inteiro do SKILL.md'`.
- [ ] **Step 2: Teste da rota:** `'traz 7 áreas, a última é Arquivos com o relatório da pasta'`.
- [ ] **Step 3: Rodar e ver falhar.** `npx vitest run server/cerebro/pasta.test.js server/routes/cerebro.test.js`.
- [ ] **Step 4: Implementar.**
  - **Leitura:** reaproveitar `lerTexto`, com o limite aplicado no texto lido. Erro de leitura vira aviso, como hoje.
  - **Rota:** monta a área "Arquivos" a partir de `lerPasta(...).arquivos`, mesmo quando a pasta não está configurada. Nesse caso a área sai vazia.
- [ ] **Step 5: Rodar.** O mesmo comando → PASS.
- [ ] **Step 6: Commit.** `feat: arquivos do cérebro e texto das skills na memória`

---

### Task 3: Funções puras — posições, câmera e alvo

**Files:**
- Create: `web/src/pages/cerebro/layout.js`, `web/src/pages/cerebro/camera.js`, `web/src/pages/cerebro/alvo.js`
- Create: `web/src/pages/cerebro/layout.test.js`, `web/src/pages/cerebro/camera.test.js`, `web/src/pages/cerebro/alvo.test.js`
- Modify: `web/src/pages/cerebro/posicoes.js`: exportar `fnv` (hoje é interno). `posicionarPontos` continua até a Task 5.

**Interfaces:**
- **Mundo:** quadrado de `0..600`, com o centro em `CENTRO = 300` (de `posicoes.js`). Anéis: `R = { centro: 22, skills: 70, memoriaDe: 95, memoriaAte: 200, rotulos: 216, rotinas: 235, apps: 275 }`, exportado por `layout.js`.
- **`layout.js`:**
  - `posicionarGrafo(areas) → Map<id, { x, y, area, vivo, raio }>`
    - **Faixas:** cada área ocupa `fatiaDaArea(i, n)`. Dentro dela, `nFaixas = clamp(3 + floor(n/150), 3, 5)` arcos em espiral, ou seja, o ângulo cresce junto com o raio, em até 0,6 da largura da fatia.
    - **Posição de cada ponto:** escolhe a faixa por `fnv(id)` e a posição ao longo dela por `fnv(id+'#t')`. O desvio perpendicular é `±(vivo ? 4 : 12) * fnv(id+'#d')`.
    - **Raio do ponto:** `destaque ? 5 : vivo ? 3 : 1.6`. Arquivo: 3,5.
  - `emVolta(lista, raio) → [{ item, x, y }]`: movido de `AneisCerebro.jsx`, sem mudar o comportamento.
- **`camera.js`:**
  - `CAMERA_INICIAL = { x: 300, y: 300, zoom: 1 }`, `ZOOM_MIN = 0.6`, `ZOOM_MAX = 8`, `DURACAO_VOO = 600`.
  - `escala(cam, tamanho) = (Math.min(tamanho.largura, tamanho.altura) / 600) * cam.zoom`.
  - `paraTela(cam, { x, y }, tamanho) → { x, y }` e `paraMundo(cam, { x, y }, tamanho) → { x, y }`, inversas uma da outra.
  - `aproximar(cam, fator, focoTela, tamanho) → cam`: o ponto do mundo sob `focoTela` fica parado. Passa por `limitar`.
  - `arrastar(cam, dxTela, dyTela, tamanho) → cam` e `limitar(cam) → cam`: zoom entre os limites, centro entre 0 e 600.
  - `camParaArea(i, n) → cam`: centro em `noAnel(meio, (R.memoriaDe + R.memoriaAte) / 2)`, `zoom: 2.4`.
  - `camParaPonto({ x, y }) → { x, y, zoom: 4 }`.
  - `interpolar(de, para, t) → cam` com easeInOutCubic, onde `t ∈ [0, 1]`.
- **`alvo.js`:**
  - `criarGrade(itens: Array<{ id, x, y }>, celula = 16) → grade`
  - `maisProximo(grade, { x, y }, raioMundo) → id | null`: o mais próximo dentro do raio, ou `null`.
  - Quem chama usa `raioMundo = 22 / escala(cam, tamanho)`.

- [ ] **Step 1: Testes.**
  - **`layout`:**
    - É determinístico.
    - Adicionar um ponto não move os outros da mesma área.
    - Todo ponto fica na fatia da área e entre `memoriaDe - 14` e `memoriaAte + 14`.
    - Vivo fica, em média, mais perto do eixo da faixa que o histórico.
    - 5.000 pontos posicionados em menos de 100 ms.
  - **`camera`:**
    - `paraMundo(paraTela(p)) ≈ p`.
    - `aproximar` mantém parado o ponto sob o foco.
    - O zoom fica preso em 0,6 e 8.
    - `limitar` prende o centro.
    - `interpolar(a, b, 0)` é igual a `a`, `interpolar(a, b, 1)` é igual a `b`, e o meio fica entre os dois.
  - **`alvo`:**
    - Acha o mais próximo dentro do raio e devolve `null` fora dele.
    - Com 5.000 pontos, 1.000 buscas levam menos de 50 ms.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run web/src/pages/cerebro/layout.test.js web/src/pages/cerebro/camera.test.js web/src/pages/cerebro/alvo.test.js`.
- [ ] **Step 3: Implementar os três módulos.**
- [ ] **Step 4: Rodar.** O mesmo comando, mais `web/src/pages/cerebro/posicoes.test.js` → PASS.
- [ ] **Step 5: Commit.** `feat: posições em faixas, câmera e alvo do grafo do cérebro`

---

### Task 4: `GrafoCanvas` — desenho e interação

**Files:**
- Create: `web/src/pages/cerebro/GrafoCanvas.jsx`: o componente (laço de animação, eventos de ponteiro e roda do mouse).
- Create: `web/src/pages/cerebro/desenho.js`: funções de desenho com `ctx` (fundo, halos de área, anéis, pontos, linhas, rótulos), mais os sprites de brilho por cor.
- Create: `web/src/pages/cerebro/GrafoCanvas.test.jsx`
- Modify: `web/src/pages/cerebro/cerebro.css`: estilos do palco do canvas e `--area-arquivos: var(--tag-ambar)`.

**Interfaces:**
- Consumes: Tasks 1–3, mais `ligadosA` e `montarVizinhos` (`ligacoes.js`).
- Produces: `<GrafoCanvas dados selecionado aoAbrir aoFechar ref />`, com `forwardRef`. Pelo `ref`, expõe `{ voarParaPonto(id), voarParaArea(idArea), verTudo() }` e chama `aoMudarCamera(emInicio: boolean)`.
  - `aoAbrir(item)`, com `item` igual ao da Fase 1:
    - ponto: `{ tipo: 'ponto', dados: { ...ponto, area: rotuloDaArea } }`
    - skill: `{ tipo: 'skill', dados }`
    - rotina: `{ tipo: 'rotina', dados }`
    - app: `{ tipo: 'app', dados }`
    - centro: `{ tipo: 'centro', dados }`
  - Clique num rótulo de área → `voarParaArea`.
  - Clique no vazio → `aoFechar()`.

**Comportamento:**
- **Tamanho:**
  - `ResizeObserver` no contêiner. O canvas é dimensionado por `devicePixelRatio`.
  - Altura: `max(420px, 100vh - topo do canvas - 24px)`.
- **Laço:**
  - Um `requestAnimationFrame` só.
  - Com `prefers-reduced-motion`, desenha uma vez e redesenha só quando a câmera, o hover ou os dados mudarem.
  - Desenha só o que cai dentro da tela, com folga de 20 px.
- **Ponteiro:**
  - `pointerdown`, `move` e `up`, com `setPointerCapture`.
  - Arrasto acima de 5 px move a câmera e não conta como clique.
  - Dois ponteiros ao mesmo tempo fazem a pinça.
  - `wheel` (com `passive: false`) chama `aproximar` com o fator `1.0015 ** -deltaY`.
- **Visual:**
  - **Pontos:** cada ponto vivo é desenhado com o sprite de brilho da cor da sua área. O histórico sai sem brilho, com opacidade de 0,35. O que pede ação sai em `--perigo`, pulsando. Arquivo é um losango.
  - **Movimento:** cada ponto flutua ±1,5 unidade, com a fase vinda de `fnv(id)`. O anel de skills (tracejado) e o de rotinas correm devagar.
  - **Bolhas das áreas:** com zoom acima de 1,5, cada área ganha um halo radial desfocado na cor dela e o nome em tamanho grande atrás dos pontos.
  - **Fundo:** `--fundo`, com um halo verde (`--primaria` a 6%) no centro.
- **Hover:** o mesmo da Fase 1, desenhado no canvas.
  - O ponto em foco cresce 2,6×, e o que está aceso cresce 1,6×.
  - O resto cai para opacidade 0,18.
  - Linhas tracejadas correndo e nomes curtos (24 caracteres) em cima.
  - `selecionado` mantém tudo isso aceso.
- **Alvos:** pontos (pela grade), apps, skills, rotinas, centro e rótulos de área. Todos usam o mesmo raio de 22 px na tela.
- **Sem contexto 2D** (`getContext` devolve `null`): não desenha e não lança erro.
- **Acessibilidade:** o canvas tem `role="img"` e `aria-label` igual a "Mapa do cérebro: " seguido da contagem por área (ex.: "Clientes 12, Comercial 8, …").

- [ ] **Step 1: Testes** em `GrafoCanvas.test.jsx`.
  - Preparação: `HTMLCanvasElement.prototype.getContext` devolve `null` (padrão do jsdom) num teste e um objeto falso com métodos vazios nos outros. `getBoundingClientRect` simulado como 600×600 no topo à esquerda.
  - `'sem contexto 2D não quebra e tem aria-label com as contagens'`.
  - `'clique em cima de um ponto chama aoAbrir com o ponto'`: calcular a posição na tela com `posicionarGrafo` + `paraTela` e `CAMERA_INICIAL`, e disparar `pointerdown` + `pointerup` nela.
  - `'arrastar mais de 5px não abre nada'`.
  - `'clique no vazio chama aoFechar'`.
  - `'ref.voarParaPonto com reduced-motion move a câmera na hora'`: `matchMedia` simulado com reduce → `aoMudarCamera(false)`.
  - `'ligação para ponto que não está no mapa não quebra o desenho'`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run web/src/pages/cerebro/GrafoCanvas.test.jsx`.
- [ ] **Step 3: Implementar `desenho.js` e `GrafoCanvas.jsx`.**
- [ ] **Step 4: Rodar.** O mesmo comando → PASS.
- [ ] **Step 5: Conferir no navegador**, com `npm run dev` e a API de desenvolvimento, sem mexer no pm2.
  - Com os dados reais: brilho, faixas, hover, roda do mouse, arrasto e voo até uma área.
  - Com um teste de carga só local, sem commit: 5.000 pontos falsos injetados pelo console, girando liso.
- [ ] **Step 6: Commit.** `feat: grafo do cérebro em canvas com câmera e hover`

---

### Task 5: Página — painéis, lista e cantos; sai o SVG

**Files:**
- Modify: `web/src/pages/Cerebro.jsx`
- Modify: `web/src/pages/cerebro/PainelPonto.jsx` → vira os dois painéis `PainelItem` e `PainelConteudo`. Pode ser um arquivo só com os dois componentes, mais o mesmo `Escape` para fechar.
- Create: `web/src/pages/cerebro/ListaCerebro.jsx`
- Delete: `web/src/pages/cerebro/AneisCerebro.jsx`. `posicionarPontos` sai de `posicoes.js`, junto com os testes dele.
- Modify: `web/src/pages/Cerebro.test.jsx` (reescrever) e `web/src/pages/cerebro/cerebro.css`.

**Interfaces:**
- Consumes: `GrafoCanvas` e o seu `ref` (Task 4). `montarVizinhos` e `ligadosA`. As posições de `posicionarGrafo`, para saber se uma ligação está no mapa.

**Comportamento:**
- **Página:**
  - Topo: título "Cérebro" e `PedeAtencao`, como hoje.
  - Abaixo, o palco com o canvas. Por cima dele, nos cantos:
    - topo à esquerda: "Madia · Cérebro"
    - embaixo à esquerda: botão "Legenda", que abre e fecha a legenda (as cores das áreas, vivo × histórico, pede ação, rotina ativa e planejada, app conectado)
    - embaixo à direita: botão "Lista"
    - topo à direita: "Ver tudo", só quando a câmera não está no início
- **`PainelItem`** (à esquerda do palco no desktop):
  - Etiquetas: o tipo legível (Cliente, Projeto, Tarefa, Parcela, Venda de placas, Site, Ferramenta, Conteúdo, Post, Arquivo) e a área. Mais "Histórico" quando `vivo === false` e "Pede ação" quando `destaque`.
  - Título e resumo.
  - **"Ligado a"**: lista os vizinhos diretos (`montarVizinhos`).
    - Vizinho que está no mapa é um botão: voa até ele e abre o cartão dele.
    - Vizinho fora do mapa aparece como texto, sem botão.
    - App aparece pelo nome.
  - Botões: "Abrir no CRM" (só com `link`) e "Voar até".
  - Para skill, rotina, app e centro: os mesmos campos da Fase 1.
- **`PainelConteudo`** (à direita): só quando o item tem `texto`, ou seja, arquivo, skill ou centro. Mostra o título e o `<pre>` rolável.
- **Celular (< 768 px):** uma folha só, que sobe de baixo, com abas "Item" e "Conteúdo" quando houver conteúdo.
- **`ListaCerebro`:** painel com um `<section>` por área.
  - Primeiro os botões dos vivos. Depois `<details><summary>Histórico (N)</summary>` com os botões do histórico.
  - Clicar ou dar Enter abre o cartão e voa até o ponto.
  - A lista também tem botões para o centro, as skills, as rotinas e os apps.

- [ ] **Step 1: Testes** em `Cerebro.test.jsx`, reescrito com uma fixture de 7 áreas, histórico, arquivo e ligações.
  - `'mostra pede atenção, o canvas com aria-label e os botões Legenda e Lista'`.
  - `'Lista: vivos à vista, histórico recolhido com a contagem; clicar abre o cartão'`.
  - `'cartão mostra etiquetas Projeto/Histórico, Ligado a com botão para vizinho no mapa e texto para vizinho fora'`.
  - `'Abrir no CRM só aparece quando há link'`.
  - `'arquivo abre o painel de conteúdo com o texto inteiro'`.
  - `'Escape fecha os painéis'`.
  - `'Legenda abre e fecha'`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run web/src/pages/Cerebro.test.jsx`.
- [ ] **Step 3: Implementar e apagar o que saiu** (`AneisCerebro.jsx` e `posicionarPontos` com os testes dele).
- [ ] **Step 4: Rodar.** `npx vitest run web/src/pages/Cerebro.test.jsx web/src/pages/cerebro` → PASS.
- [ ] **Step 5: Commit.** `feat: painéis, lista e cantos do novo grafo do cérebro`

---

### Task 6: Verificação final

- [ ] **Step 1:** `npm test && npm run build` → tudo passa e o build não dá erro.
- [ ] **Step 2: Reiniciar o pm2, só com autorização explícita do Lucca** naquele momento: `pm2 restart crm-madia-api`. Sem migration, então sem backup.
- [ ] **Step 3: Conferir no Chrome**, em `http://127.0.0.1:5174/cerebro`:
  - O que pede ação bate com o "Pede atenção".
  - Hover, voo até uma área, "Voar até" e "Ver tudo".
  - O relatório abre no painel de conteúdo.
  - A lista abre.
  - Com 375 px de largura (se a janela aceitar): a folha de baixo e o toque num ponto.
- [ ] **Step 4:** registrar o que não deu para conferir.
