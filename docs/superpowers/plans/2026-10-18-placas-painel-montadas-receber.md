# Placas: painel, montadas e a receber — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel no Resumo de Placas (a receber + montadas), montagem de placas, recebimento de vendas de placa integrado ao dinheiro do CRM, e painel de "a receber" em Sites e GMN.

**Architecture:** Estoque continua calculado na hora (sem saldo gravado). Montagem guarda a receita do momento; a venda grava quantas unidades saíram de montadas (`quantidade_montada`). Vendas de placa não ligadas a projeto viram linhas "tipo parcela" (`tipo: 'venda_placa'`) que se somam às parcelas no Início, Financeiro e gráficos.

**Tech Stack:** Node + Express + node:sqlite, React + react-router, vitest + supertest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-18-placas-painel-montadas-receber-design.md`

## Global Constraints

- Sem montagens, o estoque de materiais tem que bater exatamente com o cálculo de hoje.
- Vendas ligadas a projeto (`projetos_servicos.venda_id`) ficam fora de todo total de dinheiro; nascem com `recebido_em = data_venda`.
- Venda de placa: valor = `preco_vendido_centavos × quantidade`; estado `paga` se `recebido_em`, `atrasada` se `data_venda < hoje − 7 dias`, senão `pendente`.
- Migration nova: `server/db/migrations/018_placas_montagens_recebimento.sql`.
- Reaproveitar `Numero`, `.cartao`, `.tabela`, `.etiqueta`, `Modal`, `useCarregar`, `useEnvio`. Sem dependência nova.
- Commits em Conventional Commits, em português sem acento como os anteriores.

## Review Focus

1. Excluir montagem cujas placas já foram vendidas → 409 com mensagem, nada muda (teste na Task 2).
2. Venda maior que as montadas → parte sai de montadas, resto de materiais; excluir a venda devolve tudo (Task 2).
3. Editar a quantidade de uma venda → `quantidade_montada` recalculada sem passar do disponível (Task 2).
4. Venda ligada a projeto não aparece em a receber, atrasadas, gráficos nem `/parcelas` (Task 3).
5. Id de venda e de parcela iguais na tabela do Financeiro → chaves distintas por `tipo` (Task 6).

---

### Task 1: Migration e domínio de estoque/estado

**Files:**
- Create: `server/db/migrations/018_placas_montagens_recebimento.sql`
- Modify: `server/domain/placas.js`, `server/repos/placas.js`
- Test: `server/domain/placas.test.js`

**Interfaces — Produces:**
- Tabelas `placas_montagens(id, modelo_id, quantidade ≥1, data_montagem, criado_em, atualizado_em)`, `placas_montagens_itens(id, montagem_id ON DELETE CASCADE, material_id, quantidade, criado_em, atualizado_em)`; colunas `placas_vendas.recebido_em TEXT`, `placas_vendas.quantidade_montada INTEGER NOT NULL DEFAULT 0`; `UPDATE` marca recebidas as vendas ligadas a projeto.
- `estoqueMaterial(materialId, lotes, vendas, itensModelo, avarias = [], itensAvaria = [], montagens = [], itensMontagem = [])` — vendas consomem só `quantidade − (quantidade_montada ?? 0)`.
- `materiaisComEstoqueNegativo(..., montagens = [], itensMontagem = [])` repassa.
- `montadasDoModelo(modeloId, montagens, vendas) → number`
- `quantasDaPraMontar(modeloId, itensModelo, estoquePorMaterial: Map<id, n>) → number | null` (null sem receita, mínimo 0).
- `estadoVendaPlaca(venda, hoje) → 'paga'|'atrasada'|'pendente'`, `valorVendaPlaca(venda) → centavos`.
- Repos: `CAMPOS_VENDA` + `recebido_em`, `quantidade_montada`; `repoPlacasMontagens(db)` (listar por `data_montagem DESC, id DESC`), `repoPlacasMontagensItens(db)` (listar `{ montagem_id }`); `idsVendasDeProjeto(db) → Set<number>`.

- [ ] Testes: `estoqueMaterial` sem montagens = valor atual; com montagem de 2 (receita 1 tag) tira 2; venda de 3 com `quantidade_montada: 2` tira 1; `montadasDoModelo` = 2 − 2; `quantasDaPraMontar` com tag 5/1 e adesivo 3/1 = 3, sem receita = null; `estadoVendaPlaca` com hoje 2026-10-18: data 2026-10-11 → pendente, 2026-10-10 → atrasada, recebido → paga.
- [ ] Rodar `npx vitest run server/domain/placas.test.js` → falha; implementar; passar.
- [ ] Commit `feat: estoque de placas montadas e estado de recebimento`.

### Task 2: Rotas de montagem, venda e resumo

**Files:** Modify `server/routes/placas.js`, `server/routes/projetos.js`, `server/routes/clientes.js`, `server/repos/placas.js`; Test `server/routes/placas.test.js`, `server/routes/projetos.test.js`.

**Interfaces — Produces:**
- `GET /api/placas/montagens` → `[{...montagem, modelo_nome, itens}]`; `POST` `{modelo_id, quantidade, data_montagem}` → 201 `{montagem, avisos_estoque}` (400 `modelo_id` "Modelo sem receita cadastrada"); `DELETE /:id` → 204, ou 409 "Placas desta montagem já foram vendidas" se `montadasDoModelo − quantidade < 0`.
- `POST /api/placas/vendas` aceita `recebido: boolean` (true → `recebido_em = data_venda`); grava `quantidade_montada = min(quantidade, montadas disponíveis)`.
- `PUT /api/placas/vendas/:id`: se mudar `quantidade` ou `modelo_id`, recalcula `quantidade_montada` com o disponível + o que a própria venda usava.
- `POST /api/placas/vendas/:id/recebimento` → `recebido_em = hoje()`; `DELETE` mesmo caminho → `null`. Resposta: venda montada.
- `GET /api/placas/vendas` acrescenta `valor_total_centavos`, `estado`, `via_projeto`.
- `GET /api/placas/resumo` acrescenta `a_receber: { total_centavos, vendas: [venda montada, mais antiga primeiro] }`, `montadas: [{ modelo_id, modelo_nome, montadas, da_pra_montar }]` (modelos ativos), `mes: { vendidas, lucro_centavos }`; `materiais` já desconta montagens.
- Venda criada na entrega de projeto (`projetos.js`) usa `quantidade_montada` e `recebido_em = data_venda`. Lógica compartilhada: `quantidadeMontadaDisponivel(db, modeloId, { ignorarVendaId })` em `repos/placas.js`.
- `GET /api/clientes/:id/placas` acrescenta `vendas` (todas do cliente, com `estado`, `valor_total_centavos`, `modelo_nome`).

- [ ] Testes de rota cobrindo cada item acima + Review Focus 1–3.
- [ ] Rodar `npx vitest run server/routes/placas.test.js server/routes/projetos.test.js` → passar.
- [ ] Commit `feat: rotas de montagem e recebimento de vendas de placa`.

### Task 3: Dinheiro: painel, parcelas, financeiro, resumo de serviços

**Files:** Modify `server/routes/painel.js`, `server/routes/parcelas.js`, `server/repos/placas.js`; Test `server/routes/painel.test.js`, `server/routes/parcelas.test.js`.

**Interfaces — Produces:**
- `vendasPlacasComoParcelas(db, hoje) → [{ tipo: 'venda_placa', id, valor_centavos, vencimento: data_venda, pago_em: recebido_em, estado, servico: 'placas_nfc', cliente_id, cliente_nome, projeto_titulo: '<modelo> × <qtd>', descricao: 'Venda de placas' }]`, só vendas sem projeto. Parcelas comuns ganham `tipo: 'parcela'`.
- `/painel`: `a_receber_mes_centavos` soma vendas pendentes/atrasadas do mês; `atrasadas` inclui vendas atrasadas; `para_entregar.placas` = nº de vendas de placa a receber.
- `/painel/graficos` e `/financeiro/mensal` somam vendas recebidas.
- `/parcelas` devolve parcelas + vendas, mesmos filtros, ordem `vencimento`.
- `GET /api/servicos/resumo` → `{ site_sistema: { a_receber_centavos }, google_meu_negocio: { a_receber_centavos }, placas_nfc: { a_receber_centavos, montadas } }`.

- [ ] Testes: venda aberta de R$ 80 no mês entra em `a_receber_mes_centavos`; venda de 10 dias entra em atrasadas; venda recebida entra em `recebido_por_mes` e `por_servico.placas_nfc`; venda de projeto fica fora de tudo; `/parcelas?servico=placas_nfc&estado=pendente` traz a venda.
- [ ] Rodar os testes → passar; commit `feat: vendas de placa entram no a receber e no financeiro`.

### Task 4: Web — Resumo de Placas vira painel, aba Montagem, vendas com recebimento

**Files:** Modify `web/src/pages/placas/AbaResumo.jsx`, `web/src/pages/placas/AbaVendas.jsx`, `web/src/pages/servicos/PlacasNfc.jsx`, `web/src/components/FormPlacaVenda.jsx`, `web/src/styles.css`; Create `web/src/pages/placas/AbaMontagem.jsx`, `web/src/components/FormPlacaMontagem.jsx`; Test `web/src/pages/servicos/PlacasNfc.test.jsx`.

- Abas: Resumo, Vendas, Montagem, Modelos, Materiais, Lotes, Avarias.
- Resumo: `.cartoes` com 4 `Numero` (A receber `financeiro`, Montadas prontas `nfc`, Vendidas no mês `projetos`, Lucro no mês `financeiro`); grade `.painel-placas` 3fr/2fr (1 coluna < 900px) com "Vendidas e ainda não recebidas" (etiqueta `há N dias`, `--atrasada` se atrasada, `--proposta` senão; botão "Recebi"; vazio "Tudo recebido") e "Montadas, prontas para vender" ("os materiais dão para mais N"; "+ Montar" abre `Modal` com `FormPlacaMontagem`). Cartões antigos continuam abaixo.
- `FormPlacaMontagem({ onSalvar })`: modelo (ativos), quantidade, data (hoje).
- AbaVendas: coluna Situação (`Recebido em dd/mm` `--paga` / `A receber` / `Atrasada`), botão "Recebi"/"Desfazer"; venda `via_projeto` mostra "Pelo projeto" sem botão. Abre o modal de nova venda já com cliente quando a URL tem `nova_venda=<clienteId>`.
- FormPlacaVenda: checkbox "Já recebi" envia `recebido`.
- [ ] Testes: Resumo mostra a venda a receber e "Recebi" chama `POST /placas/vendas/:id/recebimento`; "+ Montar" envia `POST /placas/montagens`.
- [ ] `npx vitest run web/src/pages/servicos` → passar; commit `feat: painel de placas com a receber e montadas`.

### Task 5: Web — painel de Sites e GMN, cards de Serviços, perfil do cliente

**Files:** Create `web/src/pages/servicos/PainelReceber.jsx`; Modify `SitesSistemas.jsx`, `GoogleMeuNegocio.jsx`, `web/src/pages/Servicos.jsx`, `web/src/pages/cliente/AbaPlacas.jsx`; Tests nos `.test.jsx` correspondentes.

- `PainelReceber({ servico, projetos })`: 3 `Numero` (Sites: A receber, Em andamento, Entregues no mês; GMN: A receber, Pendentes, Configurados no mês) + cartão "A receber" de `/parcelas?servico=X` não pagas (cliente, projeto, descrição, vencimento com etiqueta atrasada/vence em ≤7 dias, valor, "Recebi" → `PUT /parcelas/:id { pago_em: hoje }`).
- Servicos: card mostra `R$ X a receber` (+ ` · N montadas` em placas) via `/servicos/resumo`, mantendo o número atual nos outros dois.
- AbaPlacas do cliente: sem "+ Venda de placas"; lista `vendas` com situação; link "Lançar venda" → `/servicos?aba=placas&nova_venda=<id>`; cartões antigos de projeto só aparecem se existirem.
- [ ] Testes e commit `feat: painel de a receber em sites e gmn`.

### Task 6: Início e Financeiro

**Files:** Modify `web/src/pages/Inicio.jsx`, `web/src/pages/Financeiro.jsx`; Tests correspondentes.
- Início: "Para entregar" diz "N vendas de placas a receber".
- Financeiro: `key={`${p.tipo}-${p.id}`}`; linha `venda_placa` linka para `/servicos?aba=placas&placas=vendas`.
- [ ] Testes, suíte inteira `npm test` verde, commit `feat: inicio e financeiro mostram vendas de placa`.
