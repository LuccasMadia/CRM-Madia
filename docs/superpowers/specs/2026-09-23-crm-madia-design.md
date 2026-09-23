# CRM Madia — Design

**Data:** 2026-09-23
**Status:** aguardando revisão

## 1. Objetivo

Ferramenta pessoal (usuário único: Luccas) para controlar clientes, projetos, funil de vendas, financeiro, tarefas e o planejamento de conteúdo do Instagram e do portfólio. O CRM também passa a ser a **fonte de dados dos projetos exibidos no portfólio** (`LuccasMadia/Luccas-Madia-Portif-lio`).

### Critérios de sucesso

- Abrir o CRM de manhã e ver, numa tela, o que vence nos próximos 7 dias (tarefas, parcelas, entregas, conteúdos).
- Saber a qualquer momento quanto há a receber, o que está atrasado e quanto foi recebido por mês.
- Acompanhar oportunidades desde o primeiro contato até a entrega num kanban.
- Planejar posts do Instagram e atualizações do portfólio com status e datas.
- Publicar no portfólio pelo CRM: o site passa a exibir exatamente os projetos marcados como "publicar".
- A primeira publicação, depois da migração, gera um site **idêntico** ao atual.

### Fora do escopo (por enquanto)

Login e autenticação, acesso remoto ou pelo celular, multiusuário, integração com a API do Instagram/Meta, notificações, relatórios em PDF, histórico de interações com clientes (as notas livres cobrem esse papel).

## 2. Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Onde roda | Local, só no computador do Luccas | Usuário único, sem custo, sem infraestrutura |
| Arquitetura | App web local: Express + SQLite + Vite/React | Mesma stack do portfólio; o servidor tem acesso ao disco para escrever no repositório do portfólio |
| Banco | `node:sqlite` (nativo do Node 24) | Sem compilação nativa no Windows; um arquivo `.db` fácil de fazer backup |
| Funil de vendas | É a etapa do projeto, não uma entidade separada | Evita cadastro duplicado e conversão de lead em cliente |
| Integração com o portfólio | O CRM gera `src/data/projects.json` + `public/projects/<slug>/` no clone local | Site continua estático; deploy segue sendo push → Vercel |
| Financeiro | Sempre calculado a partir das parcelas | Nenhum saldo digitado à mão que possa ficar inconsistente |

## 3. Modelo de dados

Todas as tabelas têm `id INTEGER PRIMARY KEY`, `criado_em` e `atualizado_em` (ISO 8601). Datas sem hora são guardadas como `YYYY-MM-DD`. Valores em dinheiro ficam em **centavos** (`INTEGER`) para evitar erros de arredondamento.

### clientes
`nome` (obrigatório), `empresa`, `email`, `telefone`, `instagram`, `origem` (texto livre com sugestões: indicação, Instagram, site, outro), `notas`.

### projetos
`cliente_id` (FK, obrigatório), `titulo` (obrigatório), `descricao` (interna), `etapa`, `valor_total_centavos`, `data_inicio`, `prazo_entrega`, `data_entrega`, `notas`.

`etapa` ∈ `contato` → `proposta` → `andamento` → `entregue`, ou `perdido`. Ao mover para `entregue`, `data_entrega` é preenchida com a data atual se estiver vazia.

Um cliente sem nenhum projeto em `andamento` ou `entregue` é, na prática, um lead.

### parcelas
`projeto_id` (FK, cascade), `descricao` (ex.: "Entrada 50%"), `valor_centavos` (> 0), `vencimento` (obrigatório), `pago_em` (nulo = pendente).

Estados derivados:
- **paga**: `pago_em` preenchido
- **atrasada**: não paga e `vencimento < hoje`
- **pendente**: não paga e `vencimento >= hoje`

A soma das parcelas pode diferir de `valor_total`. A tela do projeto mostra a diferença como "não parcelado", e isso não é tratado como erro.

### tarefas
`projeto_id` (FK, cascade), `texto` (obrigatório), `prazo`, `concluida` (0/1), `ordem`.

### portfolio (1:1 com projetos)
`projeto_id` (FK único, cascade), `publicar` (0/1), `slug` (único, `[a-z0-9-]+`, usado na pasta das imagens), `titulo_publico`, `descricao_publica`, `stack` (JSON array de strings), `status_publico` (ex.: "Em funcionamento", "Em desenvolvimento"), `live_url`, `code_url`, `ordem`.

### portfolio_imagens
`portfolio_id` (FK, cascade), `arquivo` (caminho relativo dentro de `data/uploads/`), `ordem`. Formam o array `images` do site, na ordem definida.

### portfolio_case_study
`portfolio_id` (FK, cascade), `titulo`, `descricao`, `imagem_id` (FK para `portfolio_imagens`), `ordem`. Formam o array `caseStudy`.

### conteudos
`projeto_id` (FK opcional, set null), `canal` ∈ `instagram` | `portfolio`, `tipo` ∈ `post` | `carrossel` | `reels` | `story` | `atualizacao`, `titulo` (obrigatório), `legenda`, `status` ∈ `ideia` → `produzindo` → `agendado` → `publicado`, `data_planejada`, `data_publicada`, `link`.

Ao mover para `publicado`, `data_publicada` é preenchida com a data atual se estiver vazia.

### config
Tabela chave/valor. Chave inicial: `portfolio_repo_path`.

## 4. Telas

Barra lateral fixa com: Início, Funil, Clientes, Conteúdo, Financeiro, Configurações. O detalhe do projeto é acessado a partir do funil, do cliente ou de busca.

1. **Início**: quatro cartões (a receber no mês corrente, parcelas atrasadas com soma, projetos em andamento, propostas abertas com soma dos valores) e a lista "Próximos 7 dias", que junta tarefas não concluídas com prazo, parcelas não pagas vencendo, entregas de projeto em andamento e conteúdos não publicados, ordenados por data. Itens atrasados aparecem no topo, destacados.
2. **Funil**: kanban com colunas `contato`, `proposta`, `andamento`, `entregue`. A coluna `perdido` fica recolhida por padrão. Mudar de etapa é feito arrastando o card, e o menu do card oferece a mesma ação como alternativa acessível. O card mostra título, cliente, valor e prazo. O botão "+ Oportunidade" abre um formulário que permite escolher um cliente existente ou criar um novo ali mesmo.
3. **Clientes**: lista com busca por nome, empresa ou email. O detalhe mostra contato, notas, projetos e total faturado (soma das parcelas pagas).
4. **Projeto**: cabeçalho com cliente, etapa e valor, e as abas:
   - *Visão geral*: edição dos campos do projeto
   - *Tarefas*: checklist com prazo, reordenável
   - *Financeiro*: parcelas com estado, botão "marcar como pago" (usa a data de hoje, editável), totais pago, pendente e não parcelado
   - *Portfólio*: interruptor publicar, campos públicos, upload de imagens (PNG, JPG, WEBP, até 10 MB cada), reordenação, editor de slides do case study
   - *Conteúdos*: conteúdos ligados ao projeto, com atalho para criar um novo
5. **Conteúdo**: kanban por status, com filtro por canal. Alternativa em calendário mensal por `data_planejada`. Conteúdos sem data aparecem numa lista lateral "sem data".
6. **Financeiro**: tabela de todas as parcelas com filtros por estado e mês, e total recebido por mês no ano corrente.
7. **Configurações**: caminho do repositório do portfólio (validado ao salvar), botão "Publicar no portfólio", "Importar do portfólio" (migração) e "Exportar backup (.zip)".

## 5. Publicação no portfólio

### Contrato do arquivo gerado

`<repo>/src/data/projects.json`:

```json
{
  "generatedAt": "2026-09-23T12:00:00.000Z",
  "stats": { "projectsDelivered": 6 },
  "projects": [
    {
      "id": "rango-do-bicho",
      "title": "Rango do Bicho",
      "description": "…",
      "stack": ["React", "Vite"],
      "status": "Em funcionamento",
      "liveUrl": "https://…",
      "codeUrl": "https://github.com/…",
      "images": ["/projects/rango-do-bicho/01.png", "…"],
      "caseStudy": [
        { "titulo": "…", "imagem": "/projects/rango-do-bicho/01.png", "descricao": "…" }
      ]
    }
  ]
}
```

- `id` = `slug`. Os campos `status`, `liveUrl`, `codeUrl` e `caseStudy` são omitidos quando vazios, mantendo o comportamento atual dos componentes, que checam a presença deles.
- Os projetos seguem `portfolio.ordem`.
- `stats.projectsDelivered` = quantidade de projetos com etapa `entregue`, publicados ou não.
- As imagens são copiadas para `<repo>/public/projects/<slug>/NN<ext>`, onde `NN` é a posição com dois dígitos (`01`, `02`…). Isso produz nomes estáveis e previsíveis.

### Fluxo

1. **Validar** (`validate.js`): `portfolio_repo_path` existe, contém `.git` e `package.json`. Cada projeto com `publicar = 1` precisa de `slug` válido e único, `titulo_publico`, `descricao_publica`, ao menos 1 item em `stack` e ao menos 1 imagem, e cada slide do case study precisa de título e imagem. Se houver erros, a publicação é bloqueada e a lista de erros é devolvida, com o projeto e o campo de cada um.
2. **Gerar** (`build.js`, função pura): dados do banco → objeto do contrato acima + lista de cópias `{origem, destino}`.
3. **Prévia** (`diff.js`, função pura): compara com o `projects.json` atual do repositório, se houver, e lista projetos adicionados, removidos e alterados (quais campos mudaram, quantas imagens mudaram). Um hash do conteúdo detecta imagens alteradas. A tela exibe a prévia e pede confirmação.
4. **Gravar** (`write.js`): escreve o JSON (formatado, 2 espaços, `\n` no fim), copia as imagens e remove de `public/projects/` os arquivos e pastas que não estão no resultado. Só escreve em `src/data/projects.json` e `public/projects/**`.
5. **Commit e push** (`git.js`, botão separado e opcional): `git add -- src/data/projects.json public/projects`, `git commit -m "chore(portfolio): atualiza projetos via CRM"` e `git push`. Se não houver mudanças, informa e não cria commit. A saída de erro do git é exibida na íntegra.

### Erros

Caminho inválido, falha de escrita ou falha no git geram uma mensagem clara na tela. A gravação monta as imagens primeiro em `public/.projects-tmp/` e só então troca essa pasta por `public/projects` (e grava o JSON por último). Assim, uma falha no meio não deixa o site com imagens pela metade.

### Mudanças no portfólio (feitas uma vez, no repositório do portfólio)

- `src/data/content.js`: remove o array `projects` e os imports de imagem, passa a fazer `import data from './projects.json'`, exporta `projects = data.projects` e usa `data.stats.projectsDelivered` em `about.projectsDelivered`.
- As imagens passam a vir de `public/projects/<slug>/`, geradas pela primeira publicação do CRM. Depois de confirmar que o site ficou idêntico, `src/assets/projects/` é apagado manualmente, num commit do portfólio. O CRM nunca mexe em `src/assets`.
- Ajusta `content.test.js` e `Projects.test.jsx` para a nova origem de dados.

### Migração inicial (`import.js`)

Lê o `src/data/content.js` do repositório configurado. Para isso, carrega o módulo com o Vite do próprio portfólio (`vite-node` ou `ssrLoadModule`), o que resolve os imports de imagem para caminhos reais. Para cada projeto, cria cliente (nome = título do projeto, editável depois), projeto na etapa `entregue`, registro de portfólio com `publicar = 1`, imagens copiadas para `data/uploads/` e slides do case study. Se o slug já existir no CRM, o projeto é ignorado, então rodar a importação duas vezes não duplica nada.

Verificação: importar → publicar → os `projects` do JSON gerado correspondem ao array original campo a campo (com as imagens comparadas por conteúdo).

## 6. Estrutura do código

```
crm-madia/
├── package.json          # scripts: start (servidor + vite), dev, test, lint
├── data/                 # ignorado no git: crm.db, uploads/
├── server/
│   ├── index.js
│   ├── db/connection.js
│   ├── db/migrations/    # NNN_nome.sql, aplicadas em ordem, registradas em schema_migrations
│   ├── repos/            # acesso ao banco, 1 arquivo por tabela
│   ├── domain/           # regras puras: financeiro.js, painel.js, etapas.js
│   ├── routes/           # Express routers em /api/*
│   └── portfolio/        # validate, build, diff, write, git, import
└── web/src/
    ├── api/
    ├── pages/            # Inicio, Funil, Clientes, ClienteDetalhe, Projeto, Conteudo, Financeiro, Config
    └── components/       # Kanban, Calendario, Modal, campos de formulário, MoneyInput
```

- `npm start` sobe o servidor Express (porta 5174, somente `127.0.0.1`) e o Vite, com proxy de `/api` para o servidor.
- A API responde JSON. Erros de validação retornam `400 { erros: [{ campo, mensagem }] }`, e o frontend mostra cada erro ao lado do campo.
- Uploads via `multer` para `data/uploads/<uuid><ext>`.
- Backup: zip de `data/` gerado sob demanda.

## 7. Testes

Vitest em todo o projeto; Testing Library no frontend.

- **Domínio (unidade)**: estados das parcelas, totais do mês, atrasados, montagem da lista "Próximos 7 dias", regras de mudança de etapa.
- **Portfólio (unidade)**: `validate`, `build` e `diff` com dados fixos.
- **Escrita**: `write.js` contra uma pasta temporária, conferindo JSON, imagens copiadas e limpeza de arquivos órfãos.
- **API**: cada rota com SQLite em memória (`:memory:`), cobrindo o caso feliz e os erros de validação.
- **Migração**: `import.js` usando uma cópia fixa do `content.js` e das imagens atuais do portfólio, seguido de publicação e comparação com o original.
- **Frontend**: formulários de cliente e projeto, mudança de etapa no funil (pelo menu), marcar parcela como paga.
