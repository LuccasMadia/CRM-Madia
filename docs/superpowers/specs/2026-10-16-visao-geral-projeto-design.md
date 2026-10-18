# Visão geral do projeto: nicho, categorias, mensalidade e pré-visualização

Data: 2026-10-16
Status: aprovado em conversa, aguardando revisão desta spec

## Objetivo

Deixar a página do projeto (aba **Visão geral**, em `/projetos/:id`) mais simples e útil para projetos de **Sites e Sistemas**:

- classificar o projeto por **nicho** (Barbearia, Sorveteria…) e por **categoria** (Site, Landing page, Sistema, SaaS…);
- tirar dali a troca de etapa, que passa a acontecer **só pelo Funil**;
- escolher **quando a mensalidade começa** a ser cobrada;
- ver uma **pré-visualização** do site no ar, com acesso rápido ao site e ao GitHub;
- redesenhar a aba em cartões, no tema escuro atual.

Projetos de Google Meu Negócio e Placas NFC não mudam: eles não abrem essa página no uso normal (vivem no perfil do cliente).

## Decisões tomadas com o Lucca

| Tema | Decisão |
|------|---------|
| Categoria x linhas de serviço | As categorias **substituem** as linhas com preço (Sistemas/SaaS) dos sites. |
| Preço por categoria | **Não existe.** Cada venda é um projeto separado (um site e um SaaS para o mesmo cliente são dois projetos). O valor do projeto é digitado direto. |
| Listas | Categorias e nichos são **cadastrados em Configurações**. O nicho também pode ser criado direto no projeto ("+ novo nicho"). |
| Categoria obrigatória | Projeto de site/sistema tem **pelo menos uma** categoria. |
| Etapa | Só muda pelo Funil. Na Visão geral aparece só para leitura. |
| Início da mensalidade | Três modos: ao entrar em desenvolvimento, na entrega, ou a partir de uma data. |
| Primeira mensalidade | Vence **na própria data do gatilho** (data de início, de entrega ou a escolhida). |
| Pré-visualização | `iframe` do link do site no ar (`live_url` do portfólio), com plano B. |

## 1. Dados (migration 016)

Backup do banco antes de aplicar: `data/crm-backup-antes-016-<data>.db`.

### Tabelas novas

```sql
CREATE TABLE categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE nichos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  criado_em TEXT NOT NULL
);

CREATE TABLE projetos_categorias (
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  PRIMARY KEY (projeto_id, categoria_id)
);
```

### Colunas novas em `projetos`

- `nicho_id INTEGER REFERENCES nichos(id)`: opcional.
- `mensalidade_inicio_modo TEXT NOT NULL DEFAULT 'entrega' CHECK (... IN ('desenvolvimento', 'entrega', 'data'))`.
- `mensalidade_inicio_data TEXT`: usada só no modo `data`.

### Conteúdo inicial e conversão

- As categorias começam com **Site, Landing page, Sistema e SaaS**, nessa ordem. A lista de nichos começa vazia.
- Cada projeto `site_sistema` recebe categorias assim:
  - linha `sistemas` vira **Sistema**;
  - linha `saas` vira **SaaS**;
  - projeto sem nenhuma linha vira **Site**. No banco real são os 9 projetos de hoje, e o Lucca corrige depois o que precisar.
- Depois da conversão, as linhas `sistemas`/`saas` de `projetos_servicos` são apagadas. O `valor_total_centavos` e o `desconto_centavos` de cada projeto não mudam.
- Mensalidades que já existem:
  - projeto com mensalidade ativa e alguma parcela de mensalidade: modo `data`, com `mensalidade_inicio_data` igual ao vencimento da primeira mensalidade;
  - projeto com mensalidade ativa e sem parcela de mensalidade (hoje são os projetos 12 e 13): modo `entrega`;
  - projeto GMN/placas com mensalidade: modo `data`, com a data de criação do projeto, o que mantém o comportamento atual.
- As chaves de config `preco_servico_sistemas_centavos` e `preco_servico_saas_centavos` são apagadas. O preço sugerido de GMN continua.

## 2. Servidor

### Categorias e nichos

Seguem o padrão das rotas existentes:

- `GET/POST /api/categorias`, `PUT/DELETE /api/categorias/:id`. Os campos são `nome` (obrigatório, único sem diferenciar maiúsculas) e `ordem`.
- `GET/POST /api/nichos`, `PUT/DELETE /api/nichos/:id`. O campo é `nome` (obrigatório, único).
- Excluir uma categoria ou um nicho que algum projeto usa responde **409**, com a mensagem "Em uso por N projeto(s)".
- Nome repetido responde **400** em `nome` com a mensagem "Já existe".

### Projeto

- O projeto passa a aceitar `categorias: number[]` (ids) e `nicho_id`. O GET devolve `categorias: [{ id, nome }]`, em ordem, e `nicho_nome`.
- Em projeto `site_sistema`:
  - ao criar, `categorias` precisa ter pelo menos 1 id existente; uma lista vazia dá erro 400 em `categorias` com "Escolha pelo menos uma categoria". Se o campo não vier no corpo (chamadas antigas e testes), o servidor usa "Site". Quem obriga a escolher é a tela;
  - ao editar, se `categorias` vier no corpo, vale a mesma regra.
- Em projeto GMN/placas, mandar `categorias` responde 400 com "Só sites e sistemas têm categorias".
- Site/sistema deixa de aceitar `servicos` (linhas) e `desconto_centavos`. O valor vem de `valor_total_centavos`. As linhas de placas continuam como estão.
- **Etapa**: o `PUT /projetos/:id` continua aceitando `etapa`, porque o Funil usa. A restrição a "só pelo Funil" fica na interface.
- **Data de início automática**: quando a etapa muda para `andamento` e `data_inicio` está vazia, ela recebe a data de hoje. Isso fica em `aplicarRegrasProjeto`, do mesmo jeito que já acontece com `data_entrega` na entrega.

### Mensalidade

- Os campos novos de mensalidade são validados:
  - modo `data` exige `mensalidade_inicio_data`;
  - os outros dois modos ignoram esse campo.
- **Data de início da cobrança** (`inicioMensalidade(projeto)`, função pura em `server/domain/mensalidade.js`):
  - modo `desenvolvimento`: `data_inicio`;
  - modo `entrega`: `data_entrega`;
  - modo `data`: `mensalidade_inicio_data`;
  - se a data do modo estiver vazia, a cobrança ainda não começou e não gera nada.
- **Datas devidas** (`mensalidadesDevidas(projeto, hoje)`, função pura):
  - a primeira vence **na data de início**;
  - as seguintes vencem todo mês no `mensalidade_dia_vencimento`, ajustado para o último dia em meses curtos;
  - só entram datas até o mês de `hoje`, incluindo esse mês.
  - Exemplo: início em 15/11 e dia 15 geram 15/11, 15/12, 15/01…
- **Dia de vencimento**: no formulário, ele vem preenchido com o dia da data de início assim que essa data existe. O Lucca pode trocar.
- **Geração** (`gerarMensalidades(db, projeto, hoje)`):
  - cria uma parcela "Mensalidade" para cada mês devido que ainda não tem parcela de mensalidade naquele mês;
  - preenche meses que ficaram para trás, sem duplicar;
  - roda em `GET /projetos/:id/parcelas` (como hoje), em `GET /parcelas` (Financeiro) e em `GET /painel` / `GET /painel/graficos` (Início), para todos os projetos com mensalidade ativa.

## 3. Interface

### Configurações

Há duas seções novas, **Categorias** e **Nichos**:

- cada uma é uma lista simples com adicionar, renomear e excluir;
- excluir pede confirmação e mostra o erro 409 quando o item está em uso;
- categorias têm setas para mudar a ordem.

Saem os campos de preço de Sistemas e SaaS.

### Funil: nova oportunidade e edição

- O componente `CamposServicos` sai.
- No lugar entram:
  - **Categorias**: pílulas marcáveis, das quais pelo menos uma é obrigatória, com o erro mostrado no campo;
  - **Valor (R$)**: digitado direto;
  - **Nicho**: campo opcional, igual ao da Visão geral.

### Visão geral (`AbaGeral`), nova estrutura

```
┌───────────────────────────────────────────┐ ┌─────────────────────────────┐
│ Sobre                                     │ │ Pré-visualização            │
│ Título  [..............................]  │ │ ┌─────────────────────────┐ │
│ Cliente [Ana ▾]     Nicho [Barbearia ▾]   │ │ │   site no ar (iframe)   │ │
│ Categorias (Site) (Landing) [Sistema] … │ │ │                         │ │
│ Descrição interna [..................]    │ │ └─────────────────────────┘ │
│ Notas [..............................]    │ │ [Abrir site ↗] [GitHub ↗]   │
├───────────────────────────────────────────┤ ├─────────────────────────────┤
│ Prazos                                    │ │ Etapa  ● Em andamento       │
│ Início [  ]  Prazo [  ]  Entrega [  ]     │ │        alterar no Funil →   │
├───────────────────────────────────────────┤ │ ◻ Postou no Instagram       │
│ Cobrança                                  │ │ ◻ Projeto fictício          │
│ Valor [R$ ....]                           │ └─────────────────────────────┘
│ ◻ Cobra mensalidade                       │
│   Valor [...]  Dia [..]                   │
│   Começa: (•) Na entrega                  │
│           ( ) Ao entrar em desenvolvimento│
│           ( ) A partir de [data]          │
│   "1ª mensalidade em 15/11/2026"          │
└───────────────────────────────────────────┘
                     [Salvar projeto]                     excluir projeto
```

- **Layout**: grade de duas colunas, a da esquerda com cerca de 2/3 da largura e a da direita com 1/3. Abaixo de ~900px vira uma coluna só, com a pré-visualização depois de "Sobre".
- **Cartões**: usam o `.cartao` existente, com títulos pequenos em cinza. As datas de Prazos ficam lado a lado.
- **Etapa**: não tem mais select. Aparece como ponto colorido + texto (o mesmo estilo `.etapa` da lista) e um link "alterar no Funil" para `/funil`.
- **Nicho**: select com os nichos e a opção "+ novo nicho…".
  - Escolher essa opção abre um campo de texto pequeno, ali mesmo, com um botão Adicionar.
  - O nicho é criado na API e já fica selecionado.
- **Categorias**: pílulas (o mesmo `.pilula` da lista de Sites). Clicar marca ou desmarca. Se o Lucca tentar salvar sem nenhuma, aparece o erro no campo.
- **Mensalidade**:
  - Os campos aparecem quando "Cobra mensalidade" está marcado.
  - O modo se escolhe por rádio.
  - Abaixo vem uma frase de resumo:
    - quando já dá para calcular: "1ª mensalidade em 15/11/2026";
    - no modo entrega, sem data de entrega: "Começa quando o projeto for entregue";
    - no modo desenvolvimento, sem data de início: "Começa quando entrar em desenvolvimento".
- **Rodapé**: "Salvar projeto" é o botão principal. "Excluir projeto" fica como link discreto em vermelho, à direita, com a confirmação de hoje.
- **Cabeçalho da página** (`Projeto.jsx`): continua com cliente, título, etapa e valor. A etapa usa o estilo `.etapa`, com ponto em vez de pílula.

### Pré-visualização

- **Fonte dos dados**: `GET /projetos/:id/portfolio`, que já existe e traz `live_url`, `code_url` e as imagens.
- **Com `live_url`**:
  - um `iframe` com `sandbox="allow-scripts allow-same-origin allow-forms"`, `loading="lazy"`, `referrerpolicy="no-referrer"` e título "Pré-visualização de <título>";
  - a área tem proporção 16:10, e o iframe é renderizado em 1280px de largura e reduzido com `transform: scale()` para mostrar o site como no computador.
- **Sem `live_url`**:
  - se houver imagem de capa no portfólio, mostra a capa;
  - se não houver, um aviso: "Sem link do site. Adicione em Divulgação → Portfólio."
- **Botões**:
  - "Abrir site ↗" (`live_url`) e "GitHub ↗" (`code_url`), cada um só quando o link existe, com `target="_blank" rel="noreferrer"`;
  - ficam sempre visíveis, porque não dá para detectar com segurança quando o site bloqueia ser aberto dentro de outra página (X-Frame-Options/CSP). Nesse caso o iframe aparece em branco e o botão resolve.

## 4. Fora do escopo

- Mudar GMN e Placas.
- Ler dados do repositório GitHub do projeto (commits, README). O CRM continua guardando só o link.
- Gerar imagem (screenshot) do site no servidor.
- Filtrar a lista de Sites e Sistemas por nicho ou categoria. É uma boa próxima etapa, mas fica fora deste trabalho.
- Notificações de mensalidade.

## 5. Testes

- **Domínio** (puro):
  - `inicioMensalidade` nos três modos, inclusive com a data vazia;
  - `mensalidadesDevidas`:
    - primeira na data do gatilho;
    - meses seguintes no dia escolhido;
    - dia 31 em fevereiro;
    - nada antes do início;
    - nada depois do mês atual.
- **Migration**:
  - conversão das linhas para categorias;
  - projeto sem linha recebe Site;
  - os três casos de mensalidade;
  - chaves de preço apagadas.
- **Rotas**:
  - CRUD de categorias e nichos, nome repetido e exclusão em uso (409);
  - projeto site sem categoria (400);
  - GMN com categoria (400);
  - `data_inicio` automática ao ir para andamento;
  - geração de mensalidades (preenche meses atrasados, não duplica, roda no Financeiro e no painel).
- **Interface**:
  - Visão geral sem o select de etapa e com o link para o Funil;
  - pílulas de categoria, inclusive o erro sem nenhuma marcada;
  - "+ novo nicho" cria e seleciona;
  - frase da 1ª mensalidade nos três modos;
  - pré-visualização com iframe, com capa, com o aviso e com os botões;
  - Configurações com as listas;
  - nova oportunidade no Funil com categorias e valor.
