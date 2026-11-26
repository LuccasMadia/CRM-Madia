# Integração com o Figma — design

## Intenção
Cada projeto de site/sistema pode apontar para o arquivo do Figma onde o design vive. O CRM mostra o link e a data da última edição. Nada além disso.

## Fora do escopo
Alertas de design parado, miniatura, criar arquivos, listar os arquivos da conta.

## Abordagem
Único caminho sensato: token pessoal guardado em `config` + API REST do Figma (`GET /v1/me`, `GET /v1/files/:key?depth=1`), no mesmo molde do GitHub (cliente com `fetch` injetável, serviço com cache de 10 min).

## Desenho
- **Conexão:** Configurações → Figma. `PUT /api/figma/conexao {token}` valida com `/v1/me` e salva `figma_token` (+ `figma_usuario` = handle). `DELETE` remove. `GET /api/figma` → `{conectado, usuario}`. O token não vai para o backup (mesma lista do GitHub).
- **Ligação:** `projetos.figma_arquivo` (migration 044), código do arquivo, índice único parcial. A rota de projetos aceita `figma_url` (link colado) e extrai o código de `figma.com/(design|file|board|proto)/CODIGO`; link inválido → 400 "Cole o link de um arquivo do Figma". Arquivo já ligado a outro projeto → 400 "Esse arquivo já está ligado a outro projeto". `figma_url: ''` remove a ligação.
- **Leitura:** `GET /api/projetos/:id/figma` → `{encontrado, nome, editado_em, url}`; 404 do Figma → `{encontrado:false}`; token inválido → 502 com mensagem; sem token → 409 "Conecte o Figma em Configurações.". `?atualizar=1` ignora o cache.
- **Tela:** cartão "Figma" na aba Geral de todo projeto `site_sistema` (inclusive fictício/privado — decisão minha: design existe em qualquer um). Sem conexão: chamado para Configurações. Sem arquivo: campo para colar o link. Com arquivo: nome, "Editado em dd/mm/aaaa", **Abrir no Figma**, Trocar, Remover.
- **Cérebro:** `apps.json` do figma → `crm:figma_token`.

## Mensagens de erro
401/403 "Token do Figma inválido ou sem permissão. Cole um novo em Configurações → Figma."; rede "Não foi possível falar com o Figma. Verifique a internet."
