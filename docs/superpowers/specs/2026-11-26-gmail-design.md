# Integração com o Gmail — design

## Intenção
Ver, dentro da página do cliente, as últimas conversas de e-mail com ele, sem abrir o Gmail. Só leitura.

## Fora do escopo
Enviar, responder, apagar, arquivar ou marcar e-mails; anexos; notificações; alertas de e-mail sem resposta (pode vir depois).

## Anti-objetivos
Guardar o conteúdo dos e-mails no banco do CRM; pedir mais permissão do que leitura; mostrar token na tela ou pela API.

## Abordagem
OAuth do Google com o escopo `gmail.readonly`, fluxo local: o Lucca cria um app OAuth no Google Cloud (tipo "App da Web", redirecionamento `http://127.0.0.1:5174/api/gmail/callback`), cola o Client ID e o Client Secret em Configurações e autoriza no navegador. O CRM guarda o refresh token em `config` e busca os e-mails ao vivo (cache de 5 min, nada gravado). Alternativa descartada: IMAP com senha de app, que exige biblioteca nova e mais código.
**Aviso importante na tela:** enquanto o app estiver em modo "Teste" o Google expira o refresh token em 7 dias; o passo a passo manda publicar o app como "Em produção" (uso pessoal, aparece a tela "app não verificado", basta continuar).

## Desenho
- **Conexão:** Configurações → Gmail: campos Client ID e Client Secret, botão **Conectar** que abre a autorização do Google. `GET /api/gmail/autorizar` redireciona ao Google (com `state` aleatório guardado em memória); `GET /api/gmail/callback?code&state` troca o código por tokens e salva `gmail_refresh_token`, `gmail_usuario` (e-mail da conta), `gmail_client_id`, `gmail_client_secret`; volta para `/configuracoes`. `GET /api/gmail` → `{conectado, usuario, configurado}`; `DELETE /api/gmail/conexao` revoga e limpa. Nada disso vai para o backup nem para `GET /config`.
- **Leitura:** `GET /api/clientes/:id/emails` → até 10 conversas `[{id, assunto, trecho, data, de, link}]` buscadas com `q = from:EMAIL OR to:EMAIL` (e-mails do cliente: campo `email` do cliente); `link` abre a conversa no Gmail. Cliente sem e-mail → `{conversas: [], semEmail: true}`. Token expirado/revogado → 502 "Gmail desconectado. Conecte de novo em Configurações → Gmail."; sem conexão → 409.
- **Tela:** cartão "E-mails" na página do cliente: lista (assunto, data, trecho, remetente "Você" ou nome) com link **Abrir no Gmail**; estados: sem conexão (chamado), cliente sem e-mail, sem conversas, erro.
- **Cérebro:** `apps.json` do gmail → `crm:gmail_refresh_token`; logo do Gmail já existe.

## Calls minhas
OAuth em vez de IMAP; sem alertas nesta versão; cache curto e nada guardado do conteúdo.
