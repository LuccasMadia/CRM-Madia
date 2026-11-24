# Integração com o GitHub — design

## Intenção
O Lucca quer que o GitHub e o CRM andem juntos: saber quais repositórios já têm projeto, criar o repositório quando nasce um projeto, ver a frequência de commits e conferir que nada privado virou público.
É a primeira das integrações do Cérebro (a mais simples); o calendário Apple fica para depois (design em `2026-11-24-calendario-apple-design.md`).

## Objetivos
- Conectar com um token pessoal nas Configurações (mesmo padrão do Vercel e do Instagram).
- Tela de **auditoria** com cada repositório da conta, o projeto do CRM ligado a ele e a visibilidade (público ou privado).
- Criar o repositório automaticamente quando um projeto de site/sistema real é criado no CRM.
- Mostrar a frequência de commits: gráfico dos últimos 12 meses na página do projeto e, no resumo, os projetos sem commit há muito tempo.
- Avisar o que está fora do conforme (regras abaixo) no "Pede atenção" dos Serviços e no Cérebro.
- O GitHub aparece como app conectado no Cérebro quando há token.

## Não objetivos (v1)
- Tornar repositório público ou mudar visibilidade pelo CRM (o CRM só lê e avisa).
- Apagar, arquivar ou transferir repositórios.
- Ler código, PRs, issues ou Actions; webhooks.
- Mais de uma conta ou organização.
- Criar repositório para projetos fictícios, privados internos, GMN e placas.

## Anti-objetivos (seria falha mesmo funcionando)
- Criar qualquer repositório público.
- Mostrar ou devolver o token pela API, ou deixá-lo nas exportações de backup.
- Criar repositório duplicado a cada vez que o projeto é salvo, ou depois de falha de rede.
- Perder o cadastro do projeto no CRM porque o GitHub falhou.

## Regras de "fora do conforme"
1. Repositório **público** ligado a projeto **real** ou **privado interno**: alerta de perigo.
2. Repositório sem projeto no CRM: alerta (pode ser projeto esquecido).
3. Projeto real em Versão final, Em teste ou Entregue sem repositório: alerta.
4. Repositório público de projeto **fictício** (vitrine) é normal e não alerta.
Repositórios arquivados ou forks são listados, mas não geram alerta de órfão.

## Restrições
- Sem dependência nova: `fetch` para `https://api.github.com`, injetável nos testes, como o cliente do Vercel.
- O token fica em `config.github_token` e entra na limpeza do backup (`server/routes/backup.js`), junto de `vercel_token` e `instagram_token`.
- Token sugerido: fine-grained ou clássico só com acesso a repositórios; o aviso na tela diz que ele dá acesso aos privados e que deve ser exclusivo do CRM.
- Respeitar o limite de chamadas: cache em memória por 10 minutos para listas e commits, botão Atualizar para forçar.
- Interface em português, tema escuro, responsivo.

## Abordagens consideradas
1. **Token guardado + API do GitHub** (escolhida pelo Lucca). Funciona em qualquer lugar onde o CRM rode.
2. Usar o `gh` já logado nesta máquina. Sem segredo no banco, mas só funciona local com `gh` instalado. Descartada pelo Lucca.

## Design
**Dados.** Coluna `github_repo` (texto `dono/nome`, único quando preenchido) em `projetos`. Chaves de `config`: `github_token`, `github_usuario`. Nada mais é salvo: repositórios, visibilidade e commits vêm do GitHub sob demanda, com cache.

**Servidor.** `server/github/cliente.js` (listar repositórios da conta, criar repositório privado, commits por semana via estatísticas, ver visibilidade; erros com `status` como no cliente do Vercel). `server/github/auditoria.js` cruza repositórios com projetos pelas regras acima e devolve a lista de itens e alertas. Rotas: `GET/POST/DELETE /api/github` (estado e conexão, nunca devolve o token), `GET /api/github/repositorios` (auditoria), `GET /api/projetos/:id/github` (commits e visibilidade), `PUT /api/projetos/:id` aceita `github_repo`, `POST /api/projetos/:id/github` cria o repositório e liga.

**Criação automática.** Ao criar projeto de site/sistema **real** (não fictício, não privado interno) com o GitHub conectado, o CRM cria o repositório privado com o título do projeto em minúsculas e com hífens; nome já usado ganha sufixo. A criação acontece depois de o projeto ser salvo, em segundo plano. Se falhar, o projeto continua criado e o card mostra "Criar repositório" para tentar de novo. Vale também para o projeto criado pelo aceite de orçamento. O nome e o link do repositório aparecem no projeto. Para projetos existentes sem repositório há o mesmo botão manual.

**Importação do vínculo.** Na primeira auditoria, repositórios cujo nome bate com o título de um projeto (ignorando acentos, maiúsculas e hífens) vêm sugeridos como ligados; o Lucca confirma com um clique. Nada é ligado sozinho.

**Interface.** Configurações ganha o cartão "GitHub" (colar token, mostrar usuário conectado, desconectar). Em Serviços entra a visão **GitHub** com a auditoria: tabela de repositórios (nome, público/privado, projeto ligado, último commit) e os alertas no topo. A página do projeto ganha um cartão com o repositório, a visibilidade, o gráfico de commits por semana (últimos 12 meses) e o botão de criar. O "Pede atenção" ganha os alertas da auditoria e projetos com repositório sem commit há 30 dias.

**Cérebro.** `apps.json` do GitHub passa de `manual` para `crm:github_token`, o que acende o nó "conectado". Isso é uma mudança na pasta do cérebro (`Cerebro-Madia/apps.json`), feita à parte e avisada ao Lucca.

## Deixado ao construtor
Componentes, CSS, textos curtos de erro (token inválido, sem permissão, limite de chamadas, sem rede), formato do gráfico.

## Calls minhas (conferir)
- Nome do repositório novo: título em minúsculas com hífens.
- Auditoria e alertas só para o que o token enxerga (conta pessoal).
- Cache de 10 minutos.
- Sem webhooks: os dados atualizam por consulta.
- 30 dias sem commit como limite do aviso de projeto parado.
