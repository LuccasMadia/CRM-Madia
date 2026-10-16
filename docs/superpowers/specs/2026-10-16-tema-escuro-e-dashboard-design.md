# Tema escuro turquesa + Dashboard na Início — Design

**Data:** 2026-10-16
**Referência visual:** dashboard "Nexora CRM" (cards com ícone, funil, barras, rosca, linha), adaptado para tema escuro.

## Objetivo

1. Dar ao app inteiro uma identidade visual nova: **tema escuro** (fundo preto, cards cinza-escuro) com **turquesa** de destaque.
2. Transformar a tela **Início** num dashboard com 4 gráficos alimentados pelos dados reais do CRM.

## Ordem de entrega

1. **Tema** em todo o app (independente; plano próprio).
2. Plano já existente `2026-10-15-perfil-cliente-por-servico.md` (introduz `projetos.servico`).
3. **Dashboard** (plano próprio, depende de `projetos.servico`).

---

## Parte 1 — Tema

Só a "pele": estrutura das telas, formulários e textos não mudam.

### Tokens (`web/src/styles.css`, `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--fundo` | `#0a0a0b` | fundo da página |
| `--superficie` | `#141517` | cards, sidebar, tabelas |
| `--superficie-2` | `#1c1e21` | inputs, hover, cards do kanban |
| `--borda` | `#24262a` | bordas e linhas de grade |
| `--texto` | `#ececee` | texto |
| `--texto-suave` | `#8b9099` | rótulos, meta |
| `--primaria` | `#2dd4bf` | botão principal, links, item ativo |
| `--primaria-texto` | `#04201c` | texto sobre turquesa sólido |
| `--primaria-suave` | `rgb(45 212 191 / 0.12)` | fundo de item ativo / etiqueta turquesa |
| `--t1`…`--t5` | `#5eead4` `#2dd4bf` `#14b8a6` `#0d9488` `#0f766e` | escala dos gráficos |
| `--perigo` | `#f87171` | atrasado, perdido, erro |
| `--ok` | `#4ade80` | pago, entregue, publicado |
| `--atencao` | `#fbbf24` | proposta |
| `--raio` | `16px` | cards |
| `--raio-controle` | `10px` | botões, inputs |
| `--sombra` | `0 8px 24px rgb(0 0 0 / 0.35)` | cards |

- **Sempre escuro:** remover o bloco `@media (prefers-color-scheme: dark)` e usar `color-scheme: dark`.
- **Fonte:** Inter via dependência `@fontsource-variable/inter` (importada em `web/src/main.jsx`), com fallback `system-ui`. Funciona offline no PWA.
- `theme_color`/`background_color` do manifest PWA (em `vite.config.js`) passam a `#0a0a0b`.

### Componentes visuais

- **Cards** (`.cartao`, `.kanban__coluna`): raio 16px, borda `--borda`, sombra `--sombra`.
- **Botões e campos:** raio 10px; inputs com fundo `--superficie-2`; `.btn--primario` turquesa sólido com `--primaria-texto`.
- **Etiquetas em pílula:** sem contorno, fundo translúcido da cor + texto na cor.
  - entregue / paga / publicado → `--ok`
  - atrasada / perdido → `--perigo`
  - andamento / agendado → `--primaria`
  - proposta → `--atencao`
  - demais → `--superficie-2` + `--texto-suave`
- **Sidebar:** item ativo com fundo `--primaria-suave` e texto `--primaria` (não mais bloco sólido); hover com `--superficie-2`.
- **Abas:** aba selecionada com sublinhado turquesa (mantém).
- **Cabeçalho de página** (`.pagina__topo`): `.sobretitulo` pequeno e suave + `h1` maior (≈2rem, peso 700).
- **Cartões de número** (`Numero.jsx`): ganham prop opcional `icone` (nome de `Icone.jsx`), renderizado num quadrado 44px com fundo `--primaria-suave` e cor `--primaria` à esquerda do valor. Sem `icone`, fica como hoje.

### Verificação

Sem teste automático de estilo. Conferir no app real todas as telas (Início, Funil, Projetos, projeto e abas, Clientes, cliente, QR codes, Placas e abas, Conteúdo, Financeiro, Config), incluindo modais, kanban, tabelas, avisos e largura de celular. Testes existentes continuam passando (se `Numero` mudar de markup, ajustar os que dependem dele).

---

## Parte 2 — Dados do dashboard (servidor)

### Rota

`GET /painel/graficos` em `server/routes/painel.js`, separada de `GET /painel`. Contas como funções puras em `server/domain/graficos.js`; a rota só faz as consultas e chama as funções. Usa `hoje()` injetado (como `/painel`).

Regra geral: **projetos com `ficticio = 1` ficam fora** de todos os gráficos.

### Resposta

```json
{
  "funil": {
    "etapas": [
      { "etapa": "contato",   "quantidade": 24, "percentual": 100 },
      { "etapa": "proposta",  "quantidade": 12, "percentual": 50 },
      { "etapa": "andamento", "quantidade": 7,  "percentual": 29 },
      { "etapa": "entregue",  "quantidade": 5,  "percentual": 21 }
    ],
    "perdidos": 3
  },
  "recebido_por_mes": [ { "mes": "2026-05", "total_centavos": 320000 }, "... 6 itens, do mais antigo ao atual" ],
  "origens": { "total": 42, "fatias": [ { "nome": "Instagram", "quantidade": 17 }, "... até 5 itens" ] },
  "por_servico": [
    { "servico": "site_sistema", "total_centavos": 1840000 },
    { "servico": "google_meu_negocio", "total_centavos": 360000 },
    { "servico": "placas_nfc", "total_centavos": 520000 }
  ]
}
```

### Regras

**Funil — `montarFunil(projetos)`**
- Considera só `servico = 'site_sistema'`.
- Ordem das etapas: contato → proposta → andamento → entregue. Cada etapa conta os projetos que **chegaram pelo menos até ela** (cumulativo): um `entregue` conta nas 4; um `andamento` nas 3 primeiras etc.
- `perdido` conta só em `contato` e em `perdidos`.
- `percentual` = quantidade / quantidade de contato × 100, arredondado; 0 quando contato = 0.

**Recebido por mês — `recebidoPorMes(parcelas, hoje)`**
- Parcelas com `pago_em` preenchido, somadas pelo mês (`AAAA-MM`) de `pago_em`.
- Sempre 6 itens: os 5 meses anteriores + o mês atual, do mais antigo ao mais novo; mês sem pagamento = 0.

**Origens — `agruparOrigens(clientes)`**
- Agrupa `clientes.origem` ignorando maiúsculas/minúsculas e espaços nas pontas; o nome exibido é a grafia mais frequente do grupo (empate: a primeira em ordem alfabética).
- Vazio/nulo → "Não informado".
- Ordena por quantidade (desc); mantém as 4 maiores e soma o resto em "Outros" (só se houver resto).
- `total` = número de clientes.
- Considera todos os clientes (clientes não têm flag de fictício).

**Por serviço — `faturamentoPorServico(parcelas, hoje)`**
- Parcelas pagas com `pago_em` nos últimos 12 meses (mês atual + 11 anteriores), somadas pelo `servico` do projeto.
- Sempre os 3 serviços, na ordem `site_sistema`, `google_meu_negocio`, `placas_nfc`; sem valor = 0.

### Testes (`server/domain/graficos.test.js` + rota)

- Funil cumulativo; perdidos só em contato; percentual com contato = 0; só `site_sistema`.
- Recebido: 6 meses com zeros, virada de ano (ex.: hoje = 2027-02 → 2026-09…2027-02), parcela não paga ignorada.
- Origens: agrupamento por caixa/espaço, "Não informado", corte em 4 + "Outros", sem "Outros" quando ≤ 4.
- Por serviço: janela de 12 meses, serviços sem valor = 0.
- Rota: fictícios fora em todos os blocos; formato da resposta.

---

## Parte 3 — Tela Início e componentes

### Layout (`web/src/pages/Inicio.jsx`)

1. Cabeçalho: sobretítulo "Olá, Lucca", `h1` "Início", data de hoje por extenso à direita.
2. 4 cartões de número com ícone (mesmos dados de hoje).
3. Grade 2 colunas: **Funil de oportunidades** | **Faturamento por serviço** (subtítulo "últimos 12 meses").
4. Grade 2 colunas: **De onde vêm os clientes** | **Recebido por mês** (subtítulo "últimos 6 meses").
5. Tarefas: projetos reais | projetos fictícios (como hoje).
6. Próximos 7 dias (como hoje).

Grades viram 1 coluna abaixo de ~900px.

Busca `/painel` e `/painel/graficos` separadamente; erro em gráficos mostra `Aviso` no lugar dos gráficos sem derrubar o resto; enquanto carrega, os cards de gráfico mostram "Carregando…".

### Componentes (`web/src/components/graficos/`)

- `CartaoGrafico.jsx` — card com `titulo`, `subtitulo` opcional e `vazio` (bool) → mostra "Ainda sem dados" no lugar do gráfico.
- `Funil.jsx` — **SVG próprio**: faixas em trapézio empilhadas, largura proporcional à quantidade (com largura mínima para a última faixa caber o número), cores `--t1`…`--t4`, quantidade dentro da faixa, nome da etapa + percentual à direita; linha "N perdidos" abaixo quando > 0. Cada faixa com `<title>` para dica nativa.
- `GraficoBarras.jsx`, `GraficoRosca.jsx`, `GraficoLinha.jsx` — **Recharts**, já com cores do tema, grade `--borda`, eixos `--texto-suave`, tooltip escuro (fundo `--superficie-2`, borda `--borda`) e valores formatados com `formatarDinheiro`. Rosca mostra o total no centro e legenda ao lado com percentuais; linha com área em degradê turquesa.
- Os três gráficos Recharts são carregados com `React.lazy` + `Suspense` só na Início.

Rótulos: etapas via `ROTULO_ETAPA` de `rotulos.js`; serviços via `ROTULO_SERVICO` (criado no plano do perfil); mês como "Mai", "Jun"….

### Dependências novas

- `recharts` (gráficos).
- `@fontsource-variable/inter` (fonte; Parte 1).

### Testes web

- `Funil.test.jsx`: renderiza nomes, quantidades e percentuais; linha de perdidos aparece só quando > 0.
- `Inicio.test.jsx`: `vi.mock('recharts')` com componentes simples (jsdom não mede tamanho); verifica títulos dos 4 cards de gráfico, legenda da rosca, estado "Ainda sem dados" e que erro em `/painel/graficos` não esconde tarefas nem próximos.

## Fora de escopo

- Filtro de período nos gráficos ("Este mês", "Últimos 6 meses").
- Modo claro.
- Redesenho estrutural de outras telas além da Início.
- Registrar em que etapa um projeto foi perdido.
