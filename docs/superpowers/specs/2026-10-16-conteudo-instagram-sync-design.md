# Conteúdo conectado ao Instagram (sincronização) — design

Data: 2026-10-16

## Intenção e o porquê

O Lucca não usa a tela de Conteúdo hoje: planejar no CRM fica desconectado do que
realmente acontece no Instagram. A tela passa a **começar pelo Instagram real** —
o grid do perfil, os números de cada post, o crescimento da conta — e o
planejamento vive **dentro** desse grid, como prévia do que vem a seguir.

Ordem de importância que ele deu: **grid → números do post → crescimento da conta**.

Ritmo de trabalho: um post por vez, mas quer poder deixar alguns prontos adiantados.

## Objetivos

1. Ver o grid real do perfil (posts/reels/carrosséis publicados, com capa real) dentro do CRM.
2. Ver os números de cada post publicado.
3. Ver o crescimento da conta (seguidores ao longo do tempo).
4. Planejar posts como quadrados de prévia no começo do grid, com a arte do post.
5. Quando o post sai no Instagram, ele se liga sozinho ao planejado — sem marcar "publicado" à mão.

## Fora de escopo (agora)

- Publicar ou agendar posts no Instagram a partir do CRM (fica para uma etapa futura;
  exigiria hospedar mídia em URL pública).
- Stories (a API só expõe stories das últimas 24h; não entram no grid).
- Comentários/DMs, contas múltiplas, outras redes.
- Canal "Portfólio" na tela de Conteúdo (ver "Dados existentes").

## Anti-objetivos

- Não pode virar mais uma tela de planejamento "solta": se o grid não refletir o
  Instagram real, falhou, mesmo funcionando tecnicamente.
- Não exigir manutenção manual recorrente (renovar token na mão, marcar publicado, etc.).
- Não depender de serviço pago nem de hospedar o CRM na internet — ele continua local (pm2).

## Restrições

- CRM local: Express 5 + `node:sqlite` em `server/`, React 19 + Vite em `web/`,
  rodando via pm2 sem watch (mudança só vale após `pm2 restart crm-madia-api`).
  Migrations numeradas em `server/db/migrations/` (próxima: `016_...`).
  Imagens ficam em `data/uploads/` (servidas em `/uploads`), upload via `server/http/upload.js` (multer).
  Configurações chave/valor na tabela `config` (`server/repos/config.js`).
- Conta do Instagram do Lucca já é **Profissional**.
- API: **Instagram API com login do Instagram** (`graph.instagram.com`), permissões
  `instagram_business_basic` + `instagram_business_manage_insights`. App da Meta em
  modo desenvolvimento, com a própria conta como testadora — sem App Review.
- Visual segue o tema escuro existente (`web/src/styles.css`).

## Decidido com o Lucca

- **Layout "A — perfil + painel do lado"** (mockup em `.superpowers/brainstorm/`):
  - Topo: resumo de crescimento — seguidores atuais, variação em 30 dias, mini linha de evolução.
  - Embaixo: grid de 3 colunas, proporção de post do Instagram (4:5), como o perfil.
    Ícone indicando reels (▶) e carrossel (❐).
  - Posts planejados aparecem **no começo do grid**, com borda tracejada, antes dos publicados.
  - Clicar num post abre um **painel ao lado** com os números: visualizações, alcance,
    curtidas, comentários, salvamentos, compartilhamentos, e o projeto do CRM ligado (se houver).
- **Kanban sai.** Planejado tem só dois estados: **Rascunho** e **Pronto**.
  Os prontos ficam em fila ordenada (a ordem do grid = ordem em que vão sair).
- **Só os "Pronto" entram no grid** como prévia. Os rascunhos ficam numa lista separada
  embaixo do grid (ou ao lado, conforme couber no layout). Ao marcar como Pronto, o
  rascunho entra no fim da fila do grid.
- **Grid em ordem de data, sem posts fixados**: o Lucca não fixa posts no perfil, então
  não é preciso marcar fixado.
- **Data planejada é opcional**; se tiver, aparece no quadrado.
- **Planejado leva a arte** (upload de imagem) para a prévia parecer o grid real.
- **Ao publicar no Instagram, o planejado se liga sozinho** ao post real e vira ele.
- Começa só pela sincronização (leitura).

## Decisões minhas (o Lucca pode revisar)

### Conexão com a conta
- Sem fluxo OAuth: a Meta exige redirect HTTPS e o CRM é local. Em vez disso, o Lucca
  gera o token no painel do app da Meta ("Gerar token" na configuração da API do
  Instagram) e cola em **Configurações → Instagram**. O CRM valida chamando `/me`,
  mostra `@usuario` conectado, e guarda token + data de expiração na tabela `config`.
- Renovação automática: token de longa duração vale ~60 dias; o CRM chama
  `refresh_access_token` quando faltar menos de 15 dias. Se falhar/expirar, a tela de
  Conteúdo mostra um aviso claro com o caminho para reconectar.
- Botão "Desconectar" apaga o token (mantém os posts já sincronizados).
- Junto, um passo a passo curto em texto na própria seção de Configurações (ou no README)
  de como criar o app e gerar o token.

### Sincronização
- Roda: ao iniciar o servidor, a cada 6 horas (timer no processo da API) e por um botão
  **"Atualizar agora"** na tela. Nunca duas ao mesmo tempo.
- Busca: perfil (`username`, `followers_count`, `media_count`, foto) e a lista de mídias
  (`id, caption, media_type, media_product_type, media_url, thumbnail_url, permalink,
  timestamp, like_count, comments_count`), paginando até o fim na primeira vez; depois,
  basta reprocessar as mídias recentes (ex.: últimos 60 dias) para atualizar números
  — o grid inteiro continua guardado.
- Números por post via `/{media-id}/insights` (alcance, salvamentos, compartilhamentos,
  visualizações/total de interações — nomes exatos das métricas conferir na doc atual
  da Meta na implementação; métrica indisponível para um tipo de mídia fica em branco,
  não quebra a sync).
- **Capas baixadas para `data/uploads/instagram/`**: as URLs de mídia da Meta expiram.
  Para reels usar `thumbnail_url`; para carrossel, a primeira imagem (`media_url` do post).
- **Crescimento**: a cada sync, gravar um "retrato" diário de seguidores (um por dia,
  o último do dia vence). Na primeira conexão, tentar preencher os últimos 30 dias com a
  métrica de seguidores da conta, se a API devolver; senão, a linha começa no dia da conexão.
- Post apagado no Instagram: some do grid (marcar como removido, não apagar o vínculo
  com o planejado de forma silenciosa — o planejado volta a aparecer como "Pronto").
- Erros da API viram mensagem amigável na tela (último erro + horário da última sync com sucesso).

### Planejados e o vínculo automático
- Planejado tem: arte (imagem, opcional mas incentivada), título, legenda, tipo
  (post/carrossel/reels), estado (rascunho/pronto), data opcional, projeto opcional, ordem.
- Sem arte, o quadrado mostra o título sobre fundo tracejado.
- Reordenar os prontos (arrastar no grid ou setas) define a fila.
- **Vínculo automático**: para cada post novo sincronizado que não está ligado a nada,
  procurar planejado com legenda equivalente (comparar o começo da legenda normalizado:
  minúsculas, sem acentos/espaços extras/emojis/hashtags). Se houver exatamente um
  candidato, liga. Senão, o painel do post mostra "Era um destes planejados?" com os
  prontos listados (primeiro da fila pré-selecionado) para ligar com um clique.
  Post sem plano é normal e fica sem vínculo.
- **Quem pode ser ligado** *(minha chamada)*: só posts publicados **depois** que o
  planejado foi criado. Os posts antigos trazidos na primeira sync nunca são ligados
  sozinhos nem mostram a pergunta "Era um destes planejados?" (o painel deles só tem
  o seletor de projeto). Vínculo automático e pergunta consideram planejados
  Rascunho e Pronto.
- Ao ligar: o planejado sai da área de prévia, o post real herda o projeto do planejado,
  e o projeto ligado ganha `postou_instagram = 1`.
- `postou_instagram` continua sendo uma marcação manual *(minha chamada)*: ligar um post
  só a ativa. Desfazer o vínculo ou apagar o post não desmarca, porque o post pode ter
  acontecido mesmo assim. O checkbox, o painel da Início e o filtro em Sites/Sistemas
  continuam como estão.
- Desfazer vínculo disponível no painel. O post perde o projeto que tinha herdado e o
  planejado volta para a prévia.

### Telas
- `/conteudo` vira a tela do layout A. Some o kanban e o filtro de canal.
- Calendário: mantido como visão secundária (botão alternando Grid / Calendário),
  mostrando planejados com data e publicados na data em que saíram. *(Minha chamada —
  é barato manter e útil para ver frequência.)*
- Sem Instagram conectado: a tela mostra só os planejados + chamada para conectar.
- Aba "Conteúdos" dentro do projeto (`AbaConteudos.jsx`): continua listando o que está
  ligado ao projeto (planejados e publicados), com o novo formulário.
- Painel do post publicado: capa grande, data, tipo, legenda (recolhida), números,
  link "Abrir no Instagram", projeto ligado (editável).

### Dados existentes
- 3 linhas em `conteudos` (todas instagram/publicado) e nenhuma de portfólio.
- Migração: `ideia`/`produzindo` → rascunho, `agendado` → pronto. As 3 `publicado`
  (projeto 9, datas 2026-09-26, 09-27 e 10-16) estão **sem link** *(minha chamada)*:
  na primeira sync, cada uma passa o projeto para o post sincronizado do **mesmo dia e
  mesmo tipo**, se houver exatamente um. Sem par, o registro antigo é descartado. Como
  o post real existe no grid, dá para escolher o projeto à mão no painel.
- Canal `portfolio` e tipos `story`/`atualizacao` deixam de ser oferecidos na tela.
  Como não há dados, podem ser removidos do esquema. *(Minha chamada.)*

## Fica a critério de quem implementa

- Modelagem exata das tabelas (ex.: `instagram_midias`, `instagram_seguidores`, colunas novas em `conteudos`).
- Biblioteca/abordagem de HTTP (fetch nativo do Node é suficiente) e onde mora o timer.
- Componentização da tela e estilo fino, desde que siga o layout A e o tema atual.
- Limites de paginação, tratamento de rate limit, retries.
- Testes seguem o padrão do repo (vitest + supertest no server, Testing Library no web),
  com a API da Meta sempre mockada.
