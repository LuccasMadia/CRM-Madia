# Placas NFC: painel, placas montadas e "a receber" — design

Data: 2026-10-18 · Status: aguardando aprovação do Lucca

## Por que

O Lucca abre a área de Placas NFC (Serviços › Placas NFC) principalmente para controlar vendas. Hoje faltam duas coisas:

1. **Placas montadas não existem no sistema.** Ele tem placas já montadas (placa + adesivo + tag), mas o CRM só conhece materiais soltos. Não há como saber quantas placas estão prontas para vender.
2. **O que foi vendido e ainda não foi recebido é confuso.** Existem dois caminhos para lançar venda de placa:
   - pelo perfil do cliente: cria projeto + parcela, com "Pendente / Entregue";
   - por Placas › Vendas: não tem nenhum campo de recebimento.

   As duas vendas reais (Rango do Bicho e Filintinho, R$ 80 cada) foram lançadas por Placas › Vendas e **estão em aberto**. Nada na tela mostra isso.

Ele quer ver isso **logo no início** da área, no mesmo padrão visual das telas já reorganizadas (cards de serviço, tema escuro, cartões de número como no Início e na Visão geral do projeto). Também quer que a ideia sirva para os outros serviços.

## Objetivos

- A primeira aba de Placas NFC vira um **painel**. A primeira coisa que aparece é quanto falta receber e de quem.
- Registrar **montagem** de placas e mostrar o estoque de montadas por modelo.
- Ter **um único lugar** para lançar venda de placa (Placas › Vendas), já com o status recebido / a receber.
- Os valores de placas a receber entram no "a receber" geral do CRM (Início e Financeiro).
- Sites e Sistemas e Google Meu Negócio ganham um painel no mesmo formato, mostrando primeiro o que falta receber.

## Fora do escopo

- Reformar o visual das abas Materiais, Lotes, Modelos e Avarias. Fica para depois; nesta etapa elas só recebem o necessário para continuar funcionando.
- Parcelamento de venda de placa. Uma venda é recebida de uma vez.
- Desmontar placa (voltar materiais ao estoque solto).

## Anti-objetivos (seria falha mesmo funcionando)

- Continuar havendo dois jeitos de lançar venda de placa.
- O estoque de materiais mudar de valor para quem não usa montagem. Sem montagens registradas, os números de hoje têm que bater exatamente.
- Uma venda em aberto ficar escondida numa aba secundária.
- Um visual diferente do resto do CRM.

## Como fica — Placas NFC

Referência visual: opção **A** escolhida no companion (`.superpowers/brainstorm/1462-1792373281/content/placas-inicio.html`).

### Card no topo de Serviços

O card "Placas NFC" mostra `R$ X a receber · Y montadas`. Se não houver nada a receber, mostra só as montadas. Hoje mostra "N a entregar".

### Abas

`Resumo · Vendas · Montagem · Modelos · Materiais · Lotes · Avarias`. A aba Montagem é nova; as outras já existem.

### Resumo (painel)

1. **Quatro cartões de número** no topo, no mesmo componente/estilo dos números do Início:
   - **A receber**: soma das vendas não recebidas. Destaque de atenção quando > 0.
   - **Montadas prontas**: total de montadas de todos os modelos.
   - **Vendidas no mês**: quantidade de placas vendidas no mês corrente.
   - **Lucro no mês**: lucro real das vendas do mês corrente.
2. **Duas colunas, lado a lado** (empilham em tela estreita):
   - **"Vendidas e ainda não recebidas"**: cliente (ou nome do comprador), modelo × quantidade, há quantos dias foi vendida, valor e o botão **Recebi**. Ordem: mais antiga primeiro. Venda com mais de 7 dias sem receber fica com etiqueta vermelha; até 7 dias, amarela. *(O limite de 7 dias foi decisão minha; ele não contestou.)* Sem pendências, o cartão mostra "Tudo recebido".
   - **"Montadas, prontas para vender"**: uma linha por modelo ativo, com a quantidade montada e "os materiais dão para mais N". N é o máximo que a receita do modelo permite com o estoque solto atual. Botão **+ Montar** no cabeçalho do cartão.
3. Abaixo continuam os cartões que já existem (lucro previsto, lucro real, estoque de materiais, prejuízo com avarias), sem mudança de conteúdo.

### Recebi

- Clicar em **Recebi** marca a venda como recebida com a data de hoje, e ela sai da lista.
- Na aba Vendas, cada venda mostra a etiqueta "Recebido em dd/mm" ou "A receber". Também é possível marcar como recebida por ali e desfazer o recebimento (para corrigir engano).

### Montagem

- **+ Montar** (no Resumo e na aba Montagem) abre um formulário com modelo, quantidade e data (padrão: hoje).
- Montar N placas de um modelo tira do estoque solto os materiais da receita do modelo × N e soma N nas montadas desse modelo.
- Se faltar material, o sistema avisa e deixa salvar, como as vendas já fazem hoje com o estoque negativo.
- A aba **Montagem** lista as montagens lançadas (data, modelo, quantidade) e permite excluir uma montagem lançada por engano. Excluir uma montagem devolve os materiais.
- Modelo sem receita cadastrada não pode ser montado.
- **Cada montagem guarda a receita do momento em que foi feita** *(decisão minha)*. Se a receita do modelo mudar depois, as montagens antigas não mudam, e excluir uma montagem devolve exatamente os materiais que ela tirou. Vendas sem montagem continuam usando a receita atual, como hoje.

### Venda e estoque

- Ao lançar uma venda de N placas de um modelo:
  - sai primeiro das montadas daquele modelo;
  - se houver menos de N montadas, a parte que falta sai direto dos materiais soltos, como hoje.
- O formulário de venda ganha o campo **"Já recebi"** (marcado = recebida na data da venda; desmarcado = a receber). Padrão: desmarcado.
- O custo da venda continua calculado como hoje (custo dos materiais pela receita).

### Um só caminho para vender

- **Placas › Vendas é o único lugar para lançar venda de placa.**
- A aba Placas no perfil do cliente passa a só **listar** as vendas daquele cliente (vindas de Placas › Vendas), com o status recebido / a receber, o "já comprou N placas" e um link para lançar venda em Placas › Vendas com esse cliente já escolhido. O botão "+ Venda de placas" e o fluxo de projeto + parcela por ali saem.
- Hoje não existe nenhum projeto com `servico = 'placas_nfc'` no banco (conferido em 2026-10-18), então não há dados do caminho antigo para migrar.
- **Placas dentro de uma oportunidade do Funil** (linha `projetos_servicos` do tipo `placas_nfc` num projeto de site/sistema): continua como está. Ali o pagamento é cobrado pelas parcelas do próprio projeto. A venda gerada na entrega deve nascer **já marcada como recebida**, para não ser cobrada duas vezes no "a receber". Vale a mesma regra de estoque: sai primeiro das montadas.

### Dados existentes

- As duas vendas atuais (Rango do Bicho e Filintinho) ficam **a receber** depois da mudança.
- Não há montagens hoje: montadas começam em 0 para todos os modelos.

## A receber no resto do CRM

- O "A receber este mês" e as "Parcelas atrasadas" do Início, e o Financeiro, hoje só olham `parcelas`. Eles passam a incluir as vendas de placa não recebidas:
  - "A receber este mês" inclui vendas de placa não recebidas cuja data de venda é do mês corrente.
  - Venda de placa com mais de 7 dias sem receber conta como atrasada, junto com as parcelas atrasadas.
  - O gráfico de recebido por mês do Financeiro soma as vendas de placa recebidas na data em que foram recebidas.
- **Tabela do Financeiro** *(decisão minha)*: as vendas de placa aparecem como linhas junto com as parcelas, respeitando os filtros que já existem (Estado, Mês, Serviço = Placas NFC). Para elas, a data de venda faz o papel de vencimento, o estado é "a receber" até 7 dias e "atrasada" depois, e o link leva para Placas › Vendas, não para um projeto. Marcar como paga ali é o mesmo "Recebi".
- **Gráficos do Início** *(decisão minha)*: "Recebido por mês" e "faturamento por serviço" (fatia Placas NFC) passam a somar as vendas de placa recebidas. Início e Financeiro mostram o mesmo total recebido no mês.
- **Vendas que vieram do Funil** *(decisão minha)*: o dinheiro delas já entra pelas parcelas do projeto. Por isso ficam **fora de todo total de dinheiro recebido ou a receber** (Início, Financeiro, cartão A receber), mas **contam** em "Vendidas no mês" e "Lucro no mês" do Resumo de Placas. Elas se identificam pela ligação que já existe em `projetos_servicos.venda_id`.
- O resumo "para entregar" do Início, que hoje conta "vendas de placas a entregar" a partir dos projetos placas_nfc, passa a mostrar "vendas de placas a receber".

## Outros serviços: Sites e Sistemas e Google Meu Negócio

Mesmo formato do painel de Placas, mas dentro da aba de cada serviço. Fica **acima** da lista que já existe; a lista e os filtros continuam iguais.

- **Cartões de número** (mesmo componente):
  - Sites e Sistemas: A receber (soma das parcelas não pagas dos projetos `site_sistema`), Em andamento, Entregues no mês.
  - Google Meu Negócio: A receber (parcelas não pagas dos projetos `google_meu_negocio`), Pendentes, Configurados no mês.
- **Cartão "A receber"**: parcelas não pagas daquele serviço, com cliente, projeto, descrição da parcela, vencimento (etiqueta vermelha se atrasada, amarela se vence nos próximos 7 dias) e valor. Botão **Recebi** marca a parcela como paga hoje, usando o mesmo endpoint que o Financeiro já usa. Ordem: vencimento mais antigo primeiro. *(Quais números entram em cada serviço foi decisão minha.)*
- O card de cada serviço no topo de Serviços acrescenta "R$ X a receber" quando houver valor.

## O que fica com quem constrói

- Modelagem: como guardar o recebimento (por exemplo `recebido_em` em `placas_vendas`) e a montagem (por exemplo `placas_montagens` com modelo, quantidade e data), e como as vendas registram quantas unidades saíram de montadas e quantas de materiais soltos. Requisito: o cálculo de estoque de materiais e de montadas tem que bater em qualquer ordem de montagens, vendas, exclusões e avarias, e excluir uma venda devolve o estoque para onde ele saiu.
- Avarias: hoje tiram materiais soltos. Se fizer sentido registrar a avaria de uma placa montada, decidir a forma mais simples; não é exigência desta etapa.
- Componentes: reaproveitar o que já existe (componente de número do Início, `.cartao`, `.tabela`, `.etiqueta`, `Modal`, hooks `useCarregar`/`useEnvio`). Sem biblioteca nova.
- Migration nova numerada depois da 017. O pm2 não usa watch: a migration só roda depois de `pm2 restart crm-madia-api`, com backup de `data/crm.db` + `-wal` + `-shm` antes.
- Testes no padrão do projeto (vitest no servidor e no web).
