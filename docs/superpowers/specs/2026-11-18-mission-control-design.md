# Mission Control (novo Início) — design

Status: desenho para aprovação do Lucca. Conversa em 2026-11-18.
Continua o cérebro (`2026-11-12-cerebro-madia-design.md` e `2026-11-17-cerebro-grafo-design.md`). É a segunda tela do segundo cérebro do vídeo de referência ("VictorOS"), adaptada à Madia.

## Por que

O grafo mostra **como tudo se liga**. Falta a tela que responde **"como está a Madia hoje e o que eu faço agora"**. No vídeo, ela é o Mission Control: números grandes no topo, um to-do e um resumo da manhã.

O Lucca decidiu **transformar o Início** nessa tela, em vez de criar uma tela nova que repetiria o que o Início já mostra.

## Decisões do Lucca (2026-11-18)

- O Início **vira** o Mission Control. A rota continua `/` e o menu continua dizendo "Início".
- O topo **pode mostrar valores em R$**. Isso revoga a regra antiga "dinheiro mora no Financeiro: aqui só o lembrete, sem valores", hoje escrita no `Inicio.jsx`.
- **Sem metas e sem barra de progresso** por enquanto ("esquece essas métricas por enquanto"). Os números aparecem sozinhos.

## Objetivos

### 1. Números grandes no topo

Cinco cartões com número em fonte grande, no estilo do vídeo:

| Cartão | O que mostra | Clique leva a |
|---|---|---|
| **Recebido no mês** | soma do que foi pago no mês atual: parcelas com `pago_em` no mês, mais vendas de placa recebidas no mês. O mesmo número do Financeiro › Visão geral para o mês atual | `/financeiro` |
| **A receber no mês** | `a_receber_mes_centavos`, que o painel já calcula | `/financeiro?aba=recebimentos` |
| **Vencido** | total e quantidade de `atrasadas`, que o painel já calcula. Fica em vermelho quando for maior que zero | `/financeiro?aba=recebimentos` |
| **Projetos em andamento** | `em_andamento`, que o painel já calcula | `/servicos?aba=sites` |
| **Propostas abertas** | quantidade e total de `propostas`, que o painel já calcula | `/servicos?aba=sites` |

- Todo valor em R$ passa por `formatarDinheiro`, para que o modo **ocultar valores** (o olho do menu ou Ctrl+Shift+H) esconda todos.
- Embaixo de cada número, uma linha pequena de contexto. Exemplos: "3 parcelas", "2 em protótipo, 1 em versão final", "R$ 12.400 em propostas".

### 2. To-do, à esquerda

- **Campo "Nova tarefa"** com botão "Adicionar". Cria uma **tarefa interna**, sem projeto, usando o `POST /api/tarefas` que já existe e as mesmas regras de validação. Enter também adiciona.
- **Lista de tarefas abertas** de projetos não fictícios e internas. A ordem:
  1. atrasadas, da mais atrasada para a menos;
  2. com prazo, pelo prazo;
  3. sem prazo, da mais nova para a mais velha.
- **Cada linha** mostra o texto, o projeto ou cliente (link) e as etiquetas:
  - "atrasada N d", em vermelho;
  - "aguardando cliente" e "fazendo", reaproveitando `ROTULO_ETAPA_TAREFA` e as classes `etiqueta--*` que já existem.
- **Caixa para marcar como feita** ali mesmo, com o mesmo endpoint e o mesmo efeito do quadro de Tarefas, ou seja, a etapa vira `concluido`. Se der erro, a tarefa volta para a lista com um aviso.
- **Tamanho:** mostra no máximo 15 tarefas, mais um link "Ver todas (N)" para `/tarefas`.
- **Fictícios:** as tarefas de projetos fictícios **saem** do Início. Hoje elas aparecem em "Fictícios em construção" e continuam no quadro de Tarefas. *(Decisão do Claude: o Mission Control é sobre o trabalho real.)*

### 3. Resumo do dia, à direita

Blocos empilhados, nesta ordem:

1. **Pede ação.** Os mesmos itens do "Pede atenção" do cérebro (`pede_atencao`: parcelas atrasadas, projetos atrasados, sites fora do ar, tarefas vencidas), cada um com link. Reaproveita o componente `PedeAtencao`. Os avisos que já existem no topo do Início (publicação no Instagram, sites fora do ar) continuam onde estão.
2. **Follow-ups.** Quem está esperando uma ação do Lucca:
   - **Orçamento sem resposta:** usa a regra que o CRM **já tem** em `alertasOrcamento` (`server/domain/orcamentos.js`, alerta `sem_resposta`): situação `enviado` e mais de 7 dias desde a data do orçamento (`o.data`). Mostra "Orçamento · Cliente · enviado há N d" e leva para `/orcamentos/:id`. Reaproveita a função e não cria uma segunda regra.
   - **Projeto parado:** projeto **de site/sistema** (`servico = 'site_sistema'`, igual ao cartão "Projetos em andamento"), não fictício, nas etapas `prototipo`, `apresentado`, `valor_definido`, `teste` ou `andamento`, com `atualizado_em` há mais de **14 dias**. Mostra "Projeto · Cliente · parado há N d". GMN e placas ficam no bloco "Para entregar" (abaixo). Qualquer edição no projeto zera a contagem, e isso é aceito.
   - **Aguardando cliente:** tarefas abertas na etapa `aguardando_cliente`, agrupadas por cliente. Mostra "Cliente · N tarefas aguardando".
   - Lista vazia: "Ninguém esperando por você."
   - *(Os limites de 7 e 14 dias são decisões do Claude.)*
3. **Para entregar.** O bloco que hoje fica em "Entregas a clientes" para **Google Meu Negócio** e **Placas NFC** (`para_entregar` do painel): o cliente com link para a aba do serviço. Continua no Início porque nenhuma outra tela mostra essa lista. *(Decisão do Claude, depois da revisão.)*
4. **Divulgação.** O bloco "Falta divulgar" de hoje, compacto: o projeto e as etiquetas Instagram/Portfólio.
5. **Agenda.** Um espaço reservado com o texto "Agenda do dia — em breve (Google Agenda)". Não faz nada ainda.

### 4. Embaixo

Os dois gráficos que já existem, o **funil de oportunidades** e **de onde vêm os clientes**, sem mudança.

### 5. Visual

- O estilo do vídeo dentro do **tema escuro do CRM**:
  - cartões com borda sutil e fundo `--superficie`;
  - números grandes (cerca de 2,5rem, peso forte, com algarismos de largura fixa);
  - títulos de seção pequenos, em caixa alta e com espaçamento;
  - um leve halo `--primaria` atrás do topo, combinando com a tela do Cérebro.
- O cabeçalho continua "Olá, Lucca" e a data de hoje, e o título passa a ser **"Mission Control"**. O menu continua "Início".
- **Layout:**
  - Computador: o topo com os 5 cartões numa linha; abaixo, duas colunas (to-do à esquerda, cerca de 55%, e o resumo à direita); por fim os gráficos.
  - Celular: tudo em uma coluna, na ordem números → pede ação → to-do → follow-ups → divulgação → agenda → gráficos. Os cartões de número viram uma grade de 2 colunas.

## Dados

- **Uma chamada só:** o Início continua fazendo `GET /api/painel`. A rota ganha os campos novos:
  - `cartoes.recebido_mes_centavos`
  - `cartoes.em_andamento_detalhe`
  - `tarefas_abertas`: até 15, já ordenadas, mais o `total`. Cada uma traz `id, texto, prazo, etapa, projeto_id, projeto_titulo, cliente_id, cliente_nome, dias_atraso`.
  - `follow_ups: { orcamentos, projetos, aguardando }`
  - `pede_atencao`: reaproveita o que `server/routes/cerebro.js` já monta, sem calcular de novo.
- **Recebido no mês** precisa bater com o Financeiro › Visão geral do mesmo mês. O builder confere qual função o Financeiro usa e reaproveita a mesma.
- **Campos que saem:** os que a página deixar de usar (`tarefas_por_projeto.ficticios`, por exemplo) só saem do `/api/painel` se nenhuma outra tela usar. O builder confere.
- **Nada novo no banco.** Sem migration.

### Respostas da revisão (decisões do Claude)

- **To-do:** usa o mesmo filtro do relatório do cérebro (`server/cerebro/relatorio.js`), com `LEFT JOIN` e `projeto_id IS NULL OR (não fictício e não perdido)`, para incluir as tarefas internas.
  - **Link de cada linha:** o projeto, quando houver. Se não houver, o cliente (`tarefas.cliente_id`). Se não houver nenhum dos dois, `/tarefas`.
  - **Sem prazo:** ordem por `criado_em`, da mais nova para a mais velha.
  - **"Ver todas (N)":** N é o total de tarefas abertas, incluindo as que passam das 15.
  - **"Aguardando cliente":** agrupa por `tarefas.cliente_id`.
- **Pede ação:** a função `pedeAtencao` sai de dentro de `server/routes/cerebro.js` para um módulo compartilhado, usado pelo cérebro e pelo painel. É um ajuste pequeno na rota do cérebro, e as respostas dela não mudam.
- **Lembrete "N cobranças atrasadas":** sai, porque o cartão vermelho **Vencido** substitui ele.
- **Recebido no mês:** o servidor soma o mesmo conjunto que o `/painel/graficos` já monta (parcelas não fictícias mais vendas de placa, por `pago_em`) para o mês atual. Bate com o Financeiro › Visão geral, que soma o mesmo conjunto no navegador.
- **`/api/painel`:** os campos atuais **ficam** (`tarefas_por_projeto` e os outros), porque outros testes os usam. Só entram os campos novos.
- **`Numero.jsx`:** ganha a opção de link (uma prop `para`). O `Inicio.test.jsx` é reescrito.

## Não-objetivos

- **Metas e barras de progresso.** Decisão do Lucca.
- **Agenda de verdade (Google Agenda).** Fica só o espaço reservado.
- **Tarefas "extraídas por IA"**, como no vídeo, de reuniões e e-mails. É direção futura.
- **Seguidores do Instagram e números de conteúdo** no topo. Ficam na tela Conteúdo.
- **Mudar as telas de Financeiro, Tarefas ou Serviços.**

## Anti-objetivos

- **Números que não batem.** Se o "Recebido no mês", o "Vencido" ou o "Pede ação" divergirem do Financeiro, do cérebro ou do relatório, a tela perde a confiança. Todos vêm das mesmas funções.
- **Tela que exige rolar para ver o urgente.** No computador, os números, o "Pede ação" e o começo do to-do aparecem sem rolar.
- **Criar tarefa virar formulário.** Adicionar é digitar e apertar Enter. Os detalhes (projeto, prazo) se ajustam no quadro de Tarefas.

## Fica com o builder

- O texto exato da linha de contexto de cada número.
- Como compor `em_andamento_detalhe`.
- O componente do cartão de número: reaproveitar ou estender o `Numero.jsx` que já existe.
- Os testes, no padrão do CRM:
  - vitest + supertest para os campos novos do `/api/painel`;
  - testing-library para a página: criar tarefa, marcar como feita, follow-ups e o ocultar valores.

## Decisões do Claude (para o Lucca conferir)

1. Os cinco números do topo, com os links de cada um.
2. As tarefas de projetos fictícios saem do Início e continuam no quadro de Tarefas.
3. Follow-ups: orçamento enviado há mais de 7 dias sem mudança, projeto parado há mais de 14 dias e tarefas aguardando cliente.
4. A tarefa criada pelo Início é interna, sem projeto.
5. Título "Mission Control", com o menu ainda dizendo "Início".
