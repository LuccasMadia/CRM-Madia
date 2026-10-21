# Tabela de preços e orçamentos em PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O CRM passa a ter uma tabela de preços interna, editável em Configurações. No perfil do cliente, o Lucca monta um orçamento a partir dessa tabela, com desconto de combo automático, e baixa um PDF com a marca dele para mandar no WhatsApp.

**Architecture:**
- **Servidor:** uma migration nova (027) com a tabela de preços, os pacotes e os orçamentos. Repositórios no padrão `criarRepo`. Uma função pura calcula os totais e o desconto, e rotas Express usam essa função. O servidor gera o PDF com `pdfkit`, a partir de um "modelo do documento" que é testado sem o PDF.
- **Front:** uma seção nova em Configurações, uma aba "Orçamentos" no perfil do cliente e uma página `/orcamentos/:id` para montar o orçamento. O servidor devolve os totais em cada resposta, então o front não recalcula nada.

**Tech Stack:** Express 5, `node:sqlite`, React 19 + react-router 8, Vitest + supertest + Testing Library, `pdfkit` (dependência nova).

**Spec:** `docs/superpowers/specs/2026-10-21-orcamentos-design.md`

## Global Constraints

- Dinheiro sempre em centavos (inteiro). No front, todo valor em R$ passa por `formatarDinheiro` (`web/src/lib/dinheiro.js`), que respeita o "ocultar valores". O PDF usa os valores reais, sem passar por essa função.
- A migration nova é **`server/db/migrations/027_orcamentos.sql`**. O runner registra cada migration pelo nome do arquivo.
- Nenhuma rota nova fica em `/publico/*`. Tudo vai sob `/api` (atrás do `protegerLocal` e do Cloudflare Access).
- O preço da configuração do GMN tem uma fonte só: a chave de config **`preco_servico_google_meu_negocio_centavos`**. A tabela não guarda esse valor.
- O preço da placa tem uma fonte só: os modelos e packs de Placas, via `precoSugeridoPlacas(db, { modelo, quantidade, clienteId })` (`server/repos/placas.js`).
- Desconto de combo: **10%** padrão, aplicado só sobre a parte paga uma vez. Ele entra quando há **2 ou mais serviços diferentes com valor pago uma vez > 0**. Mensalidades não contam para chegar aos 2. Todas as placas contam como **um** serviço. Cada item livre conta como um serviço.
- Arredondamento do desconto: `Math.round(subtotal * pct / 100)`. No exemplo do Filinto, 183000 × 10% = 18300, ou seja, R$ 183,00, e o total fica R$ 1.647,00.
- Validade padrão de **15 dias**. Forma de pagamento e prazo começam com **"a combinar"**.
- Orçamentos antigos guardam o valor de cada item. Mudar a tabela depois não muda nenhum orçamento já feito.
- Textos da interface em português, no tom do resto do CRM.
- Commits em Conventional Commits, nomeando os arquivos (`git commit -- <arquivos>`), porque outras sessões trabalham no main. Cada commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- O pm2 não tem watch: a mudança só vale depois do build, da migration e de `pm2 restart crm-madia-api` (Task 8).

## Review Focus

1. **Mudar a tabela depois:** se o Lucca edita o preço da landing page de R$ 600 para R$ 700, um orçamento antigo continua com R$ 600, inclusive no PDF. Teste na Task 4.
2. **Dois modelos de placa no mesmo orçamento:** placa redonda + placa quadrada + configuração do GMN dão 2 serviços, não 3. O desconto entra, mas por causa do GMN, e não por causa das duas placas. Teste na Task 2.
3. **Orçamento vazio, ou só com mensalidades:**
   - nenhuma linha de desconto;
   - total pago uma vez R$ 0,00;
   - o PDF é gerado mesmo assim.
   Testes nas Tasks 2 e 5.
4. **Nome do cliente com acento ou símbolo no nome do arquivo:** "Açaí & Cia/SP" vira `Orcamento-012-Acai-Cia-SP.pdf`, sem quebrar o download. Teste na Task 5.
5. **Serviço da tabela já usado em orçamento:**
   - apagar responde 409 com uma mensagem que sugere desativar;
   - desativar tira o serviço do "Novo orçamento" e mantém o item nos orçamentos antigos.
   Teste na Task 3.

---

### Task 1: Migration 027 e repositórios

**Files:**
- Create: `server/db/migrations/027_orcamentos.sql`
- Create: `server/repos/orcamentos.js`
- Test: `server/db/migracao-027.test.js` (seguir o padrão de `server/db/migracao-025.test.js`)

**Interfaces:**
- Produces, tabelas:
  - **`tabela_servicos`**: `id`, `nome` TEXT NOT NULL, `frase` TEXT, `tipo` TEXT NOT NULL CHECK IN (`'comum'`, `'placa'`, `'gmn_config'`, `'hospedagem'`), `valor_unico_centavos` INTEGER (NULL quando não tem), `valor_mensal_centavos` INTEGER (NULL quando não tem), `hospedagem` TEXT NOT NULL CHECK IN (`'obrigatoria'`, `'opcional'`, `'nao_se_aplica'`) DEFAULT `'nao_se_aplica'`, `ordem` INTEGER NOT NULL, `ativo` INTEGER NOT NULL DEFAULT 1, `criado_em`, `atualizado_em`.
  - **`tabela_pacotes`**: `id`, `nome` TEXT NOT NULL, `criado_em`, `atualizado_em`.
  - **`tabela_pacotes_itens`**: `id`, `pacote_id` → `tabela_pacotes` ON DELETE CASCADE, `servico_id` → `tabela_servicos`, `opcional` INTEGER NOT NULL DEFAULT 0, `quantidade` INTEGER NOT NULL DEFAULT 1, `placa_modelo_id` → `placas_modelos` (NULL), `ordem` INTEGER NOT NULL.
  - **`orcamentos`**:
    - `id` INTEGER PRIMARY KEY **AUTOINCREMENT**. O id é o número do orçamento, e o AUTOINCREMENT garante que um número apagado nunca volta;
    - `cliente_id` → `clientes` ON DELETE CASCADE;
    - `data` TEXT NOT NULL;
    - `validade_dias` INTEGER NOT NULL DEFAULT 15;
    - `pagamento` TEXT NOT NULL DEFAULT `'a combinar'`;
    - `prazo` TEXT NOT NULL DEFAULT `'a combinar'`;
    - `observacao` TEXT;
    - `situacao` TEXT NOT NULL CHECK IN (`'rascunho'`, `'enviado'`, `'aceito'`, `'recusado'`) DEFAULT `'rascunho'`;
    - `desconto_pct` INTEGER (NULL = sem desconto);
    - `titulo_pacote` TEXT;
    - `criado_em`, `atualizado_em`.
  - **`orcamento_itens`**: `id`, `orcamento_id` → `orcamentos` ON DELETE CASCADE, `servico_id` → `tabela_servicos` ON DELETE SET NULL, `placa_modelo_id` → `placas_modelos` (NULL), `nome` TEXT NOT NULL, `frase` TEXT, `quantidade` INTEGER NOT NULL DEFAULT 1, `valor_unico_centavos` INTEGER, `valor_mensal_centavos` INTEGER, `ordem` INTEGER NOT NULL, `criado_em`, `atualizado_em`.
- Produces, dados iniciais (seed), em `tabela_servicos`, nesta ordem:

  | nome | tipo | único | mensal | hospedagem | frase |
  |---|---|---|---|---|---|
  | Landing page | comum | 60000 | NULL | opcional | "Uma página com apresentação, serviços e botão de WhatsApp" |
  | Cardápio / catálogo digital | comum | 90000 | NULL | obrigatoria | "Produtos com foto e preço por categoria, pedido pelo WhatsApp" |
  | Site institucional (até 5 páginas) | comum | 120000 | NULL | opcional | "Início, sobre, serviços, galeria e contato" |
  | Sistema de agendamento | comum | 150000 | NULL | obrigatoria | "Cliente escolhe dia e horário; você vê a agenda num painel" |
  | Loja online | comum | 200000 | NULL | obrigatoria | "Carrinho, pagamento online e controle de pedidos" |
  | Configuração do Google Meu Negócio | gmn_config | NULL | NULL | nao_se_aplica | "Perfil completo no Google Maps, com fotos, horários e categorias" |
  | Gestão do Google Meu Negócio | comum | NULL | 15000 | nao_se_aplica | "Posts e respostas a avaliações todo mês" |
  | Placa NFC | placa | NULL | NULL | nao_se_aplica | "Encosta o celular e abre a avaliação no Google" |
  | Hospedagem e suporte | hospedagem | NULL | 15000 | nao_se_aplica | "Site no ar, pequenos ajustes e suporte" |

- Produces, pacote inicial **"Presença Local"** com três itens:
  - Placa NFC (quantidade 1, `placa_modelo_id` NULL, para escolher na hora);
  - Configuração do Google Meu Negócio;
  - Gestão do Google Meu Negócio, com `opcional = 1`.
- Produces, config: `INSERT OR IGNORE` de `orcamento_desconto_combo_pct = '10'`.
- Produces, em `server/repos/orcamentos.js`:
  - `repoTabelaServicos(db)`: `criarRepo` + `listarAtivos()` + `emUso(id) → boolean` (true se existe `orcamento_itens` ou `tabela_pacotes_itens` com o id);
  - `repoTabelaPacotes(db)`: `criarRepo` + `listarComItens() → [{ id, nome, itens: [...] }]` + `substituirItens(pacoteId, itens)` (em transação);
  - `repoOrcamentos(db)`: `criarRepo` + `listarDoCliente(clienteId)` (mais novo primeiro);
  - `repoOrcamentoItens(db)`: `criarRepo` + `listarDo(orcamentoId)` (por `ordem, id`) + `proximaOrdem(orcamentoId)` (usar `proximaOrdem` de `server/repos/ordem.js`).

- [ ] **Step 1: Write the failing test** `migracao-027.test.js`:
  - `it('cria a tabela de preços com os 9 serviços na ordem da spec')`: compara `nome`, `tipo`, `valor_unico_centavos`, `valor_mensal_centavos` e `hospedagem` com a tabela acima;
  - `it('cria o pacote Presença Local com a gestão do GMN opcional')`;
  - `it('define o desconto de combo padrão em 10%')`: `obterConfig(db, 'orcamento_desconto_combo_pct') === '10'`;
  - `it('não reaproveita número de orçamento apagado')`: cria os orçamentos 1 e 2, apaga o 2, cria outro, e o id dele é 3.
- [ ] **Step 2:** `npx vitest run server/db/migracao-027.test.js` → FAIL (a tabela não existe).
- [ ] **Step 3:** Escrever a migration e os repositórios.
- [ ] **Step 4:** `npx vitest run server/db` → PASS.
- [ ] **Step 5: Commit**: `feat: migration 027 com tabela de precos, pacotes e orcamentos` (arquivos da task).

---

### Task 2: Cálculo dos totais e do desconto

**Files:**
- Create: `server/domain/orcamentos.js`
- Test: `server/domain/orcamentos.test.js`

**Interfaces:**
- Produces: `calcularTotais(itens, descontoPct) → { servicos_combo, subtotal_unico_centavos, desconto_centavos, total_unico_centavos, mensalidades, total_mensal_centavos }`.
  - Entrada `itens`: `[{ id, servico_id, tipo_servico, nome, valor_unico_centavos, valor_mensal_centavos }]`. `tipo_servico` é o `tipo` do serviço da tabela, ou `null` para item livre ou serviço apagado.
  - `servicos_combo`: quantidade de chaves distintas entre os itens com `valor_unico_centavos > 0`. A chave é:
    - `'placa'` quando `tipo_servico === 'placa'`;
    - `'s' + servico_id` quando há `servico_id`;
    - `'i' + id` nos outros casos.
  - `desconto_centavos`: `Math.round(subtotal × pct / 100)` quando `servicos_combo >= 2` e `descontoPct` não é null. Nos outros casos, 0.
  - `mensalidades`: `[{ nome, valor_centavos }]` dos itens com `valor_mensal_centavos > 0`, na ordem dos itens.
- Produces: `nomeArquivoPdf(numero, nomeCliente) → string` no formato `Orcamento-${String(numero).padStart(3,'0')}-${slug}.pdf`. O slug:
  - tira os acentos (NFD);
  - troca qualquer sequência que não seja `[A-Za-z0-9]` por `-`;
  - apara os `-` das pontas;
  - fica `cliente` se o resultado sair vazio.
  - Mantém maiúsculas e minúsculas.

- [ ] **Step 1: Write the failing tests:**
  - `it('Filinto: placa + GMN + cardápio dá 10% sobre 1830 e mensalidade separada')`: quatro itens:
    - placa, único 8000;
    - gmn_config, único 25000;
    - cardápio, único 150000;
    - "Hospedagem e suporte" (tipo hospedagem), mensal 15000.

    Espera `subtotal 183000`, `desconto 18300`, `total_unico 164700`, `mensalidades [{ nome: 'Hospedagem e suporte', valor_centavos: 15000 }]`, `servicos_combo 3`.
  - `it('landing page + hospedagem não tem desconto (mensalidade não conta)')`: `servicos_combo 1`, `desconto 0`.
  - `it('duas placas de modelos diferentes contam como um serviço')`: duas placas + GMN dá `servicos_combo 2`. Só as duas placas dão `servicos_combo 1` e `desconto 0`.
  - `it('dois itens livres contam como dois serviços')`.
  - `it('desconto_pct null não dá desconto; 15 dá 15%')`.
  - `it('orçamento vazio dá tudo zero e nenhuma mensalidade')`.
  - `it('nomeArquivoPdf')`:
    - `(7, 'Filinto Sorvetes')` → `'Orcamento-007-Filinto-Sorvetes.pdf'`;
    - `(12, 'Açaí & Cia/SP')` → `'Orcamento-012-Acai-Cia-SP.pdf'`;
    - `(1234, '***')` → `'Orcamento-1234-cliente.pdf'`.
- [ ] **Step 2:** `npx vitest run server/domain/orcamentos.test.js` → FAIL.
- [ ] **Step 3:** Implementar as duas funções.
- [ ] **Step 4:** Rodar de novo → PASS.
- [ ] **Step 5: Commit**: `feat: calculo de totais e desconto de combo do orcamento`.

---

### Task 3: Rotas da tabela de preços

**Files:**
- Create: `server/routes/tabelaPrecos.js`
- Modify: `server/app.js` (montar em `app.use('/api/tabela-precos', rotasTabelaPrecos(ctx))`)
- Test: `server/routes/tabelaPrecos.test.js` (usar `criarContexto` de `server/test/contexto.js`)

**Interfaces:**
- Consumes: repositórios da Task 1; `obterConfig` e `definirConfig` (`server/repos/config.js`); `reordenar` (`server/repos/ordem.js`); `validar` e `lerId`.
- Produces as rotas abaixo.
  - **`GET /api/tabela-precos`** → `{ servicos, pacotes, desconto_combo_pct, contato_whatsapp }`:
    - `servicos` traz todos os serviços, ativos e inativos, por `ordem`;
    - no serviço `gmn_config`, o `valor_unico_centavos` é preenchido com `Number(obterConfig(db, 'preco_servico_google_meu_negocio_centavos') ?? 0)`;
    - `desconto_combo_pct` é um Number;
    - `contato_whatsapp` é string ou null (chave de config `contato_whatsapp`).
  - **`POST /api/tabela-precos/servicos`** → 201. Aceita `nome` (obrigatório), `frase`, `valor_unico_centavos`, `valor_mensal_centavos` e `hospedagem`. O `tipo` é sempre `'comum'` e a `ordem` vai para o fim.
  - **`PUT /api/tabela-precos/servicos/:id`**:
    - parcial; aceita também `ativo` (bool);
    - **no serviço `gmn_config`, o `valor_unico_centavos` é gravado na chave de config, não na linha**;
    - nos serviços `placa` e `gmn_config`, o `valor_mensal_centavos` é ignorado;
    - no serviço `placa`, o `valor_unico_centavos` também é ignorado.
  - **`DELETE /api/tabela-precos/servicos/:id`**:
    - 204 quando apaga;
    - **409 `'Este serviço já foi usado. Desative em vez de apagar.'`** quando `emUso`;
    - 409 para os tipos `placa`, `gmn_config` e `hospedagem`, que não podem ser apagados.
  - **`PUT /api/tabela-precos/servicos/ordem`** → body `{ ids }`, com o mesmo contrato de `reordenar`. Não existe coluna pai, então use `reordenar` adaptado, ou uma versão sem pai no mesmo arquivo.
  - **Pacotes**: `POST /api/tabela-precos/pacotes` e `PUT /api/tabela-precos/pacotes/:id`, com body `{ nome, itens: [{ servico_id, opcional, quantidade, placa_modelo_id }] }`. `DELETE /api/tabela-precos/pacotes/:id` responde 204.
  - **`PUT /api/tabela-precos/config`** → body `{ desconto_combo_pct, contato_whatsapp }`:
    - `desconto_combo_pct` é inteiro de 0 a 100;
    - `contato_whatsapp` é texto, e vazio vira null.

- [ ] **Step 1: Write the failing tests:**
  - `it('lista os 9 serviços, o pacote e o desconto; GMN vem da config')`: com `definirConfig(db, 'preco_servico_google_meu_negocio_centavos', '30000')`, o serviço GMN vem com `valor_unico_centavos 30000`.
  - `it('editar o valor do GMN grava na config e não na linha')`: depois do PUT, `obterConfig` dá `'25000'`, `GET /api/config` mostra o mesmo valor e a coluna da linha continua NULL.
  - `it('cria, edita, desativa e reordena serviço')`.
  - `it('não apaga serviço usado em orçamento nem os serviços fixos')`: insere um `orcamento_itens` direto no db e espera 409 com a mensagem exata. `gmn_config` também dá 409.
  - `it('salva pacote com itens e substitui os itens no PUT')`.
  - `it('valida desconto entre 0 e 100 e grava o WhatsApp')`.
- [ ] **Step 2:** `npx vitest run server/routes/tabelaPrecos.test.js` → FAIL.
- [ ] **Step 3:** Implementar as rotas e montar no `app.js`.
- [ ] **Step 4:** Rodar de novo, e depois `npx vitest run server` → PASS (o resto do servidor continua verde).
- [ ] **Step 5: Commit**: `feat: rotas da tabela de precos e pacotes`.

---

### Task 4: Rotas de orçamentos

**Files:**
- Create: `server/routes/orcamentos.js`
- Modify: `server/app.js` (`app.use('/api', rotasOrcamentos(ctx))`)
- Test: `server/routes/orcamentos.test.js`

**Interfaces:**
- Consumes: Tasks 1–3; `calcularTotais`; `precoSugeridoPlacas` e `repoPlacasModelos` (`server/repos/placas.js`); `ctx.hoje()` para a data.
- Produces o **formato do orçamento** (`Orcamento`), que é o que todas as rotas abaixo devolvem: `{ ...linha de orcamentos, numero: id, cliente_nome, itens: [...itens com tipo_servico], totais: calcularTotais(...), sugerir_hospedagem: boolean }`. `sugerir_hospedagem` é true quando há algum item com serviço `hospedagem = 'opcional'` e nenhum item do tipo `hospedagem`.
- Produces as rotas abaixo.
  - `GET /api/clientes/:id/orcamentos` → `[{ id, numero, data, situacao, totais }]`.
  - **`POST /api/clientes/:id/orcamentos`** → 201 `Orcamento` com:
    - `data = hoje()`;
    - `desconto_pct = Number(config orcamento_desconto_combo_pct)`;
    - os demais campos com os padrões da tabela.
  - `GET /api/orcamentos/:id` → `Orcamento`.
  - `PUT /api/orcamentos/:id` → aceita `data`, `validade_dias` (min 1), `pagamento`, `prazo`, `observacao`, `situacao` (enum), `desconto_pct` (0–100 ou null) e `titulo_pacote`.
  - `DELETE /api/orcamentos/:id` → 204.
  - **`POST /api/orcamentos/:id/duplicar`** → 201 `Orcamento` novo, com:
    - os mesmos itens e valores;
    - `situacao 'rascunho'`;
    - `data = hoje()`.
  - **`POST /api/orcamentos/:id/itens`** → 201 `Orcamento`. O body tem uma destas três formas:
    - **`{ servico_id }`**:
      - copia `nome`, `frase` e os valores do serviço;
      - no `gmn_config`, o valor vem da config;
      - serviço inativo dá 409.
    - **`{ servico_id, placa_modelo_id, quantidade }`**, para o serviço `placa`:
      - `nome = 'Placa NFC — <nome do modelo>'`;
      - `valor_unico_centavos = precoSugeridoPlacas(db, { modelo, quantidade, clienteId: orcamento.cliente_id }).total_centavos`.
    - **`{ livre: true, nome, frase, valor_unico_centavos, valor_mensal_centavos }`**: `nome` obrigatório e pelo menos um dos dois valores.
    - **Regra da hospedagem:** se o serviço adicionado tem `hospedagem = 'obrigatoria'` e o orçamento ainda não tem item do tipo `hospedagem`, a rota adiciona junto um item copiado do serviço "Hospedagem e suporte".
  - `PUT /api/orcamentos/:id/itens/:itemId` → aceita `nome`, `frase`, `quantidade` (min 1), `valor_unico_centavos` e `valor_mensal_centavos` (min 0 ou null). Devolve `Orcamento`.
  - `DELETE /api/orcamentos/:id/itens/:itemId` → `Orcamento`.
  - **`POST /api/orcamentos/:id/pacote`** → body `{ pacote_id, opcionais: [ids de tabela_pacotes_itens a incluir], placa_modelo_id }`:
    - adiciona os itens do pacote pelas mesmas regras do POST de item;
    - inclui os itens opcionais só se estiverem em `opcionais`;
    - a placa usa o `placa_modelo_id` do body quando o item do pacote não tem um;
    - define `titulo_pacote = nome do pacote`;
    - devolve `Orcamento`.
  - **Erro de item:** item de outro orçamento dá 404.

- [ ] **Step 1: Write the failing tests:**
  - `it('cria orçamento com número, data de hoje, 15 dias, a combinar e desconto 10')`.
  - `it('monta o orçamento do Filinto: placa pelo preço do modelo, GMN da config, cardápio traz hospedagem junto')`:
    - cadastra um modelo de placa a 8000 pela API de placas;
    - GMN a 25000;
    - o cardápio entra pelo valor da tabela (90000). Edita o item para 150000 (o valor B2B);
    - espera 4 itens (placa, GMN, cardápio, hospedagem);
    - espera `totais.total_unico_centavos 164700`.
  - `it('landing page sugere hospedagem sem adicionar')`: `sugerir_hospedagem true`, 1 item.
  - `it('editar a tabela depois não muda orçamento existente')`: landing page a 60000 no orçamento; PUT na tabela para 70000; GET do orçamento continua com 60000. **(Review Focus 1)**
  - `it('aplica pacote Presença Local com e sem a gestão opcional')`: `titulo_pacote 'Presença Local'`.
  - `it('item livre conta para o combo e é validado')`.
  - `it('duplicar copia itens e volta para rascunho')`.
  - `it('não adiciona serviço inativo e não mexe em item de outro orçamento')`.
  - `it('excluir o cliente apaga os orçamentos dele')`: cliente sem projetos.
- [ ] **Step 2:** `npx vitest run server/routes/orcamentos.test.js` → FAIL.
- [ ] **Step 3:** Implementar e montar no `app.js`.
- [ ] **Step 4:** `npx vitest run server` → PASS.
- [ ] **Step 5: Commit**: `feat: rotas de orcamentos com itens, pacotes e duplicar`.

---

### Task 5: PDF do orçamento

**Files:**
- Modify: `package.json` (`npm install pdfkit`)
- Create: `server/orcamentos/pdf.js`
- Modify: `server/routes/orcamentos.js` (rota do PDF)
- Test: `server/orcamentos/pdf.test.js`, mais um caso em `server/routes/orcamentos.test.js`

**Interfaces:**
- Consumes: `Orcamento` (Task 4); `nomeArquivoPdf` (Task 2); a config `contato_whatsapp`.
- Produces: `modeloDocumento(orcamento, { whatsapp }) → { cabecalho, para, itens, desconto, total_unico, mensalidades, rodape }`. É uma estrutura só de textos, já formatados:
  - **`cabecalho`**: `{ marca: 'Madia Consultoria', sub: 'por Luccas Madia · luccasmadia.com.br', numero: 'Orçamento nº 007', data: '21/10/2026', validade: 'Válido por 15 dias' }`;
  - **`itens`**: `[{ nome, frase, valor }]`. Quando `quantidade > 1`, o nome ganha `' × N'` no fim;
  - **`desconto`**: `{ rotulo: 'Desconto combo (10%)', valor: '- R$ 183,00' }`, ou null quando não há desconto. **Use hífen ASCII**: o sinal de menos U+2212 não existe nas fontes padrão do PDF;
  - **`total_unico`**: `'R$ 1.647,00'`;
  - **`mensalidades`**: `[{ nome, valor: 'R$ 150,00/mês' }]`;
  - **`rodape`**: `['Forma de pagamento: a combinar · Prazo: a combinar', 'WhatsApp <número> · @madia.consultoria']`. Sem WhatsApp configurado, a segunda linha fica só com `'@madia.consultoria'`;
  - **`observacao`**: entra como linha extra no rodapé, quando houver.
  - **Formato do dinheiro:** `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`. Nos testes, normalize o espaço não separável com `/\s/`.
- Produces: `gerarPdf(modelo) → Promise<Buffer>`, com `pdfkit` e a fonte Helvetica embutida. O layout segue o esboço aprovado (`.superpowers/brainstorm/864-1792604095/content/pdf-orcamento.html`):
  - página A4 com fundo branco;
  - linha turquesa `#2dd4bf` de 3pt sob o cabeçalho;
  - itens com o nome em preto, a frase em cinza `#777` menor e o valor alinhado à direita;
  - desconto em `#0f9e8c`;
  - caixa de total com fundo `#f3fbfa`;
  - rodapé cinza.
- Produces: **`GET /api/orcamentos/:id/pdf`** → 200, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<nomeArquivoPdf>"`.

- [ ] **Step 1: Write the failing tests** em `pdf.test.js`:
  - `it('modelo do Filinto')`: compara o objeto inteiro com os valores do esboço (`'Orçamento nº 007'`, as três linhas de item, desconto `'- R$ 183,00'`, total `'R$ 1.647,00'`, mensalidade `'R$ 150,00/mês'`).
  - `it('sem desconto e só mensalidade')`: `desconto` null, total `'R$ 0,00'`. **(Review Focus 3)**
  - `it('placa × 3 e rodapé sem WhatsApp')`.
  - `it('gerarPdf devolve um PDF')`: `buffer.subarray(0, 5).toString() === '%PDF-'`.

  Na rota: `it('baixa o PDF com o nome do arquivo')`, com o cliente "Açaí & Cia/SP" → `filename="Orcamento-001-Acai-Cia-SP.pdf"`. **(Review Focus 4)**
- [ ] **Step 2:** `npx vitest run server/orcamentos server/routes/orcamentos.test.js` → FAIL.
- [ ] **Step 3:** `npm install pdfkit`, depois implementar `modeloDocumento`, `gerarPdf` e a rota.
- [ ] **Step 4:** Rodar de novo → PASS. Gerar um PDF do Filinto num script de rascunho (no scratchpad) e abrir para comparar com o esboço.
- [ ] **Step 5: Commit**: `feat: pdf do orcamento com a marca da madia` (incluir `package.json` e `package-lock.json`).

---

### Task 6: Configurações › Tabela de preços

**Files:**
- Create: `web/src/pages/config/TabelaPrecos.jsx`
- Modify: `web/src/pages/Config.jsx`. Remover `PrecosServicos` e a seção "Preço padrão do Google Meu Negócio", que passa a ser editado na tabela. Renderizar `<TabelaPrecos />` no lugar.
- Test: `web/src/pages/config/TabelaPrecos.test.jsx`. Ajustar também `web/src/pages/Config.test.jsx`, que hoje testa a seção removida.

**Interfaces:**
- Consumes: as rotas da Task 3; `api` (`web/src/api/client.js`); `useCarregar`, `useEnvio`, `Campo`, `Aviso`, `Modal`; `paraCentavos`, `centavosParaTexto` e `formatarDinheiro`.
- Produces: `export function TabelaPrecos()`, um cartão `<section className="cartao">` com o título "Tabela de preços". Ele tem três blocos:
  1. **Lista de serviços.** Cada linha mostra:
     - nome;
     - "R$ X" pago uma vez, e/ou "R$ Y/mês";
     - selo "inativo" quando for o caso;
     - botões Editar (abre um `Modal` com nome, frase, valor único, valor mensal e hospedagem obrigatória/opcional/não se aplica), Desativar/Ativar e Apagar;
     - setas ↑ ↓ para reordenar.
     Para `placa`, mostrar "preço do modelo (em Placas)" e não deixar editar valor. Para `gmn_config`, o campo de valor único funciona normalmente, porque o servidor grava na config. Botão "Novo serviço".
  2. **Pacotes.** Lista com nome e itens ("opcional" marcado), mais Novo, Editar (nome + itens escolhidos da tabela, cada um com o checkbox "opcional") e Apagar.
  3. **Formulário curto** com "Desconto de combo (%)" e "WhatsApp no PDF".

- [ ] **Step 1: Write the failing tests** (com `mockApi` e `renderizar`, de `web/src/test/`):
  - `it('mostra os serviços com valor único e mensal')`;
  - `it('edita o valor do GMN e envia PUT com centavos')`;
  - `it('apagar serviço em uso mostra a mensagem do servidor')`;
  - `it('salva desconto e WhatsApp')`;
  - `it('cria pacote marcando a gestão como opcional')`.
- [ ] **Step 2:** `npx vitest run web/src/pages/config/TabelaPrecos.test.jsx` → FAIL.
- [ ] **Step 3:** Implementar e trocar no `Config.jsx`.
- [ ] **Step 4:** `npx vitest run web/src/pages` → PASS.
- [ ] **Step 5: Commit**: `feat: tabela de precos em configuracoes`.

---

### Task 7: Aba Orçamentos e página do orçamento

**Files:**
- Create: `web/src/pages/cliente/AbaOrcamentos.jsx`
- Create: `web/src/pages/Orcamento.jsx`
- Modify: `web/src/pages/ClienteDetalhe.jsx`:
  - acrescentar a aba `['orcamentos', 'Orçamentos']` em `ABAS`;
  - essa aba não tem serviço, então não mostra contagem;
  - ajustar o `.map` para isso.
- Modify: `web/src/App.jsx` (`<Route path="/orcamentos/:id" element={<Orcamento />} />`)
- Modify: a folha de estilos do app, nas regras de leitura no celular (`.orcamento__*`)
- Test: `web/src/pages/cliente/AbaOrcamentos.test.jsx`, `web/src/pages/Orcamento.test.jsx`

**Interfaces:**
- Consumes: rotas das Tasks 3–5; o formato `Orcamento` da Task 4.
- Produces:
  - **`AbaOrcamentos({ cliente })`**:
    - lista os orçamentos do cliente: "nº 007 · 21/10/2026 · Enviado · R$ 1.647,00 + R$ 150,00/mês";
    - cada linha leva para `/orcamentos/:id`;
    - o botão "Novo orçamento" faz o POST e navega para a página nova.
  - **`Orcamento()`** (página, com `useParams().id`):
    - **Topo:**
      - "Orçamento nº 007 — <cliente>", com link de volta para `/clientes/:id?aba=orcamentos`;
      - seletor de situação, que faz PUT na hora;
      - botões "Baixar PDF" (um `<a href="/api/orcamentos/:id/pdf" download>`), "Duplicar" (vai para o novo) e "Excluir" (com `window.confirm`, igual a `ClienteDetalhe`).
    - **Adicionar:**
      - um seletor com os serviços ativos da tabela (exceto `hospedagem`) e os pacotes;
      - placa abre a escolha de modelo (`GET /api/placas/modelos`, só os ativos) e da quantidade;
      - pacote abre os checkboxes dos itens opcionais, desmarcados, mais o modelo de placa se o pacote tiver placa;
      - "Item livre" abre nome, frase e valores.
    - **Itens:**
      - cada item mostra nome, quantidade, frase e valores **editáveis na própria linha**, com PUT ao sair do campo;
      - botão remover.
      - Quando `sugerir_hospedagem` for true, aparece a faixa "Este site pode ter hospedagem e suporte. [Adicionar]", que faz o POST do serviço `hospedagem`.
    - **Totais** (sempre vindos de `orcamento.totais`):
      - linha "Desconto combo (N%)", com o campo para mudar o percentual e o botão "Tirar desconto" (PUT `desconto_pct: null`), ou "Aplicar desconto" quando for null;
      - "Total pago uma vez" em destaque;
      - cada mensalidade com o nome;
      - "Total por mês".
    - **Campos:** data, validade (dias), forma de pagamento, prazo e observação, com PUT ao sair do campo.
    - **Dinheiro na tela:** todos os valores passam por `formatarDinheiro`.

- [ ] **Step 1: Write the failing tests:**
  - **AbaOrcamentos:**
    - `it('lista orçamentos e cria um novo indo para a página dele')`;
    - `it('aba Orçamentos aparece no perfil')`: usar `rotasPerfil` de `web/src/test/perfilCliente.js` com `'GET /clientes/1/orcamentos': []`.
  - **Orcamento:**
    - `it('mostra itens e totais do servidor')`: fixture do Filinto, com `/R\$\s1\.647,00/` e `/R\$\s150,00\/mês/`;
    - `it('adiciona serviço da tabela e re-renderiza com a resposta')`;
    - `it('adiciona placa escolhendo modelo e quantidade')`;
    - `it('aplica pacote com a gestão opcional desmarcada por padrão')`: o corpo do POST traz `opcionais: []`;
    - `it('edita valor do item ao sair do campo')`: PUT com centavos;
    - `it('tira o desconto')`: PUT com `{ desconto_pct: null }`;
    - `it('mostra a sugestão de hospedagem e adiciona')`;
    - `it('link do PDF aponta para a rota')`;
    - `it('valores ocultos escondem R$ na tela')`: ativar o modo como em `web/src/lib/privacidade.js` e conferir que `1.647,00` não aparece.
- [ ] **Step 2:** `npx vitest run web/src/pages/Orcamento.test.jsx web/src/pages/cliente/AbaOrcamentos.test.jsx` → FAIL.
- [ ] **Step 3:** Implementar, ligar a rota e a aba, e escrever o CSS (no celular, uma coluna com o valor à direita e os campos com largura total).
- [ ] **Step 4:** `npm test` → toda a suíte PASS.
- [ ] **Step 5: Commit**: `feat: aba orcamentos no cliente e pagina para montar orcamento`.

---

### Task 8: Colocar no ar (junto com o Lucca)

**Files:** nenhum. São só operações.

- [ ] **Step 1:** `npm test` → tudo verde. Anotar o número de testes.
- [ ] **Step 2:** Fazer o backup do banco antes da 027, com o CRM parado:
  - `pm2 stop crm-madia-api`;
  - copiar `data/crm.db`, `data/crm.db-wal` e `data/crm.db-shm` (os que existirem) para `data/backup-antes-027-2026-10-21.db` (+ `-wal`/`-shm`);
  - confirmar que as cópias existem.
- [ ] **Step 3:** `npm run build`, depois `pm2 start crm-madia-api`. A migration roda ao subir. Conferir `pm2 logs crm-madia-api --lines 20 --nostream`, sem erro.
- [ ] **Step 4:** `curl.exe -s http://127.0.0.1:5174/api/tabela-precos -H "X-CRM: 1"` → 9 serviços.
- [ ] **Step 5:** O Lucca abre o Filinto, monta o orçamento real (placa + GMN + cardápio B2B a R$ 1.500) e baixa o PDF. Conferir junto com ele que bate com o esboço.
- [ ] **Step 6:** Atualizar a memória `project_tabela_precos.md` para "IMPLEMENTADO" e fazer `git push`, se o Lucca pedir.
