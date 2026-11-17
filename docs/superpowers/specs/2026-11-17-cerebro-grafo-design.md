# Grafo do Cérebro, versão 2 — design

Status: desenho para aprovação do Lucca. Conversa em 2026-11-16 e 2026-11-17.
Continua o `2026-11-12-cerebro-madia-design.md` (Fase 1, no ar). Este documento só troca o **desenho** da tela `/cerebro` e amplia o que entra na memória. O relatório e a skill não mudam.

## Por que

A tela em anéis da Fase 1 funciona, mas o Lucca quer que ela pareça com o segundo cérebro do vídeo "Como eu uso o Claude pra tocar minha empresa inteira" (Victor Baggio, trecho 3:00–5:11). Esse vídeo foi a origem da imagem de referência da Fase 1. Ele quer que a tela:

- seja **densa e viva**, como uma galáxia de dados;
- reaja ao mouse, o que já entrou em 2026-11-16 (commit 77fddb3: o hover acende as ligações e a tela fica sempre em movimento);
- tenha **zoom de câmera** e **painéis de detalhe** como no vídeo.

O Mission Control (o painel com números, to-do e morning brief) vem depois, em outro documento. O Lucca escolheu começar pelo grafo.

## O que o vídeo mostra (só o grafo)

- **Anéis:** CLAUDE.md no centro, anel de skills verde e tracejado, memória em nuvens por área, anel de rotinas laranja e apps em hexágonos no anel de fora. A Fase 1 já tem tudo isso.
- **Nuvens:** centenas de pontos por área, em **faixas curvas** (espirais), com tamanhos e brilhos variados, sobre um fundo verde bem escuro com brilho (glow).
- **Zoom de câmera:**
  - Clicar numa área faz a câmera "voar" para dentro dela. As áreas viram bolhas grandes e desfocadas em volta do CLAUDE.md, e o anel de skills brilha.
  - "Fly to" leva a câmera até um item.
- **Painel esquerdo**, ao abrir um item: nome, etiquetas, tamanho, botões ("Open on device", "Copy path", "Fly to", "Remove") e a lista de itens ligados.
- **Painel direito:** o conteúdo inteiro do arquivo.
- **Cantos da tela:** marca no topo à esquerda, "Menu" no topo à direita, "Legend" embaixo à esquerda e "Mission Control" embaixo à direita, além de um painel de ajustes com controles deslizantes.

## Objetivos

1. **Desenho novo em canvas.** Fundo escuro com brilho, nuvens densas em faixas curvas, pontos de tamanhos e brilhos variados, glow nos pontos e nos anéis. A tela continua no CRM, na rota `/cerebro`.
2. **Mostrar tudo** (decisão do Lucca em 2026-11-17): além do que está vivo, a memória mostra o **histórico** e os **arquivos do cérebro**.
   - **Vivo:** o que já aparece hoje. Pontos maiores e mais brilhantes; os que pedem ação continuam em vermelho e pulsando.
   - **Histórico:** tarefas concluídas, parcelas pagas, vendas de placa pagas, projetos entregues fora da regra dos 30 dias, projetos perdidos, ferramentas canceladas e posts publicados no Instagram. Pontos menores e apagados. Clicar abre o mesmo cartão.
   - **Arquivos do cérebro:** os relatórios em `relatorios/` e qualquer `.md` que entrar na pasta depois. Clicar mostra o conteúdo no painel da direita. O CLAUDE.md e as skills também passam a mostrar o texto inteiro.
3. **Câmera:**
   - Clicar no nome de uma área faz a câmera voar até ela.
   - "Voar até" no cartão centraliza a câmera no item.
   - Roda do mouse aproxima e afasta, e arrastar move a vista.
   - No celular: pinça para aproximar e arrastar com um dedo.
   - "Ver tudo" volta ao enquadramento inicial.
4. **Painéis como no vídeo:**
   - **Esquerda, o cartão do item:** tipo e área como etiquetas, nome, resumo, "pede ação" quando for o caso, a lista de **itens ligados** (clicar num deles voa até ele e abre o cartão dele) e os botões "Abrir no CRM" (quando houver link) e "Voar até".
   - **Direita, o conteúdo:** só para arquivos, ou seja, CLAUDE.md, skills e relatórios. Texto inteiro, rolável.
   - **No celular:** uma folha só, que sobe de baixo, com abas "Item" e "Conteúdo" quando houver conteúdo.
5. **Continua como já funciona:**
   - O hover acende as ligações, aumenta o ponto e mostra os nomes do que está ligado.
   - O movimento é contínuo: pontos flutuando e anéis correndo.
   - O bloco "Pede atenção" fica no topo da página.
6. **Cantos da tela:**
   - Embaixo à esquerda, **"Legenda"**: abre e fecha a legenda de cores, vivo × histórico, pede ação, rotina ativa e planejada, app conectado.
   - Embaixo à direita, **"Lista"**: abre a lista acessível descrita abaixo.
   - **"Ver tudo"**, sempre visível quando a câmera não está no enquadramento inicial.

## Não-objetivos

- **Mission Control.** Fica para o próximo documento. Por isso não há botão para ele ainda.
- **Painel de ajustes com controles deslizantes** (tamanho dos pontos, molas, círculo × hexágono). Decisão do Claude: é mais coisa para manter do que uso no dia a dia.
- **"Remove", "Open on device" e "Copy path"** do vídeo. A tela continua só de leitura, como na Fase 1. *(Decisão do Claude.)*
- **Biblioteca nova.** Canvas 2D do navegador, sem WebGL nem dependência.
- **Mudança no relatório, na skill ou em `GET /api/cerebro/projetos`.**
- **Copiar a marca do vídeo.** O canto superior esquerdo mostra "Madia · Cérebro", com as cores do tema do CRM.

## Anti-objetivos

- **Pontos de enfeite.** Todo ponto é um registro ou arquivo real. A densidade vem do histórico, não de partículas decorativas.
- **Tela bonita que esconde o urgente.** O que pede ação precisa continuar saltando aos olhos, mesmo com centenas de pontos apagados em volta. O "Pede atenção" do topo continua igual.
- **Travar no celular.** A tela não pode pesar no PWA. Com 2.000 pontos, a animação precisa continuar fluida num celular comum.
- **Perder acessibilidade.** O canvas sozinho não é lido por leitor de tela nem navegável por teclado. A Fase 1 era, então a lista acessível é obrigatória.

## Dados — mudanças em `GET /api/cerebro`

Cada ponto da memória ganha dois campos:

- **`vivo: boolean`** — `true` para o que entra hoje e `false` para o histórico.
- **`texto: string | null`** — o conteúdo inteiro, só para arquivos do cérebro. Os outros pontos ficam com `null`.

As **skills** ganham `texto` (o `SKILL.md` inteiro). O **centro** já tem `texto`.

### Histórico, por área

O histórico usa as mesmas áreas e as mesmas regras de ligação (`ligacoes`) dos pontos vivos.

| Área | Pontos de histórico (`vivo: false`) |
|---|---|
| clientes | — (todos os clientes já entram) |
| comercial | projetos `perdido` (não fictícios) |
| projetos | projetos `entregue` que não passam na regra dos 30 dias |
| processos | tarefas concluídas, de projeto não fictício ou soltas |
| administrativo | parcelas pagas (de projeto não fictício), vendas de placa pagas, ferramentas canceladas |
| conteudo | posts do Instagram sincronizados (`instagram_midias`), ligados a `app:instagram` e ao conteúdo planejado quando houver ligação no banco. Os `conteudos` já entram |

- O histórico **nunca** tem `destaque: true`.
- Os ids seguem o mesmo padrão com prefixo (`tarefa:`, `parcela:`, `instagram:`).

**Posts do Instagram** *(decisão do Claude, depois da revisão)*:
- A ligação no banco é `conteudos.midia_id → instagram_midias.id`.
- Post que já tem conteúdo ligado **não** vira ponto próprio: o ponto `conteudo:N` já o representa, então não há duplicata.
- Só os posts sem conteúdo ligado viram `instagram:<id>`, com `vivo: false`, `link: '/conteudo'` e `ligacoes: ['app:instagram']`, mais `projeto:<projeto_id>` quando houver.
- Posts com `removido = 1` ficam de fora.

**Campos novos em todo ponto:**
- **`tipo`**: um destes valores, `cliente`, `projeto`, `orcamento`, `tarefa`, `parcela`, `venda`, `hospedagem`, `ferramenta`, `conteudo`, `instagram`, `arquivo`. É usado nas etiquetas do cartão e na lista.
- **`link` pode ser `null`.** O cartão só mostra "Abrir no CRM" quando houver link.

**Sem limite de histórico.** Hoje são cerca de 100 pontos no total. O desenho precisa continuar fluido com **5.000**: o builder usa uma grade espacial para o alvo de clique e não desenha o que está fora da câmera.

### Arquivos do cérebro

- Nova área **"Arquivos"** (id `arquivos`), a 7ª, depois de "Conteúdo".
- Cada `.md` dentro de `relatorios/` vira um ponto:
  - `id: arquivo:relatorios/<nome>`
  - `rotulo`: o nome do arquivo sem `.md`
  - `vivo: true`
  - `texto`: o conteúdo
  - `link: null`
  - `ligacoes: []`
- Regras de leitura:
  - Ordem: o mais recente primeiro, pela data de modificação.
  - Só o nível de `relatorios/`, sem subpastas.
  - Só arquivos `.md`.
  - No máximo **200 KB por arquivo**. Acima disso, o ponto entra com `texto` cortado e um aviso no fim do texto. O mesmo limite vale para o `texto` das skills e do CLAUDE.md. A página busca `/api/cerebro` só quando abre.
  - Lidos com o mesmo cuidado da Fase 1: erro de leitura vira aviso, nunca resposta 500.
- Outras pastas do cérebro ficam para depois.

*(A área nova e o limite de 200 KB são decisões do Claude.)*

Tudo continua numa única chamada, `GET /api/cerebro`, sem rota nova de leitura de arquivo. Assim não há caminho vindo do navegador e nenhum risco de ler fora da pasta.

## Desenho — o que o builder precisa respeitar

- **Canvas 2D + `requestAnimationFrame`**, ajustado ao `devicePixelRatio`. O glow vem de imagens de brilho pré-desenhadas (sprites), uma por cor, e não de `shadowBlur` ponto a ponto, que é lento.
- **Posições:** cada área ocupa a sua fatia. Dentro dela, os pontos ficam distribuídos em **3 a 5 faixas curvas** (arcos em espiral do centro para fora).
  - A posição depende só do id, como na Fase 1: o ponto não pula entre recargas e um ponto novo não mexe nos outros.
  - Vivos ficam mais perto do eixo da faixa; histórico se espalha mais.
- **Tamanho e brilho:**
  - Vivo: raio maior e brilho forte. Pede ação: vermelho, maior e pulsando.
  - Histórico: raio menor, opacidade baixa e sem glow.
  - Arquivos: em forma de losango, para diferenciar de registro.
- **Movimento:**
  - Flutuação leve por ponto, os anéis de skills e de rotinas correndo devagar e as linhas de ligação com tracejado correndo.
  - Com `prefers-reduced-motion`: tudo parado e a câmera pula direto, sem voar.
- **Câmera:** estado `{ x, y, zoom }`. Os voos usam suavização (ease) de cerca de 600 ms. Limites: zoom de 0,6× a 8×, e não dá para arrastar o cérebro para fora da tela.
- **Bolhas das áreas** (como no vídeo): ao aproximar, o nome e um halo desfocado da área ficam grandes atrás dos pontos.
- **Clique e toque:** cada ponto aceita um alvo de **22 px na tela**, seja qual for o zoom, e vence o ponto mais próximo. Isso resolve a pendência da Fase 1 dos pontos pequenos no celular.
- **Hover:** o mesmo comportamento de hoje (`ligacoes.js` → `ligadosA`), desenhado no canvas: o ponto cresce, o que está ligado acende com linhas, o resto apaga e aparecem os nomes. Um ponto aberto no painel mantém as ligações acesas.
- **Cores:** variáveis do tema do CRM (as mesmas `--area-*` da Fase 1, mais `--area-arquivos`), lidas do CSS na hora de desenhar. O fundo é o `--fundo` com um halo verde ao centro.
- **Lista acessível:** botão "Lista" no canto. Abre uma lista HTML de botões de verdade, agrupada por área, com o vivo primeiro e o histórico em seguida, recolhido como "Histórico (N)".
  - Clicar ou dar Enter abre o cartão e voa até o ponto.
  - O canvas tem `role="img"` e um `aria-label` que resume o total por área.
- **Tamanho:** a área do grafo ocupa a largura do conteúdo e a altura que sobra da tela, abaixo do "Pede atenção", com no mínimo 420 px.

## Fica com o builder

- Como gerar as faixas curvas e o número delas por área (de 3 a 5, conforme a quantidade de pontos).
- A curva de suavização da câmera e a física exata do arrasto.
- Como organizar o laço de desenho (camadas, quando redesenhar). Precisa ficar fluido com 2.000 pontos.
- Os testes: desenho de canvas não é testado por pixel. O builder testa as **funções puras** (posições, câmera, alvo de clique, montagem dos dados), a **lista acessível** e os **painéis** com testing-library, e o servidor com vitest.

## Decisões do Claude (para o Lucca conferir)

1. Área nova "Arquivos" para os relatórios do cérebro, com limite de 200 KB por arquivo.
2. Sem painel de ajustes e sem os botões "Remove", "Open on device" e "Copy path".
3. O histórico inclui projetos perdidos, ferramentas canceladas e posts do Instagram.
4. A lista acessível substitui o foco por Tab em cada ponto, que não existe num canvas.
5. Cores do tema do CRM, sem a marca nem o verde exato do vídeo.
6. Post do Instagram já ligado a um conteúdo não vira ponto duplicado; posts removidos ficam de fora.
7. Sem limite de histórico; desenho preparado para 5.000 pontos.
8. Com a 7ª área, as posições mudam uma vez (todas as fatias se deslocam) — depois ficam estáveis de novo.
