# Tabela de preços e orçamentos em PDF — design

Status: desenho para aprovação do Lucca. Conversa em 2026-10-20 e 2026-10-21. O rascunho da conversa está em `2026-10-20-tabela-precos-rascunho.md`.

## Por que

Quando um cliente pergunta preço, o Lucca responde um valor "da cabeça". Ele quer:

1. Ter uma base de preço para cada serviço.
2. Mostrar ao cliente que o preço tem critério.

Ele fala de preço **ao vivo**, com o cliente na frente, e depois manda o orçamento pelo WhatsApp. Hoje faz isso com imagens. A partir de agora vai mandar um **PDF**, que ele acha mais profissional.

## Objetivos

- Uma **tabela de preços interna** no CRM, com valores "a partir de" por serviço e pacotes prontos. O Lucca edita quando quiser.
- Um **orçamento** montado no perfil do cliente. O Lucca marca serviços da tabela e ajusta o valor de cada item. O desconto de combo é aplicado sozinho. O total aparece separado em "paga uma vez" e "por mês".
- Um **PDF** do orçamento, com a marca dele, para mandar no WhatsApp.

## Não-objetivos (fora desta fase)

- **Página pública de orçamento ou de preços.** A tabela é interna, por escolha do Lucca: o "a partir de" público vira o preço, e ele vende conversando.
- **Converter orçamento aceito em projeto ou venda.** Quando o cliente aceita, o Lucca lança os serviços no CRM à mão, como já faz hoje.
- **Cálculo por valor da hora.** Fica para uma fase futura.
- **Link para o cliente mexer nos opcionais.**
- **Preço da placa NFC no site.** É um projeto separado, no repositório do portfólio, e terá outra conversa.

## Anti-objetivos (seria um fracasso mesmo funcionando)

- O orçamento não pode parecer planilha. O cliente que lê o PDF precisa entender **o que recebe** em cada item, não só ver números.
- Montar um orçamento ao vivo não pode exigir mais que alguns cliques. Se for lento, o Lucca volta a falar o valor de cabeça.
- A tabela não pode duplicar preços que já existem no CRM. Modelo e pack de placa já têm preço cadastrado, e o GMN já tem preço padrão em Configurações. Os dois lugares não podem divergir.

## Tabela base (validada pelo Lucca em 2026-10-21)

Valores iniciais. Todos são "a partir de" e editáveis.

| Serviço | Paga uma vez | Por mês | Frase para o cliente (sugestão; o Lucca edita) |
|---|---|---|---|
| Landing page | R$ 600 | — | Uma página com apresentação, serviços e botão de WhatsApp |
| Cardápio / catálogo digital | R$ 900 | — | Produtos com foto e preço por categoria, pedido pelo WhatsApp |
| Site institucional (até 5 páginas) | R$ 1.200 | — | Início, sobre, serviços, galeria e contato |
| Sistema de agendamento | R$ 1.500 | mensalidade (valor a definir no orçamento) | Cliente escolhe dia e horário; você vê a agenda num painel |
| Loja online | R$ 2.000 | — | Carrinho, pagamento online e controle de pedidos |
| Configuração do Google Meu Negócio | R$ 250 | — | Perfil completo no Google Maps, com fotos, horários e categorias |
| Gestão do Google Meu Negócio | — | R$ 150 | Posts e respostas a avaliações todo mês |
| Placa NFC | preço do modelo (R$ 80) | — | Encosta o celular e abre a avaliação no Google |
| Hospedagem e suporte | — | R$ 150 (faixa R$ 100–150) | Site no ar, pequenos ajustes e suporte |

- **Placas NFC:** o preço vem dos **modelos e packs já cadastrados em Placas**. Escolher um modelo e a quantidade aplica o preço do pack quando existir um pack para aquela quantidade. A tabela não guarda preço de placa próprio.
- **Configuração do GMN:** usa o **preço padrão que já existe em Configurações** (`preco_servico_google_meu_negocio_centavos`). Hoje ele pode estar diferente de R$ 250. O builder confere o valor real e não cria um segundo campo.

## Pacotes prontos

- **Pacote comum (o mais usado):** placa NFC + configuração do GMN. A **gestão do GMN entra como opcional**, não como obrigatória, porque o Lucca estima que só 1 ou 2 clientes (Filinto, House) têm porte para pagar todo mês. Pela tabela: R$ 80 + R$ 250 = R$ 330 → cerca de R$ 300 com o desconto de combo.
- Pacote é só um atalho: aplicá-lo no orçamento adiciona os itens dele. Depois, tudo é editável como qualquer item.
- O Lucca pode criar, editar e apagar pacotes. O nome do pacote (por exemplo "Presença Local") pode aparecer no PDF como título do grupo. **Decisão do Claude:** se isso complicar, o PDF lista os itens normalmente.

## Mensalidades (decidido pelo Lucca em 2026-10-21)

- Cada mensalidade é cobrada separada. Um cliente com site e GMN paga duas.
- **Mensalidade obrigatória:** cardápio/catálogo (inclusive o B2B), sistema de agendamento e loja online. Ao adicionar um desses serviços, o orçamento já inclui a hospedagem e suporte.
- **Mensalidade opcional:** landing page e site institucional. Ao adicionar um desses, a hospedagem aparece como **sugestão** e o Lucca decide se coloca. Sem mensalidade, o cliente paga só o domínio e os ajustes são cobrados por vez.
- A tabela guarda, para cada serviço, se a mensalidade é obrigatória, opcional ou se não existe.
- Orientação de entrega, sem efeito no CRM: o site **sem** mensalidade vai para o Cloudflare Pages, na conta do cliente, com o Lucca como Administrator, e o domínio fica no nome do cliente. O site **com** mensalidade fica na Vercel do Lucca.

## Regra do desconto de combo

- Quando o orçamento tem **2 ou mais serviços diferentes pagos uma vez**, entra sozinho um desconto de **10% sobre a parte paga uma vez**. Mensalidades (hospedagem, gestão do GMN) **não contam** para o gatilho e não têm desconto. Várias placas contam como um serviço só. Item livre com valor pago uma vez conta como um serviço.
- Ele aparece como linha própria ("Desconto combo (10%)"). O Lucca pode **tirar o desconto** ou **mudar o percentual** naquele orçamento.
- O percentual padrão fica editável junto da tabela.
- Decisões do Claude, para ajustar com o uso: 10%, só sobre a parte paga uma vez, e "2 ou mais serviços" como gatilho.

## Orçamento no CRM

- Fica **no perfil do cliente**: uma aba ou seção "Orçamentos" com a lista e o botão "Novo orçamento". Para alguém que ainda não é cliente, o Lucca cadastra só o nome, pelo fluxo de cliente que já existe.
- **Ao montar:**
  - adicionar um serviço da tabela ou aplicar um pacote;
  - para placa, escolher o modelo e a quantidade;
  - cada item mostra o valor "a partir de" já preenchido, editável, e a frase para o cliente, também editável naquele orçamento;
  - dá para adicionar um **item livre**, com nome, frase e valor digitados, para algo fora da tabela;
  - o total é recalculado na hora e aparece separado: **total pago uma vez** e **total por mês**.
- **Campos do orçamento:**
  - número sequencial (nº 001, 002…);
  - data;
  - validade (padrão 15 dias, igual às propostas do Lucca);
  - forma de pagamento e prazo (texto livre, padrão "a combinar");
  - observação opcional.
- **Os orçamentos ficam salvos** e o Lucca pode reabrir, editar, duplicar e apagar. Os itens guardam o valor da hora em que foram colocados. Mudar a tabela depois **não altera** orçamentos já feitos.
- **Situação do orçamento** (decisão do Claude): rascunho / enviado / aceito / recusado, marcada à mão. Serve só para o Lucca lembrar e não cria nada automaticamente.
- **Mostrar ao vivo:** a tela do orçamento precisa ficar legível no celular e no PC, porque o Lucca pode virar a tela para o cliente.
- **Ocultar valores:** a tela do orçamento respeita o modo "ocultar valores" do CRM (olho no menu / Ctrl+Shift+H), usando `formatarDinheiro`. O **PDF sempre sai com os valores reais**.

## Tabela de preços (tela)

- Fica em **Configurações › Tabela de preços**: lista de serviços com nome, frase para o cliente, valor pago uma vez e valor mensal, além dos pacotes e do percentual do desconto de combo.
- Dá para criar, editar, reordenar e desativar serviços. Desativado some do "Novo orçamento", mas continua nos orçamentos antigos.
- A tabela começa preenchida com os valores acima.

## PDF

Validado pelo Lucca no esboço (`.superpowers/brainstorm/.../pdf-orcamento.html`):

- **Fundo branco**, com o turquesa do site (#2dd4bf) na linha do topo e nos destaques. Precisa ficar bom impresso e no celular.
- **Topo:** "Madia Consultoria", "por Luccas Madia · luccasmadia.com.br", número, data e validade.
- **"Para":** nome do cliente.
- **Itens:** nome, quantidade (quando houver), frase para o cliente em cinza e valor à direita. O desconto do combo vem em linha própria, em turquesa.
- **Caixa de total:** total pago uma vez (em destaque) e cada mensalidade com o seu nome.
- **Rodapé:** forma de pagamento, prazo, WhatsApp e @madia.consultoria.
- Um botão no orçamento gera e baixa o PDF. O nome do arquivo segue o formato `Orcamento-007-Filinto-Sorvetes.pdf`.
- O WhatsApp do rodapé vem de um campo novo em Configurações, porque o CRM ainda não tem esse dado.

## Restrições

- Stack atual: Express + SQLite (`node:sqlite`) + React/Vite, migrations numeradas em `server/db/migrations` (a próxima é a **027**), dinheiro em centavos e testes com Vitest.
- O pm2 não tem watch: a mudança só vale depois do build, da migration e de `pm2 restart crm-madia-api`, com backup do banco antes da migration.
- O CRM também é acessado por `crm.luccasmadia.com.br`, atrás do Cloudflare Access. Nada desta feature pode ir para `/publico/*`.
- Outras sessões trabalham no main ao mesmo tempo, então os commits nomeiam os arquivos.

## Decisões menores (do Claude, depois da revisão)

- Placa numa quantidade sem pack cadastrado: preço do modelo × quantidade.
- Número do orçamento: sequência única para todos os orçamentos, nunca reaproveitada (apagar o 007 não libera o 007).
- Mensalidade do agendamento: vazia na tabela e preenchida no orçamento.
- Preço da configuração do GMN: editado na chave de config que já existe. Na tela da tabela, esse campo lê e grava `preco_servico_google_meu_negocio_centavos`.

## Fica a critério do builder

- Como gerar o PDF (biblioteca no servidor, impressão do navegador etc.). O requisito é o resultado igual ao esboço e um arquivo baixável.
- Modelagem das tabelas, rotas e componentes, seguindo os padrões do projeto.
- Se "Orçamentos" vira uma aba nova no perfil do cliente ou uma seção dentro de uma aba existente.
- Como reordenar serviços na tabela. O projeto já tem `CadastroLista` com `ordenavel`.
