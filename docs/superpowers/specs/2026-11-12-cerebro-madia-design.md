# Cérebro da Madia — design

Status: desenho para aprovação do Lucca. Conversa em 2026-11-12.

## Por que

O Lucca sente que está tudo bagunçado. Mesmo com o CRM, é difícil saber o que se liga a quê e como. Hoje quem faz essas ligações é a cabeça dele: projeto com repositório, com Figma, com a Vercel, com o cliente, e com o padrão de proposta e de serviço.

Ele quer um **segundo cérebro da Madia Consultoria**, no sentido da referência visual que mandou (anéis: CLAUDE.md no centro, skills, memória por área, rotinas, apps). Duas coisas juntas:

1. **Um cérebro que o Claude usa de verdade para trabalhar pela Madia.** O Claude sabe, sem o Lucca repetir, como a Madia trabalha, quais serviços vende, quem são os clientes e em que pé está cada projeto. Assim mantém o mesmo padrão entre clientes, propostas e serviços.
2. **Uma representação visual desse cérebro desde o início**, para o Lucca acompanhar.

**Primeiro teste de sucesso (do Lucca):** ele pede "organiza um relatório dos projetos pendentes" e o Claude entrega, sem explicação extra, uma visão geral do que foi e do que não foi entregue.

## Objetivos (Fase 1)

- Uma **pasta do cérebro** (`Cerebro-Madia`) com as regras da Madia e as skills, que o Claude lê ao trabalhar nela.
- Uma **skill "relatório de projetos"**, que lê o CRM e monta o relatório no padrão da Madia.
- Uma **tela "Cérebro" dentro do CRM**, no formato de anéis da referência (opção A, escolhida pelo Lucca), que mostra o cérebro e deixa abrir o detalhe de cada ponto.

## Não-objetivos (fora da Fase 1)

- **Ligações novas no CRM**, como projeto ↔ repositório, Figma, Supabase, pessoas além do contato e registro de decisões. Ficam para a Fase 2. Elas só acrescentam pontos e linhas na mesma tela.
- **Rotinas rodando sozinhas**, como o relatório semanal automático. Ficam para a Fase 3. Na Fase 1 o anel de rotinas existe e mostra o que está *planejado*.
- **Editar o cérebro pela tela.** Na Fase 1 a tela só mostra. O CLAUDE.md e as skills são editados pedindo ao Claude ou no editor. *(Decisão do Claude, ver "Calls".)*
- **Mover projetos de lugar.** O pedido original era "juntar tudo numa pasta". O desenho **não move** CRM, orca nem outros repositórios: o pm2 aponta para o caminho do CRM, o orca aponta para as pastas atuais e a Central de Workflow grava no `~/.claude`. A pasta do cérebro *aponta* para onde cada coisa está.
- **Substituir a Central de Workflow.** Ela continua dona do workflow de desenvolvimento (`~/.claude/workflow/WORKFLOW.md`). O cérebro é da *empresa*: clientes, serviços, padrão comercial.

## Anti-objetivos (seria um fracasso mesmo funcionando)

- **Dado copiado e divergente.** O cérebro não pode virar uma segunda base de clientes e projetos. O CRM é a fonte única: o "Gestão de projetos (madia)" já foi absorvido por ele, e o cérebro não pode repetir esse erro.
- **Tela bonita e inútil.** Se o Lucca abre a tela e não descobre nada que não sabia (o que está atrasado, o que está sem dono, quais áreas estão vazias), ela falhou. O visual precisa *informar*, não só decorar.
- **Relatório que pede explicação.** Se o Lucca precisar dizer ao Claude onde está o CRM ou o que é "pendente", a Fase 1 falhou.

## Onde as coisas ficam

| Coisa | Onde | Dono |
|---|---|---|
| Clientes, projetos, tarefas, parcelas, orçamentos, serviços, hospedagens, ferramentas, conteúdo | Banco do CRM (`CRM-Madia/data/crm.db`) | CRM |
| Regras da Madia, skills, lista de rotinas e de apps, relatórios gerados | `Documents/Projetos/0. Luccas Madia (eu)/Cerebro-Madia` (nova) | Cérebro |
| Workflow de desenvolvimento (Figma → plano → código → revisão → entrega) | Central de Workflow (orca) → `~/.claude/workflow/WORKFLOW.md` | Central |
| Tela visual do cérebro | CRM, rota `/cerebro` | CRM, lendo os dois de cima |

## Parte 1 — A pasta `Cerebro-Madia`

Fica ao lado do CRM, em `Documents/Projetos/0. Luccas Madia (eu)/Cerebro-Madia`. É um repositório git próprio, para o Lucca ver o histórico de cada mudança no cérebro. Commits seguem Conventional Commits.

Estrutura:

```
Cerebro-Madia/
  CLAUDE.md                 ← centro: identidade, tom e regras da Madia
  .claude/skills/
    relatorio-projetos/SKILL.md
  rotinas.json              ← anel de rotinas (Fase 1: só a lista, todas "planejada")
  apps.json                 ← anel de apps
  relatorios/               ← saída dos relatórios, um arquivo por data
  README.md                 ← o que é a pasta e como usar
```

As skills ficam em `.claude/skills/` porque é onde o Claude Code encontra skills de projeto sozinho. Assim, abrir uma sessão do Claude nessa pasta já carrega o cérebro inteiro.

### `CLAUDE.md` da Madia (o centro)

Conteúdo inicial, escrito a partir do que já existe. O builder não inventa regras.

- **Quem é a Madia Consultoria:** freelancer que projeta e constrói sistemas de vendas e gestão sob medida para pequenos negócios locais. Também vende Google Meu Negócio e placas NFC (os três `servico` do CRM: `site_sistema`, `google_meu_negocio`, `placas_nfc`).
- **Ciclo de projeto:** proposta → aprovação → implementação → entrega em fases (Fase 1 fechada, Fase 2 orçada depois).
- **Estrutura de proposta:** a mesma do `~/.claude/CLAUDE.md` global. O CLAUDE.md da Madia **aponta** para ela e não copia, para as duas não divergirem.
- **Onde está cada coisa:** a tabela "Onde as coisas ficam" acima, com os caminhos.
- **Como ler o CRM:** endereço da API, as rotas de leitura e a regra "nunca escrever no CRM sem o Lucca pedir".
- **Padrão de relatório:** português, direto, sem jargão, com o que pede ação primeiro.

### `apps.json`

Lista os apps do anel de fora: `nome`, `para que serve`, `como o cérebro sabe se está conectado`.

Lista inicial: Vercel, Instagram, Figma, Supabase, Gmail, GitHub.

Na Fase 1, o estado "conectado" de Vercel e Instagram vem do próprio CRM, que já guarda os tokens em Configurações. Os outros aparecem como "não conectado ao CRM". *(Decisão do Claude.)*

### `rotinas.json`

Lista as rotinas: `nome`, `o que faz`, `frequência`, `estado` (`planejada` | `ativa`), `ultima_execucao`.

Na Fase 1 só existe "Relatório semanal de projetos", com estado `planejada`. As rotinas que o CRM já roda sozinho (checagem de sites a cada 5 minutos, sync do Instagram a cada 6 horas, publicação de posts agendados a cada 60 segundos; ver `server/index.js`) entram como `ativa`. Assim o anel mostra o que de fato já roda hoje.

## Parte 2 — Skill `relatorio-projetos`

Disparada por pedidos como "organiza um relatório dos projetos pendentes" ou "como estão os projetos".

**De onde lê:** da API do CRM em `http://127.0.0.1:5174`, só com `GET`. A proteção do CRM (`server/http/protecao.js`) deixa leituras locais passarem sem o cabeçalho `X-CRM`. A skill nunca faz `POST`, `PUT` nem `DELETE`. Ler pela API, e não pelo banco, garante que o Claude vê os dados do jeito que a tela mostra e não toca no arquivo SQLite (que usa WAL). Se o CRM estiver fora do ar, a skill avisa e para. Ela não tenta abrir o banco.

**Atenção (achado na revisão):** alguns `GET` do CRM gravam no banco como efeito colateral. `GET /api/painel` e `GET /api/financeiro/mensalidades` chamam `gerarTodasMensalidades`, e `GET /api/hospedagem/avisos` pode limpar `cliente_avisado_em`. É o mesmo que acontece quando o Lucca abre essas telas, então a skill pode usá-las. A regra "nunca escrever" vale para o que a skill *pede*, não para esse efeito interno do CRM.

**Definições iguais às do CRM:** "parcela vencida", "atrasado" e o que conta como "para entregar" seguem as definições que o `/api/painel` já usa, incluindo as vendas de placa tratadas como parcelas (`vendasPlacasComoParcelas`). Assim os números do relatório batem com o Início do CRM. A ordem das etapas é a de `ORDEM_ETAPAS` (inclui `prototipo`). "Tarefa vencida" é uma tarefa não concluída com `prazo` de data válida no passado. Tarefas sem prazo, ou com prazo que não é data, nunca contam como vencidas. *(Decisão do Claude.)*

**Quais projetos entram:** projetos com `ficticio = 0`, dos **três serviços** (sites/sistemas, Google Meu Negócio e placas NFC), **separados por serviço** (decidido pelo Lucca em 2026-11-12). Cada serviço tem sua seção no relatório. GMN e placas só têm as etapas `andamento` e `entregue` (`server/domain/servicos.js`), então a seção deles é uma lista simples de "para entregar" e "entregues", sem agrupar por etapa.
- **Não entregues:** etapa diferente de `entregue` e `perdido`.
- **Entregues recentes:** `entregue` com `data_entrega` nos últimos 30 dias, **ou** entregues que ainda têm tarefa aberta ou parcela não paga.
- `perdido` fica de fora.

**Conteúdo do relatório, nesta ordem:**

1. **Pede ação primeiro:** projetos atrasados (prazo de entrega no passado e não entregues), parcelas vencidas, sites fora do ar e mensalidade atrasada.
2. **Uma seção por serviço** (sites/sistemas, depois GMN, depois placas). Dentro de cada uma, **não entregues**, agrupados por etapa (na ordem do funil) quando o serviço tem funil. Para cada um: cliente, serviço, etapa, prazo (e se está atrasado), tarefas feitas/total com as abertas listadas, parcelas pagas/vencidas/a vencer e mensalidade.
3. **Entregues**, com a mesma ficha resumida e destaque para o que ficou pendurado (tarefa ou parcela).
4. **Números do topo:** quantos em cada etapa, valor a receber e valor vencido.

**Saída:** mostra o relatório na conversa e salva em `Cerebro-Madia/relatorios/AAAA-MM-DD-projetos.md`. Se já existir relatório do dia, sobrescreve.

**Teste de aceite:** numa sessão nova do Claude aberta em `Cerebro-Madia`, o pedido "organiza um relatório dos projetos pendentes", sem mais nada, gera o relatório correto, conferido contra o que o CRM mostra na tela.

## Parte 3 — Tela "Cérebro" no CRM

Nova rota `/cerebro`, com item no menu do CRM. Formato A, igual à referência: anéis concêntricos sobre fundo escuro.

### O que aparece, de dentro para fora

| Anel | Fonte | O que é cada ponto |
|---|---|---|
| **Centro** | `Cerebro-Madia/CLAUDE.md` | Um ponto só. O clique mostra o texto do CLAUDE.md. |
| **Skills** | `Cerebro-Madia/.claude/skills/*/SKILL.md` | Uma skill. O clique mostra nome e descrição (do frontmatter). |
| **Memória** | Banco do CRM | Um registro, agrupado em áreas (ver abaixo). |
| **Rotinas** | `rotinas.json` | Uma rotina. A cor indica o estado (ativa / planejada). O clique mostra frequência e última execução. |
| **Apps** | `apps.json` + Configurações do CRM | Um app, aceso se estiver conectado e apagado se não. |

### Áreas da memória (nuvens de pontos)

Cada área é uma fatia do anel de memória, com cor e rótulo próprios, como na referência.

| Área | Pontos (registros do CRM) |
|---|---|
| Clientes | clientes |
| Comercial | projetos em `ideia`, `apresentado`, `valor_definido`, `teste` (o painel já trata `teste` como proposta) + orçamentos |
| Projetos | projetos em `prototipo` e `andamento`, mais entregues pela mesma regra do relatório (últimos 30 dias ou com algo pendurado) |
| Processos | tarefas |
| Administrativo | parcelas, hospedagens, ferramentas |
| Conteúdo | conteúdos |

**O ponto precisa informar, não só enfeitar** (anti-objetivo da "tela bonita e inútil"):
- Ponto que **pede ação** (projeto atrasado, parcela vencida, site fora do ar, tarefa vencida) aparece em **destaque**, com cor de alerta e brilho.
- Um bloco acima do anel resume o que pede ação, usando o componente `PedeAtencao` que já existe (ele já tem os tons `perigo`/`atencao`). O `FaixaNumeros` não tem estilo de alerta.
- Cada ponto aparece numa área só. Ponto não se repete entre áreas.

*(As áreas e o critério de destaque são decisão do Claude. O Lucca pode reorganizar.)*

### Interação

- Passar o mouse sobre um ponto mostra o nome.
- Clicar abre um **painel lateral** com o resumo e um botão **"Abrir no CRM"**, que leva para a página que já existe (`/projetos/:id`, `/clientes/:id`, `/orcamentos/:id` etc.). A tela do Cérebro não duplica o detalhe que essas páginas já mostram.
- Clicar no nome de uma área aproxima aquela fatia.
- No celular (o CRM é PWA): os anéis encolhem para caber na largura, e o painel lateral vira uma folha que sobe de baixo.

### Como a tela lê os dados

- Nova rota de leitura no servidor, `GET /api/cerebro`, que devolve tudo de uma vez: centro, skills, rotinas, apps e memória (pontos por área, com id, rótulo, área, destaque e link).
- O **caminho da pasta do cérebro** fica em **Configurações**, do mesmo jeito que o caminho do repositório do portfólio. Sem caminho configurado, ou com a pasta inexistente, a tela mostra os anéis de memória e de apps (que vêm do CRM) e um aviso "Configure a pasta do cérebro" no centro.
- O desenho é **SVG feito à mão em React**, sem biblioteca nova, no padrão das outras telas.
- A tela usa o **tema escuro** que o CRM já tem (`2026-10-16-tema-escuro-e-dashboard-design.md`) e as cores do tema. Não cria uma paleta paralela.

## Fases

| Fase | Entrega |
|---|---|
| **1 (este documento)** | Pasta `Cerebro-Madia` + CLAUDE.md da Madia + skill `relatorio-projetos` + tela `/cerebro` (só leitura) |
| 2 | Ligações no CRM: projeto ↔ repositório, Figma, Supabase, domínio; pessoas; decisões. Aparecem como linhas entre pontos e apps na mesma tela. |
| 3 | Rotinas rodando (relatório semanal automático), editar o cérebro pela tela e novas skills ("montar proposta Madia", "abrir projeto novo", "fechar entrega de fase") |

Ordem da Fase 1: **pasta + CLAUDE.md → skill do relatório → tela**. O relatório é o primeiro teste de sucesso, e a tela reaproveita o que a pasta e a skill criam.

## O que fica com o builder

- Formato exato de `GET /api/cerebro` e onde montar a consulta (um repo novo em `server/repos/` segue o padrão).
- Como espalhar os pontos dentro de cada fatia (espiral, arcos, sementes fixas por id para não "pular" a cada recarga).
- Animação: leve ou nenhuma, respeitando `prefers-reduced-motion`.
- Quais rotas de API a skill usa para montar o relatório. Se faltar uma leitura, a skill usa as que existem antes de pedir rota nova.
- Testes no padrão do CRM: vitest para a rota nova e testing-library para a tela.

## Calls feitos pelo Claude (para o Lucca conferir)

1. Tela **só de leitura** na Fase 1. Editar o cérebro pela tela fica na Fase 3.
2. A skill lê o CRM **pela API**, nunca direto pelo banco.
3. `Cerebro-Madia` é um **repositório git próprio**, ao lado do CRM.
4. **Áreas da memória** e **critério de destaque** como descritos acima.
5. Rotinas que o CRM já roda (sites, Instagram) aparecem como `ativa` no anel.
6. Fica de fora do relatório: projetos `perdido` e fictícios. Entregues entram só se forem recentes (30 dias) ou se ficou algo pendurado. A tela usa a mesma regra para os entregues.
7. As definições de atraso e de vencido são as do `/api/painel`, para o relatório bater com o Início do CRM.
8. `/api/cerebro` fica atrás da mesma proteção do resto do CRM. Como o CRM é acessível em crm.luccasmadia.com.br (atrás do Cloudflare Access), o conteúdo do CLAUDE.md e das skills também fica visível por lá para quem passa pelo Access. A pasta não deve guardar senhas nem tokens.
