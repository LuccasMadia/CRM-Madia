# Perfil do cliente por serviço + Funil só sites e sistemas

Data: 2026-10-15
Status: aprovado em conversa, aguardando revisão da spec

## Contexto

A interface mistura serviços: Google Meu Negócio (GMN) e Placas NFC entram no Funil como linhas de serviço de uma oportunidade, e Funil e Projetos mostram os mesmos registros. O Lucca quer:

- o **perfil do cliente como centro**, com uma aba por serviço: **Sites e Sistemas**, **Google Meu Negócio** e **Placas NFC (+ QR Codes)**;
- o **Funil dedicado só a sites e sistemas**.

A sidebar recolhível (parte 1 da reorganização) já está no main. Esta spec cobre as partes 2 e 3. A lista de abas não é definitiva: o Lucca vai ajustando com o uso.

Estado atual relevante:

- todo pagamento é uma `parcela` ligada a um `projeto`; Financeiro, Início e mensalidade leem só daí;
- nenhuma oportunidade tem linhas em `projetos_servicos` hoje; existem 2 `placas_vendas` avulsas (criadas pela tela Placas);
- a entrega de um projeto com linha `placas_nfc` já cria a venda e baixa o estoque (`processarEntregaDePlacas`), com preço de pack/recompra.

## Decisão de arquitetura

Abordagem A: **todo serviço é um registro em `projetos`, com um tipo**. GMN e placas reaproveitam parcelas, mensalidade, etapa, notas, data de entrega e a linha de placas existente. Tabelas separadas por serviço (B) ou uma tabela genérica (C) foram descartadas por exigirem reescrever pagamento, mensalidade e Financeiro.

## 1. Dados

### Migration `015_projetos_servico.sql`

- `projetos.servico TEXT NOT NULL DEFAULT 'site_sistema' CHECK (servico IN ('site_sistema', 'google_meu_negocio', 'placas_nfc'))`. Todos os projetos existentes ficam `site_sistema`.
- `projetos.link_perfil TEXT` (usado por GMN).
- Tabela `projetos_qrcodes`:
  - `projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE`
  - `qrcode_id INTEGER NOT NULL REFERENCES qrcodes(id) ON DELETE CASCADE`
  - `PRIMARY KEY (projeto_id, qrcode_id)`

### Regras por tipo

| | Site/Sistema | Google Meu Negócio | Placas NFC |
|---|---|---|---|
| Etapas | contato, proposta, andamento, entregue, perdido | andamento (Pendente), entregue (Configurado) | andamento (Pendente), entregue (Entregue) |
| Linhas de serviço | `sistemas`, `saas` | nenhuma | exatamente uma `placas_nfc` |
| Campos próprios | — | `link_perfil` | QR codes ligados |
| Fictício | permitido | não | não |

- `servico` é definido na criação e **não muda** depois (PUT com outro valor dá 400 `{campo: 'servico', mensagem: 'Não é possível mudar o tipo de serviço'}`).
- GMN e placas são criados já em `andamento`; enviar outra etapa dá 400.
- Linha `placas_nfc` ou `google_meu_negocio` em projeto `site_sistema` dá 400. Os tipos de linha `google_meu_negocio` deixam de ser oferecidos; o valor continua aceito no CHECK da tabela para não exigir recriá-la.
- QR ligado precisa ser do mesmo cliente do projeto: senão 400 `{campo: 'qrcodes', mensagem: 'QR não pertence a este cliente'}`. Só projetos `placas_nfc` aceitam `qrcodes`.

### Cobrança de GMN e placas

Criação e edição pelo perfil enviam:

- **cobrança única**: `valor_centavos` e `vencimento` → o servidor cria uma parcela (se ainda não houver nenhuma). Editar o valor de uma cobrança única ainda não paga atualiza essa parcela; se já estiver paga, o valor fica travado no formulário.
- **mensalidade** (só GMN): usa `mensalidade_ativa`, `mensalidade_valor_centavos` e `mensalidade_dia_vencimento`, já existentes.

O valor de placas vem da linha de placas (sugestão de pack/recompra, editável). A parcela recebe o valor total da linha.

"Pago" = todas as parcelas do projeto com `pago_em`. Marcar pago usa a rota de parcelas existente.

### Entrega e exclusão

- Marcar entregue numa venda de placas usa o fluxo atual: cria a `placas_venda` e baixa o estoque. Voltar para pendente não desfaz a venda (comportamento atual); entregar de novo não duplica, porque a linha já tem `venda_id`.
- Excluir GMN ou venda de placas apaga parcelas, linha de serviço e ligações de QR (cascade). Uma venda de placas já entregue continua em Placas › Vendas; para devolver o estoque, exclui-se a venda lá.

### Vendas avulsas

`placas_vendas` sem projeto continuam como estão e aparecem no histórico da aba Placas do cliente (quando têm `cliente_id`) como "venda avulsa", sem pago/entregue/QR.

## 2. API

- `GET /projetos?servico=site_sistema|google_meu_negocio|placas_nfc` filtra por tipo; sem o parâmetro, devolve todos (compatível).
- `POST /projetos` aceita `servico`, `link_perfil`, `qrcodes: [ids]`, `valor_centavos` + `vencimento` (cobrança única); `PUT /projetos/:id` aceita os mesmos, exceto `servico`.
- A resposta de um projeto inclui `servico`, `link_perfil`, `qrcodes: [{id, nome}]` e `parcelas_resumo: {total_centavos, pago: bool, proximo_vencimento}`.
- `GET /clientes/:id/placas` devolve `{ vendas_avulsas: [...], ja_comprou: n }` para o resumo e o histórico.
- `GET /parcelas` inclui `servico` do projeto e aceita `?servico=`.
- `GET /painel` passa a contar propostas, prazos e andamento só de `site_sistema`, e ganha `para_entregar: { gmn: n, placas: n, itens: [{projeto_id, cliente_id, cliente_nome, servico}] }`.

## 3. Interface

### Perfil do cliente (`/clientes/:id`)

- **Topo fixo**: nome, contato e botão **Editar dados** (os dados da antiga seção "Dados").
- **Abas com contador**: Sites e Sistemas (n), Google Meu Negócio (n), Placas NFC (n). A aba aberta fica em `?aba=sites|gmn|placas`; padrão `sites`.

**Sites e Sistemas**: lista dos projetos `site_sistema` do cliente (título, etapa, valor), cada um levando à página do projeto (inalterada). Botão **+ Nova oportunidade** abre o formulário do Funil com o cliente preenchido.

**Google Meu Negócio**: um cartão por serviço com:
- status **Pendente** (botão "Marcar configurado") ou **Configurado em dd/mm**;
- link do perfil (abre em nova aba);
- cobrança: "R$ X · pago", "R$ X · a receber (vence dd/mm)" com "Marcar pago", ou "R$ X/mês, dia N";
- observações; ações **Editar** e **Excluir**.

Botão **+ Google Meu Negócio** abre o formulário: cobrança (única ou mensalidade), valor, vencimento ou dia, link, observações.

**Placas NFC**:
- resumo: "Já comprou N placas" e, quando houver modelo com pack, "a próxima <modelo> sai R$ X";
- um cartão por venda: modelo × quantidade, valor, **Pago/A receber** ("Marcar pago"), **Entregue/Pendente** ("Marcar entregue"), QRs como `#1 #3`; ações **Editar** e **Excluir**;
- **+ Venda de placas**: modelo, quantidade, valor (com a sugestão de pack/recompra atual), vencimento, QR codes (seleção múltipla entre os QRs do cliente, rotulados `#id nome`);
- histórico de vendas avulsas (modelo, quantidade, valor, data);
- abaixo, a lista de **QR Codes do cliente** (movida do perfil), agora com o número `#id`.

### QR Codes

A lista e o detalhe de QR Codes passam a mostrar o número `#id` junto ao nome.

### Funil e Projetos

- Ambos carregam só `servico=site_sistema`.
- O formulário de oportunidade não oferece mais linhas "Placas NFC" nem "Google Meu Negócio"; "Sistemas" e "SaaS" continuam.
- No card do Funil, o nome do cliente vira link para o perfil.

### Financeiro

Coluna **Serviço** (Site/Sistema, GMN, Placas) e filtro por serviço. Totais seguem incluindo tudo.

### Início

- "A receber" inalterado (já inclui tudo).
- Card **Para entregar**: "N GMN pendentes · N vendas de placas a entregar", cada item levando a `/clientes/:id?aba=gmn|placas`.

### Tela Placas

Sem mudança de função: estoque, lotes, modelos, packs, avarias e vendas (incluindo as nascidas no perfil). Venda avulsa continua possível ali.

## Fora de escopo

- Parcelar GMN ou placas em várias vezes (é uma cobrança única ou mensalidade).
- Tarefas, divulgação e portfólio para GMN e placas.
- Separar visualmente oportunidade (Funil) de projeto (Projetos); fica para ajuste posterior.

## Testes

- **Servidor**: migration (coluna padrão `site_sistema`, tabela de QRs); filtro `?servico=`; regras por tipo (etapas, linhas permitidas, `servico` imutável); cobrança única cria/atualiza parcela; QR de outro cliente rejeitado; `parcelas_resumo`; `/clientes/:id/placas`; `/parcelas?servico=`; `/painel` com `para_entregar`.
- **Web**: abas do perfil e `?aba=`; cartões de GMN e placas com as ações de marcar; formulários de GMN e placas (incluindo seleção de QRs); Funil e Projetos sem outros serviços; formulário de oportunidade sem placas/GMN; coluna e filtro no Financeiro; card "Para entregar"; número `#id` nos QR Codes.
