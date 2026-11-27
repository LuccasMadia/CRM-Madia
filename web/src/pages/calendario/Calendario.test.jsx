import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calendario } from './Calendario.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

afterEach(() => vi.unstubAllGlobals());

const MES = 'GET /eventos?de=2026-09-27&ate=2026-10-31';
const CONECTADO = { conectado: true, usuario: 'eu@icloud.com', calendario: { href: 'https://x/c/', nome: 'Trabalho' }, ultima_sync: '2026-10-15T10:00:00.000Z', erro: null };
const DESCONECTADO = { conectado: false, usuario: null, calendario: null, ultima_sync: null, erro: null };
const EVENTO = { id: 5, titulo: 'Reunião', inicio: '2026-10-15T14:00', fim: '2026-10-15T15:00', dia_inteiro: 0, local: 'Sala 2', notas: null, cliente_id: null, projeto_id: null, recorrente: 0, pendente: 0, origem: 'crm' };
const TAREFA = { id: 1, texto: 'Enviar proposta', prazo: '2026-10-16', concluida: 0, etapa: 'a_fazer' };
const PARCELA = { id: 1, tipo: 'parcela', vencimento: '2026-10-20', valor_centavos: 150000, estado: 'pendente', cliente_nome: 'Ana', projeto_id: 10 };
const SYNC_OK = { lidos: 0, enviados: 0, conflitos: 0 };

const base = (extra = {}) => ({
  'GET /calendario': CONECTADO,
  'POST /calendario/sincronizar': SYNC_OK,
  [MES]: [EVENTO],
  'GET /tarefas': [TAREFA, { ...TAREFA, id: 2, texto: 'Já feita', concluida: 1, etapa: 'concluido' }],
  'GET /parcelas': [PARCELA, { ...PARCELA, id: 2, vencimento: '2026-10-21', estado: 'paga', cliente_nome: 'Bia' }],
  'GET /clientes': [{ id: 1, nome: 'Ana' }],
  'GET /projetos': [],
  ...extra,
});
const abrir = (rota = '/calendario') => renderizar(<Calendario hoje="2026-10-15" />, { rota, padrao: '/calendario' });

describe('Calendário', () => {
  it('mostra o mês com eventos, tarefas com prazo e parcelas em aberto, cada um com seu link', async () => {
    mockApi(base());
    abrir();
    expect(await screen.findByRole('button', { name: /Reunião/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Enviar proposta/ })).toHaveAttribute('href', '/tarefas');
    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/projetos/10');
    expect(screen.queryByText(/Já feita/)).toBeNull();
    expect(screen.queryByText(/Bia/)).toBeNull();
  });

  it('a chave "Mostrar prazos e parcelas" liga e desliga só os prazos', async () => {
    mockApi(base());
    abrir();
    await screen.findByRole('button', { name: /Reunião/ });
    await userEvent.setup().click(screen.getByLabelText('Mostrar prazos e parcelas'));
    expect(screen.queryByRole('link', { name: /Enviar proposta/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Reunião/ })).toBeInTheDocument();
  });

  it('sincroniza ao abrir quando há conexão e mostra o resultado', async () => {
    const { chamadas } = mockApi(base());
    abrir();
    await screen.findByRole('button', { name: /Reunião/ });
    expect(chamadas.filter((c) => c.metodo === 'POST' && c.caminho === '/calendario/sincronizar')).toHaveLength(1);
  });

  it('Atualizar sincroniza de novo e recarrega os eventos', async () => {
    const { chamadas } = mockApi(base());
    abrir();
    await screen.findByRole('button', { name: /Reunião/ });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Atualizar' }));
    await vi.waitFor(() => expect(chamadas.filter((c) => c.metodo === 'POST' && c.caminho === '/calendario/sincronizar')).toHaveLength(2));
    await vi.waitFor(() => expect(chamadas.filter((c) => c.caminho === MES.replace('GET ', ''))).toHaveLength(3));
  });

  it('erro de sincronização mostra o aviso e mantém a grade', async () => {
    mockApi(base({ 'POST /calendario/sincronizar': resposta(502, { erro: 'Não foi possível falar com o iCloud. Verifique a internet.' }) }));
    abrir();
    expect(await screen.findByText('Não foi possível falar com o iCloud. Verifique a internet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reunião/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Enviar proposta/ })).toBeInTheDocument();
  });

  it('sem conexão mostra os prazos e o chamado para conectar, sem sincronizar', async () => {
    const { chamadas } = mockApi(base({ 'GET /calendario': DESCONECTADO }));
    abrir();
    expect(await screen.findByRole('link', { name: 'Conectar o Apple Calendário' })).toHaveAttribute('href', '/configuracoes');
    expect(await screen.findByRole('link', { name: /Enviar proposta/ })).toBeInTheDocument();
    expect(chamadas.some((c) => c.caminho === '/calendario/sincronizar')).toBe(false);
  });

  it('+ Evento cria um evento no dia de hoje', async () => {
    const { chamadas } = mockApi(base({ 'POST /eventos': { ...EVENTO, id: 9, titulo: 'Novo' } }));
    abrir();
    await screen.findByRole('button', { name: /Reunião/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Evento' }));
    const janela = await screen.findByRole('dialog', { name: 'Novo evento' });
    expect(within(janela).getByLabelText('Início')).toHaveValue('2026-10-15T09:00');
    await user.type(within(janela).getByLabelText('Título'), 'Novo');
    await user.click(within(janela).getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/eventos').corpo).toMatchObject({ titulo: 'Novo' });
  });

  it('clicar no número de um dia abre o evento novo nesse dia', async () => {
    mockApi(base());
    abrir();
    await screen.findByRole('button', { name: /Reunião/ });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Novo evento em 17/10/2026' }));
    const janela = await screen.findByRole('dialog', { name: 'Novo evento' });
    expect(within(janela).getByLabelText('Início')).toHaveValue('2026-10-17T09:00');
  });

  it('clicar num evento abre a edição; recorrente abre somente leitura', async () => {
    mockApi(base({ [MES]: [EVENTO, { ...EVENTO, id: 6, titulo: 'Semanal', inicio: '2026-10-14T10:00', fim: '2026-10-14T11:00', recorrente: 1 }] }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Reunião/ }));
    const janela = await screen.findByRole('dialog', { name: 'Editar evento' });
    expect(within(janela).getByLabelText('Título')).toHaveValue('Reunião');
    await user.click(within(janela).getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getByRole('button', { name: /Semanal/ }));
    const leitura = await screen.findByRole('dialog', { name: 'Evento' });
    expect(within(leitura).getByText(/somente leitura/i)).toBeInTheDocument();
    expect(within(leitura).queryByRole('button', { name: 'Salvar' })).toBeNull();
  });

  it('Semana pede só os 7 dias; Hoje volta para a data de hoje', async () => {
    const { chamadas } = mockApi(base({ 'GET /eventos?de=2026-10-11&ate=2026-10-17': [EVENTO] }));
    abrir();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /Reunião/ });
    await user.click(screen.getByRole('tab', { name: 'Semana' }));
    await vi.waitFor(() => expect(chamadas.some((c) => c.caminho === '/eventos?de=2026-10-11&ate=2026-10-17')).toBe(true));
    expect(await screen.findByRole('button', { name: /Reunião/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Semana seguinte' }));
    await vi.waitFor(() => expect(chamadas.some((c) => c.caminho === '/eventos?de=2026-10-18&ate=2026-10-24')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    await vi.waitFor(() => expect(chamadas.filter((c) => c.caminho === '/eventos?de=2026-10-11&ate=2026-10-17').length).toBeGreaterThanOrEqual(2));
  });

  it('Lista agrupa por dia, mostra o selo Pendente e o local', async () => {
    mockApi(base({ 'GET /eventos?de=2026-10-01&ate=2026-10-31': [{ ...EVENTO, pendente: 1 }] }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Lista' }));
    expect(await screen.findByText(/15\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Sala 2')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Enviar proposta/ })).toBeInTheDocument();
  });

  it('no celular abre em Lista', async () => {
    vi.stubGlobal('matchMedia', (consulta) => ({ matches: true, media: consulta, addEventListener() {}, removeEventListener() {} }));
    mockApi(base({ 'GET /eventos?de=2026-10-01&ate=2026-10-31': [EVENTO] }));
    abrir();
    expect(await screen.findByRole('tab', { name: 'Lista', selected: true })).toBeInTheDocument();
  });

  it('mostra o erro da última sincronização que ficou guardado', async () => {
    mockApi(base({ 'GET /calendario': { ...CONECTADO, erro: 'Apple ID ou senha de app inválidos.' } }));
    abrir();
    expect(await screen.findByText(/Apple ID ou senha de app inválidos\./)).toBeInTheDocument();
  });
});
