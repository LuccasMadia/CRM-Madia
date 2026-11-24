# Calendário no CRM ligado ao Apple Calendar (CalDAV) — design

## Intenção
O Lucca quer gerenciar eventos pelo CRM e acompanhar pelo celular abrindo só o app Calendário do iPhone, sem abrir o CRM.
Hoje o CRM só exporta tarefas e parcelas por um link ICS (só de ida, atualização lenta) e não tem tela de calendário.
A conexão passa a ser de ida e volta com o iCloud, e o Apple aparece como conexão no Cérebro.

## Objetivos
- Tela **Calendário** no CRM (mês, semana, lista) onde se cria, edita e apaga eventos.
- Evento criado ou editado no CRM aparece no iPhone em segundos; evento criado no iPhone aparece no CRM (leitura periódica).
- Os prazos de tarefas e vencimentos de parcelas aparecem na mesma tela, somente leitura, com chave para ligar e desligar.
- Evento pode ser ligado a um cliente ou projeto (opcional) e o link leva à página dele.
- Configurações: conectar (Apple ID + senha específica de app), escolher o calendário, desconectar.
- Cérebro: o Apple Agenda aparece como app conectado quando a conexão existe.

## Não objetivos (v1)
- Alarmes, convidados, anexos, vários calendários ao mesmo tempo, Google Calendar.
- Editar eventos recorrentes (aparecem somente leitura).
- Card de próximos eventos no Início (fica para depois).
- Substituir o link ICS atual de tarefas e parcelas: continua como está.

## Anti-objetivos (seria falha mesmo funcionando)
- Apagar ou alterar eventos do iPhone que o CRM não criou sem o Lucca pedir.
- Mostrar a senha de app na tela ou devolvê-la pela API.
- Duplicar eventos a cada sincronização.

## Restrições
- O CRM roda no computador do Lucca (127.0.0.1); só pode fazer chamadas de saída para o iCloud. Nada de endereço público.
- A senha de app não pode ser digitada por mim; o Lucca a cola nas Configurações. Fica guardada em texto na tabela `config`, como o token do Instagram, com aviso na tela.
- Sem dependência nova: poucas dependências no projeto e o CalDAV usa só PROPFIND, REPORT, PUT e DELETE.
- Testes sem rede: o cliente CalDAV recebe `fetch` injetável, como o publicador do Instagram.
- Interface em português, tema escuro atual, layout responsivo (no celular, lista por padrão).

## Abordagens consideradas
1. **Eventos no CRM + link ICS assinado pelo Apple.** Sem senha, mas o celular só mostra, atualiza devagar e depende de endereço público. Descartada pelo Lucca.
2. **CalDAV de ida e volta com o iCloud** (escolhida pelo Lucca). Instantâneo, funciona local, custa uma senha de app.
3. Biblioteca CalDAV pronta (por exemplo `tsdav`). Menos código nosso, mas dependência nova e pouco controle sobre erros do iCloud. Minha escolha é cliente próprio e pequeno.

## Design
**Dados.** Tabela `eventos`: id, titulo, inicio, fim, dia_inteiro, local, notas, cliente_id?, projeto_id?, uid, href, etag, origem (`crm` ou `apple`), recorrente (0/1), pendente (0/1), criado_em, atualizado_em. Chaves em `config`: `apple_usuario`, `apple_senha`, `apple_calendario_href`, `apple_ultima_sync`, `apple_erro`.

**Servidor.** `server/calendario/caldav.js`: descobre a conta (principal → calendar-home → lista de calendários), lê o calendário escolhido (REPORT calendar-query com janela de datas), cria e atualiza com PUT usando `If-Match` pela etag, apaga com DELETE, cria o calendário "CRM Madia" com MKCALENDAR se o Lucca preferir. `server/calendario/ics-evento.js`: converte VEVENT para evento e de volta (horário local America/Sao_Paulo, dia inteiro). `server/calendario/sync.js`: lê a cada 5 minutos, ao abrir a tela e pelo botão Atualizar; grava imediatamente ao criar, editar ou apagar. Rotas: `/api/calendario` (config e estado, sem a senha), `/api/calendario/calendarios`, `/api/eventos` (CRUD e janela por data), `/api/calendario/sincronizar`.

**Sincronização.** O UID do evento é a identidade: o CRM nunca recria um evento com UID já conhecido. Conflito (412 na etag): vale a versão do iCloud e o Lucca é avisado. Falha de rede ao gravar: o evento fica `pendente` com selo na tela e é reenviado na próxima sincronização. O CRM só altera ou apaga eventos que ele criou ou que o Lucca editou nele; eventos do iPhone são lidos e podem ser editados pela tela (editar é pedido explícito).

**Recorrentes.** Eventos com RRULE vêm marcados `recorrente`, são expandidos na janela para FREQ simples (diário, semanal, mensal, anual) e ficam somente leitura. Regras mais complexas mostram só a primeira ocorrência com selo.

**Interface.** Rota `/calendario`, item na sidebar. Mês, Semana e Lista; clique no dia ou no botão **+ Evento** abre o formulário (título, dia, horário ou dia inteiro, local, notas, cliente/projeto). Tarefas e parcelas aparecem com cor e ícone próprios e link; chave "Mostrar prazos e parcelas". Sem conexão, a tela mostra os mesmos prazos e um chamado para conectar. Configurações ganha um cartão "Apple Calendário" ao lado do atual. No celular, abre em Lista e o formulário vira folha de baixo.

## Deixado ao construtor
Estrutura de componentes e CSS da grade; detalhes do XML do CalDAV; textos curtos de erro (credencial inválida, sem rede, calendário removido).

## Calls minhas (conferir)
- Cliente CalDAV próprio sem dependência nova.
- Sincronização a cada 5 minutos mais gravação imediata.
- Recorrentes somente leitura.
- O Lucca escolhe o calendário depois de conectar, com a opção de o CRM criar "CRM Madia".
- Prazos e parcelas somente leitura na mesma tela, com chave.
- O link ICS atual continua.
