# CRM em crm.luccasmadia.com.br + publicar e agendar posts no Instagram

Data: 2026-10-19 · Autor do pedido: Lucca · Status: aguardando aprovação

## Intenção

Hoje o Lucca cria o vídeo/arte e a legenda fora do CRM (com o Claude) e publica pelo celular. Ele quer **publicar e agendar posts do Instagram direto do CRM**, sem passar pelo celular. Criação de vídeo e legenda continua fora do CRM — fora de escopo.

Para isso o CRM precisa de um endereço público (`crm.luccasmadia.com.br`): a API do Instagram **não recebe o arquivo**, ela baixa a mídia de uma URL pública. O mesmo endereço dá ao Lucca acesso ao CRM pelo navegador de outros aparelhos enquanto o PC estiver ligado.

São duas etapas, nesta ordem:

1. **Subdomínio via túnel** — `crm.luccasmadia.com.br` aponta para o CRM rodando no PC do Lucca, protegido por login.
2. **Publicação no Instagram** — publicar agora ou agendar, a partir dos rascunhos do Conteúdo.

## Objetivos

- Acessar o CRM em `https://crm.luccasmadia.com.br`, só depois de login, só o Lucca.
- A partir de um rascunho do Conteúdo: subir mídia, **Publicar agora** ou **Agendar** (data e hora).
- Formatos: **Reels** (1 vídeo), **post de foto** (1 imagem), **carrossel** (2–10 **imagens** — decisão do Lucca: carrossel só com imagens).
- **Subir mídia e publicar é feito só pelo PC** (decisão do Lucca). O subdomínio serve para consultar/usar o CRM de outros aparelhos, não para enviar vídeos.
- Post publicado fica ligado ao post sincronizado do grid (o vínculo rascunho ↔ mídia que já existe).
- Erros voltam em português, com o post de volta para correção e nova tentativa.

## Não-objetivos

- Criar vídeo ou legenda dentro do CRM (nem integração com a API do Claude) — fica para depois, se o Lucca pedir.
- Stories, colaboradores, marcação de pessoas/produtos, localização, música, capa personalizada de Reels (pode virar melhoria depois).
- Acesso de outras pessoas ao CRM.
- Funcionar com o PC desligado (isso seria a migração para servidor na nuvem, descartada por enquanto).

## Anti-objetivos (seria um fracasso mesmo "funcionando")

- **Qualquer parte do CRM acessível na internet sem login.** O CRM não tem login próprio (ver `server/http/protecao.js`); a única porta aberta sem login pode ser a da mídia temporária de um post em publicação.
- Publicar algo que o Lucca não mandou publicar — em especial **publicar atrasado** um post agendado sem ele decidir (ver "PC desligado").
- Quebrar o portfólio (`luccasmadia.com.br` / `www`, na Vercel) durante a troca de DNS.
- Publicar o mesmo post duas vezes (clique duplo, reinício do pm2 no meio, agendador + botão).

## Situação atual (levantada no código e no DNS em 2026-10-19)

- CRM: Express na porta 5174 + Vite na 5173, ambos em `127.0.0.1`, via pm2 (`ecosystem.config.cjs`: `crm-madia-api` e `crm-madia-web`, este último é o **servidor de desenvolvimento do Vite**). pm2 sem watch: mudança de código só vale após `pm2 restart`.
- `protegerLocal` recusa qualquer `Host` que não seja `127.0.0.1`/`localhost` e escrita sem o cabeçalho `X-CRM: 1`.
- Banco SQLite em `data/crm.db`; uploads em `data/uploads`, servidos em `/uploads`.
- Instagram: "Instagram API com login do Instagram" (`graph.instagram.com`), token colado manualmente em Configurações; sincronização ao subir e a cada 6 h. O token atual foi gerado para leitura — **publicar exige a permissão `instagram_business_content_publish`**, então o token precisa ser gerado de novo com ela.
- Conteúdo: tabela `conteudos` com `tipo` (post/carrossel/reels), `estado` (rascunho/pronto), `legenda`, `data_planejada`, `arte` (uma imagem) e `midia_id` (vínculo com o post sincronizado).
- DNS de `luccasmadia.com.br`: servidores do Registro.br (`d.sec.dns.br`, `e.sec.dns.br`). Registros: raiz → `216.198.79.1` (Vercel), `www` → Vercel (`76.76.21.164`). Sem MX/TXT (sem e-mail no domínio).

## Etapa 1 — Subdomínio via Cloudflare Tunnel (decidido)

- **Decisão do Lucca:** túnel do Cloudflare a partir do PC; o CRM continua no PC; fora do ar com o PC desligado é aceitável. Só o Lucca acessa.
- O DNS de `luccasmadia.com.br` passa para o Cloudflare (troca de servidores DNS no Registro.br — **passo manual do Lucca**, assim como criar a conta Cloudflare). Antes da troca, os registros da Vercel são recriados no Cloudflare **em modo "somente DNS" (nuvem cinza)**, como a Vercel recomenda; conferir que o portfólio abre depois da propagação.
- `cloudflared` instalado no PC como **serviço do Windows** (sobe sozinho com o PC), túnel nomeado com rota `crm.luccasmadia.com.br` → CRM local.
- **Cloudflare Access** na frente de todo o subdomínio: política permitindo só o e-mail do Lucca, login por código enviado ao e-mail (One-time PIN). Duração da sessão: escolha do construtor (sugestão: 1 mês).
- **Exceção sem login:** apenas o caminho da mídia pública de publicação (ver Etapa 2), via política "Bypass" restrita a esse caminho.
- Mudanças no CRM para funcionar atrás do túnel:
  - `protegerLocal` passa a aceitar também o host `crm.luccasmadia.com.br` (o servidor continua escutando só em `127.0.0.1`, então só o `cloudflared` local chega por esse host). Manter a exigência do `X-CRM` em escritas.
  - Defesa extra, recomendada: validar o JWT do Access (`Cf-Access-Jwt-Assertion`) nas requisições que chegam pelo host público, exceto no caminho público de mídia. Decisão final do construtor; se não fizer, registrar o porquê.
  - O Vite em modo dev não deve ficar exposto na internet. **Recomendação:** servir o front compilado (`vite build`) pelo próprio Express, e o túnel aponta para a porta do Express. Como isso muda o fluxo atual do pm2 (o `crm-madia-web` deixa de ser necessário em uso normal), o construtor documenta o novo jeito de subir no README. Alternativa aceitável se build/serve der problema: manter o Vite com `allowedHosts` restrito ao subdomínio.
- Entregável inclui um passo a passo curto (no README ou em `docs/`) com o que o Lucca faz na mão: conta Cloudflare, troca de DNS no Registro.br, aplicação Access, instalação do serviço `cloudflared`.

## Etapa 2 — Publicar e agendar no Instagram (decidido)

### Fluxo do Lucca

1. Abre (ou cria) um rascunho no Conteúdo — título, tipo, legenda como hoje.
2. Sobe a mídia no rascunho: 1 vídeo (Reels), 1 imagem (post) ou 2–10 imagens em ordem (carrossel). **Vídeo em carrossel é recusado**: o arquivo não sobe e o CRM explica o motivo ("carrossel aceita só imagens — para vídeo, use um Reels"), porque o Lucca pode esquecer a regra. O campo único `arte` atual é substituído/ampliado por uma lista ordenada de mídias do rascunho (modelo de dados: escolha do construtor; a arte existente vira o 1º item).
3. Confere a prévia (mídia + legenda) e escolhe:
   - **Publicar agora**, ou
   - **Agendar** para data e hora. Agendado aparece no grid do Conteúdo marcado como agendado (com data/hora), e pode ser editado, reagendado ou cancelado até sair.
4. O CRM publica. Enquanto o Instagram processa (vídeo leva minutos), o post fica **"Publicando…"**.
5. Ao concluir, o rascunho é ligado à mídia publicada (o `midia_id`), com link, e sai da lista de rascunhos — o grid mostra o post real após sincronizar.

### Estados de um conteúdo

Além de rascunho/pronto: **agendado**, **publicando**, **publicado**, **falhou**, e **atrasado** (agendado cuja hora passou sem publicar). Nomes e modelagem: construtor.

### PC desligado na hora agendada (decisão do Lucca)

**Não publica atrasado sozinho.** Se a hora passou e o post não saiu, ele vira **atrasado** e o CRM **avisa o Lucca**; ele decide entre **Publicar agora**, **Reagendar** ou voltar para rascunho. Onde avisar (minha escolha): faixa de aviso no Início e no Conteúdo enquanto houver posts atrasados ou com falha. Tolerância de poucos minutos para o atraso normal do agendador (ex.: verificar a cada minuto; se o post estava agendado há mais de ~10 min quando o CRM o encontra, trata como atrasado) — número exato fica com o construtor.

### Publicação na API (referência para o construtor, conferir na documentação atual da Meta)

- Fluxo de contêiner: criar contêiner (`POST /{ig-user-id}/media` com `image_url` ou `video_url` + `media_type=REELS`; carrossel = um contêiner de imagem por item com `is_carousel_item=true` e depois o contêiner `CAROUSEL` com `children`), aguardar `status_code = FINISHED` consultando o contêiner, e então `POST /{ig-user-id}/media_publish` com `creation_id`.
- Permissão `instagram_business_content_publish`; limite diário de posts via API da Meta (exibir erro claro ao atingir).
- Restrições conhecidas a validar **antes** de enviar, com mensagem em português: imagem só **JPEG** (PNG/WebP precisam ser convertidos — o construtor escolhe como, ex. `sharp`), proporção de imagem dentro do aceito, vídeo MP4/MOV com duração/tamanho dentro dos limites do Reels, carrossel 2–10 imagens (vídeo recusado com motivo), legenda até 2.200 caracteres / 30 hashtags. Valores exatos: documentação da Meta no momento da construção.

### Mídia pública temporária

- A mídia do post em publicação é exposta em um caminho público próprio (ex.: `/publico/midia/<token-aleatório>/<arquivo>`) — token longo e impossível de adivinhar, só válido enquanto aquele post está em publicação; depois da conclusão (ou falha definitiva) o link deixa de funcionar.
- Esse caminho é o único com Bypass no Cloudflare Access e o único servido sem o host local. Nada além dos arquivos do post em publicação pode sair por ele.

### Envio de arquivos

- Hoje o upload aceita só PNG/JPEG/WebP até 10 MB (`server/http/upload.js`). Para a mídia de posts: aceitar também MP4/MOV, com limite de tamanho compatível com Reels (valor: construtor, alinhado ao limite da Meta).
- Como o envio é só pelo PC, **não há envio em partes**. Pelo subdomínio, o Cloudflare gratuito recusa requisições acima de ~100 MB; **minha escolha:** quando o CRM estiver aberto pelo subdomínio, o envio de mídia de post fica indisponível com o aviso "suba a mídia pelo PC" (publicar/agendar um post cuja mídia já está no CRM continua funcionando de qualquer lugar).

### PWA atrás do login (minha escolha)

O front é PWA (`vite-plugin-pwa`). Atrás do Cloudflare Access, quando a sessão expira, o service worker pode servir a página em cache e as chamadas `/api` falharem de forma confusa. O construtor deve: incluir `/publico` (e os caminhos do Access, `/cdn-cgi/`) no `navigateFallbackDenylist`; detectar no front a resposta de sessão expirada (redirecionamento para o login do Cloudflare) e recarregar a página para cair no login, com aviso claro em vez de erro genérico.

### Robustez

- **Nunca publicar duas vezes:** trava por conteúdo (estado `publicando` gravado no banco antes de chamar a API; agendador e botão respeitam a trava). Se o pm2 reiniciar no meio, ao subir o CRM retoma consultando o contêiner já criado em vez de criar outro (guardar o id do contêiner).
- Token sem permissão de publicar / expirado: erro claro apontando Configurações → gerar token novo com a permissão de publicação (texto de ajuda em "Como gerar o token" atualizado).
- Falha do Instagram: post vai para **falhou** com a mensagem traduzida/compreensível, mídia preservada, botão **Tentar de novo**.
- Agendador roda no processo da API (como a sincronização periódica), não em ferramenta externa.

## Restrições

- Stack existente: Express 5 + SQLite (better-sqlite3/`node:sqlite`, o que o projeto usa) + React 19 + Vite; testes em Vitest (o projeto tem ~600 testes — manter verde, TDD como no resto do repo).
- Migrations numeradas em `server/db/migrations` (próxima livre). **Backup do banco antes de aplicar** (padrão dos projetos anteriores: `data/backup-antes-0XX-*`).
- pm2 sem watch: após mudanças, `pm2 restart` dos processos (e reconfigurar `ecosystem.config.cjs` se o front passar a ser servido pelo Express).
- Commits em Conventional Commits, em português, como o histórico. Há trabalho do Lucca não commitado na árvore (ocultar valores, Portfolio.jsx) — trabalhar em worktree/branch separada para não misturar.
- Fuso: horário local do PC do Lucca (Mato Grosso do Sul). Guardar data/hora de agendamento de forma inequívoca.

## Fica a critério do construtor

- Modelagem das mídias do rascunho e dos novos estados; nomes de rotas/tabelas.
- Conversão de imagens, validação de vídeo (com ou sem ffprobe).
- Detalhes visuais da prévia, da faixa de aviso e dos botões, seguindo o tema escuro e os componentes existentes.
- Intervalo do agendador e tolerância exata para "atrasado".
- Ordem interna das tarefas, desde que a Etapa 1 venha antes (a Etapa 2 depende do endereço público para testar de verdade).

## Passos manuais do Lucca (não automatizáveis por envolverem conta/login)

1. Criar conta no Cloudflare e adicionar o domínio.
2. Trocar os servidores DNS no Registro.br para os do Cloudflare.
3. Configurar o Access (e-mail permitido) — com roteiro passo a passo.
4. Gerar novo token do Instagram com permissão de publicação e colar em Configurações.
