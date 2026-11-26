# Integração com o Supabase — design

## Intenção
O Lucca hospeda sistemas de clientes no Supabase. No plano gratuito o projeto é pausado por inatividade e o sistema sai do ar sem aviso. O CRM liga cada projeto de sistema ao projeto do Supabase, mostra o estado e avisa quando está pausado.

## Fora do escopo
Ler ou alterar dados dos bancos, restaurar projetos pausados, criar projetos, métricas de uso.

## Abordagem
Token pessoal (Personal Access Token, `sbp_...`) em `config` + API de gerenciamento (`GET https://api.supabase.com/v1/projects`, cabeçalho `Authorization: Bearer`). Mesmo molde do Figma e do GitHub: cliente com `fetch` injetável, serviço com cache de 5 min, rotas, cartão no projeto. Escolher o projeto numa lista (sem colar link) porque a API já devolve todos.

## Desenho
- **Conexão:** Configurações → Supabase. `PUT /api/supabase/conexao {token}` valida com a lista de projetos e salva `supabase_token`; `DELETE` remove; `GET /api/supabase` → `{conectado}`. Token fora do backup.
- **Ligação:** `projetos.supabase_ref` (migration 045, índice único parcial). `PUT /projetos/:id {supabase_ref}` (formato `^[a-z0-9]{20}$`, arquivo repetido → 400 "Esse projeto do Supabase já está ligado a outro projeto").
- **Leitura:** `GET /api/supabase/projetos[?atualizar=1]` → `[{ref, nome, regiao, estado, link}]` (estado normalizado: `no_ar` = ACTIVE_HEALTHY, `pausado` = INACTIVE/PAUSING, `subindo` = COMING_UP/RESTORING, `outro`); `GET /api/projetos/:id/supabase` → `{encontrado, nome, regiao, estado, link}`. Sem token 409 "Conecte o Supabase em Configurações."; 401/403 → 502 "Token do Supabase inválido ou sem permissão. Cole um novo em Configurações → Supabase."
- **Tela:** cartão "Supabase" na aba Geral de projeto `site_sistema` (inclusive fictício): escolher o projeto numa lista, mostrar nome, região, selo No ar / Pausado / Subindo e **Abrir no Supabase**; Trocar e Remover.
- **Pede atenção** (Serviços → Sites e sistemas): projeto real, em qualquer etapa menos `perdido`, ligado a um projeto pausado → "Nome está pausado no Supabase" (atenção); se a etapa for `entregue` → perigo (o cliente está sem sistema). Falha do Supabase nunca aparece na faixa (`GET /api/supabase/atencao` devolve `{alertas: []}`).
- **Cérebro:** `apps.json` do supabase → `crm:supabase_token`; logo do Supabase já existe.

## Calls minhas
Só leitura (restaurar fica no painel do Supabase); lista em vez de colar link; pausado em projeto entregue é "perigo".
