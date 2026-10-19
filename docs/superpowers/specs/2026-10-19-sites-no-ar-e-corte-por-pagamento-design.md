# Sites no ar + corte por falta de pagamento — desenho

Aprovado em conversa com o Lucca em 2026-10-19. Marcado *(decisão do Claude)* o que não veio dele.

## Por quê

O Lucca hospeda os sites e sistemas dos clientes na própria conta da Vercel e cobra mensalidade de alguns. Nada caiu nem ficou sem pagar ainda — é prevenção. Ele quer duas coisas, as duas dentro do CRM:

1. **Saber quando um site cai**, antes de o cliente avisar.
2. **Poder tirar do ar quem não paga** (e colocar de volta), decidindo ele mesmo, com o CRM avisando quando a mensalidade atrasa.

## Objetivos

- Status no ar / fora do ar / pausado para cada site ou sistema hospedado.
- Aviso de mensalidade atrasada ligado às parcelas que o CRM já gera, com o fluxo "avisei o cliente → espera 7 dias → tirar do ar?".
- Botões **Tirar do ar** / **Colocar no ar** que pausam/despausam o projeto na Vercel.

## Não objetivos

- Nada automático no corte: o CRM **nunca** pausa nem religa sozinho. Religar também é manual (decisão do Lucca).
- Notificação no celular, e-mail ou WhatsApp: por enquanto os avisos ficam só dentro do CRM (decisão do Lucca).
- Página personalizada de "site suspenso": a pausa da Vercel mostra a página de erro dela, e tudo bem por agora.
- Monitorar sistemas instalados no PC do cliente (ex.: Canecas da Dri) — não há o que acessar.
- Os projetos da Vercel que não estão no CRM (rouge-store, mb-gestao-de-estoque, fotografia-portfolio, tres-de-solutions-site) ficam de fora (decisão do Lucca).
- Gateway de pagamento: "pago" continua sendo o Lucca marcar a parcela como paga, como já faz.

## Antiobjetivos (o que tornaria isto um fracasso)

- Pausar um site sem o Lucca confirmar.
- Alarme falso de "fora do ar" por uma oscilação de segundos, ou por um site que ele mesmo pausou.
- Expor o token da Vercel (no chat, em logs, ou devolvido pela API do CRM ao front).

## Contexto do que existe

- Só serviços `servico = 'site_sistema'` da tabela `projetos` entram aqui. GMN e placas, não.
- Mensalidade: `projetos.mensalidade_*` + parcelas com `mensalidade = 1` geradas por `server/repos/mensalidades.js`; parcela sem `pago_em` com `vencimento < hoje` já é "atrasada" (`server/domain/financeiro.js`).
- Token do Instagram vive na tabela `config` (`obterConfig`/`definirConfig`), colado em Configurações; a rota valida o token antes de guardar. O token da Vercel segue o mesmo padrão.
- Faixa de avisos no Início/Conteúdo: `web/src/components/AvisosPublicacao.jsx` (some quando não há nada). A faixa nova segue o mesmo estilo.
- Tarefas periódicas já rodam a cada 60 s em `server/index.js` (agendador do Instagram). O CRM roda só no PC do Lucca (pm2), então **tudo só acontece com o PC ligado**.
- Conta da Vercel: um time, `team_swjuAgh2tFdstUcbkuZsudtI` (slug `luccasmadia07-5360s-projects`), 12 projetos.

## Como funciona

### 1. Cadastro da hospedagem (uma vez por site)

No site/sistema, o Lucca indica:

- **Hospedagem:** "Vercel" ou "Sem hospedagem (instalado no cliente)". Sem hospedagem = sem status e sem botões.
- **Endereço** que será checado (ex.: `https://rangodobicho.com.br`).
- **Projeto da Vercel**, escolhido numa lista que o CRM busca da Vercel (precisa do token). *(decisão do Claude: lista em vez de digitar o id, para não errar.)*

Sites fictícios do portfólio entram no monitoramento (são o que ele mostra para quem está pensando em fechar), mas **sem** botão de tirar do ar nem aviso de pagamento. *(decisão do Claude, aceita pelo Lucca)*

### 2. Monitoramento

- A cada **5 minutos** o CRM acessa o endereço de cada site com hospedagem e endereço preenchido (exceto os pausados).
- **Fora do ar** = duas checagens seguidas falhando (≈10 min). Falhar = sem resposta em ~10 s, erro de rede/DNS/certificado, ou status HTTP 5xx. Redirecionamentos são seguidos; 4xx conta como no ar (o servidor respondeu). *(decisão do Claude)*
- Guarda: estado atual, desde quando, último motivo da falha, hora da última checagem.
- **Pausado por você** é um estado próprio, nunca vira alarme, e não é checado.
- Volta sozinho para "no ar" na primeira checagem boa.

### 3. Aviso de mensalidade atrasada e corte

Para site/sistema real (não fictício), hospedado na Vercel, com mensalidade:

1. Parcela de mensalidade passou do vencimento sem `pago_em` → aviso na faixa: "Brothers Barbearia — mensalidade de R$ X atrasada desde 10/11", com o botão **Avisei o cliente**.
2. Ao clicar, o CRM grava a data. O aviso passa a mostrar "Cliente avisado em 12/11 — prazo até 19/11".
3. Passados **7 dias** do aviso sem pagamento → o aviso muda para "Prazo de 1 semana venceu — tirar do ar?" com o botão **Tirar do ar**.
4. Quando todas as mensalidades atrasadas do projeto forem pagas, o aviso de pagamento some e o "avisei o cliente" é zerado. Se o site estiver pausado, aparece o lembrete "Pago — colocar no ar?" com o botão **Colocar no ar**.
5. **Tirar do ar** também fica disponível a qualquer momento no site (não precisa esperar os 7 dias).

Os 7 dias são o padrão, ajustável em Configurações. *(decisão do Claude)* Valores em R$ usam `formatarDinheiro` (respeita o "ocultar valores").

### 4. Tirar do ar / Colocar no ar

- Ambos pedem confirmação dentro do CRM (modal do próprio app, nunca `window.confirm`), dizendo o nome do site e o endereço.
- Chamam a API da Vercel para pausar / despausar o projeto escolhido no cadastro. O CRM registra quem/quando ("Tirado do ar em 20/11 14:05") e o estado vira "pausado por você".
- Se a Vercel recusar (token inválido, sem permissão, projeto inexistente), mostra o motivo em português e não muda o estado.

### 5. Onde aparece

- **Card/lista de Sites e sistemas** (`web/src/pages/servicos/SitesSistemas.jsx`): bolinha verde/vermelha/cinza (pausado) + texto curto ("fora do ar desde 14:32").
- **Página do projeto**: bloco "Hospedagem" com o cadastro, status, última checagem, botões Tirar/Colocar no ar e o histórico simples de pausas.
- **Faixa de avisos no Início**: sites fora do ar + mensalidades atrasadas/prazo vencido/pago-e-pausado. Some quando não há nada.
- **Configurações**: "Vercel — colar token" (igual ao Instagram, valida antes de guardar, mostra conectado/não) e o prazo em dias.

## Restrições

- Token da Vercel: colado pelo Lucca em Configurações, nunca no chat; nunca devolvido ao front nem logado. Escopo do token limitado ao time dele quando a Vercel permitir.
- Mesma stack e padrões do CRM: Express 5, node:sqlite, React 19, Vitest; migration nova numerada depois da última existente; Conventional Commits.
- Testes nunca chamam a Vercel nem a internet de verdade (cliente falso, como `server/test/instagramFalso.js`).
- Nada de diálogo nativo do navegador (`alert`/`confirm`).

## Deixado para quem for construir

- Nomes de tabelas/colunas (colunas em `projetos` ou tabela própria de hospedagem/checagens).
- Endpoints exatos da Vercel para pausar/despausar e listar projetos — **conferir na documentação atual** antes de implementar.
- Se guarda histórico de checagens ou só o estado atual (o mínimo é o estado atual + histórico de pausas).
- Layout exato dos blocos, seguindo o visual existente.
