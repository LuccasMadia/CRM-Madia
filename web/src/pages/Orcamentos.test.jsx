import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Orcamentos } from './Orcamentos.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const totais = (unico, mensal = 0) => ({
  servicos_combo: 1, subtotal_unico_centavos: unico, desconto_centavos: 0, total_unico_centavos: unico,
  mensalidades: mensal ? [{ nome: 'Hospedagem', valor_centavos: mensal }] : [], total_mensal_centavos: mensal,
});
const orc = (o) => ({
  cliente_id: 1, cliente_nome: 'Filinto', data: '2026-10-01', validade_dias: 15, situacao: 'rascunho', totais: totais(100000),
  gerou: false, vence_em: '2026-10-16', dias_para_vencer: 10, sem_resposta: false, vencendo: false, parado: false, ...o,
});

const lista = [
  orc({ id: 5, numero: 5, situacao: 'enviado', cliente_nome: 'Popy', cliente_id: 2, totais: totais(164700, 15000), vence_em: '2026-10-23', dias_para_vencer: 2, vencendo: true, sem_resposta: true }),
  orc({ id: 4, numero: 4, situacao: 'enviado', sem_resposta: true, dias_para_vencer: 6 }),
  orc({ id: 3, numero: 3, situacao: 'enviado', sem_resposta: true, dias_para_vencer: 5 }),
  orc({ id: 2, numero: 2, situacao: 'rascunho', parado: true, dias_para_vencer: -3, vence_em: '2026-10-18' }),
  orc({ id: 1, numero: 1, situacao: 'aceito', gerou: true }),
];

const abrir = (rota = '/orcamentos') => renderizar(<Orcamentos />, { rota, padrao: '/orcamentos' });
const linhas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

afterEach(() => vi.unstubAllGlobals());

describe('Orcamentos', () => {
  it('lista todos os orçamentos com cliente, situação, valor e validade', async () => {
    mockApi({ 'GET /orcamentos': lista });
    abrir();
    await screen.findByRole('table');
    expect(linhas()).toHaveLength(5);
    const primeira = linhas()[0];
    expect(within(primeira).getByRole('link', { name: 'nº 005' })).toHaveAttribute('href', '/orcamentos/5');
    expect(within(primeira).getByRole('link', { name: 'Popy' })).toHaveAttribute('href', '/clientes/2?aba=orcamentos');
    expect(primeira).toHaveTextContent('01/10/2026');
    expect(within(primeira).getByText('Enviado')).toHaveClass('etiqueta--enviado');
    expect(primeira).toHaveTextContent(/R\$\s1\.647,00 \+ R\$\s150,00\/mês/);
    expect(primeira).toHaveTextContent(/23\/10\/2026\s*vence em 2 dias/);
    expect(linhas()[3]).toHaveTextContent('vencido há 3 dias');
    // aceito não mostra prazo
    expect(linhas()[4]).not.toHaveTextContent(/vence/);
  });

  it('exclui um orçamento direto da lista, depois de confirmar', async () => {
    let atual = lista;
    const api = mockApi({ 'GET /orcamentos': () => atual, 'DELETE /orcamentos/1': resposta(204) });
    const usuario = userEvent.setup();
    abrir();
    await screen.findByRole('table');
    await usuario.click(screen.getByRole('button', { name: 'Excluir orçamento nº 001' }));
    const dialogo = screen.getByRole('dialog', { name: 'Excluir o orçamento nº 001?' });
    // o nº 001 gerou projetos: avisa que eles continuam
    expect(dialogo).toHaveTextContent('continua existindo');
    atual = lista.filter((o) => o.id !== 1);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
    expect(api.chamadas).toContainEqual(expect.objectContaining({ metodo: 'DELETE', caminho: '/orcamentos/1' }));
    await vi.waitFor(() => expect(linhas()).toHaveLength(4));
  });

  it('a faixa Pede atenção leva ao orçamento (um só) ou filtra a lista (vários)', async () => {
    mockApi({ 'GET /orcamentos': lista });
    abrir();
    const faixa = await screen.findByRole('region', { name: 'Pede atenção' });
    // o vencendo não se repete em "sem resposta"
    expect(within(faixa).getByRole('link', { name: 'Nº 005 Popy: vence em 2 dias' })).toHaveAttribute('href', '/orcamentos/5');
    expect(within(faixa).getByRole('link', { name: '2 enviados há mais de 7 dias, sem resposta' }))
      .toHaveAttribute('href', '/orcamentos?aba=orcamentos&atencao=sem_resposta');
    expect(within(faixa).getByRole('link', { name: 'Nº 002 Filinto: rascunho parado há mais de 7 dias' })).toHaveAttribute('href', '/orcamentos/2');
  });

  it('filtro de atenção pela URL e volta para todos', async () => {
    mockApi({ 'GET /orcamentos': lista });
    abrir('/orcamentos?aba=orcamentos&atencao=sem_resposta');
    await screen.findByRole('table');
    expect(linhas().map((l) => within(l).getAllByRole('link')[0].textContent)).toEqual(['nº 004', 'nº 003']);
    expect(screen.getByText('Mostrando só os enviados há mais de 7 dias, sem resposta')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mostrar todos' }));
    expect(linhas()).toHaveLength(5);
  });

  it('pílulas de situação filtram e mostram quantos há', async () => {
    mockApi({ 'GET /orcamentos': lista });
    abrir();
    await screen.findByRole('table');
    const grupo = screen.getByRole('group', { name: 'Situação' });
    expect(within(grupo).getByRole('button', { name: 'Enviado 3' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(within(grupo).getByRole('button', { name: 'Aceito 1' }));
    expect(within(grupo).getByRole('button', { name: 'Aceito 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0]).toHaveTextContent('nº 001');
  });

  it('sem nada pendente mostra a faixa tranquila', async () => {
    mockApi({ 'GET /orcamentos': [orc({ id: 1, numero: 1 })] });
    abrir();
    expect(await screen.findByText('Nada pendente por aqui')).toBeInTheDocument();
  });

  it('+ Orçamento pede o cliente, cria e abre o orçamento', async () => {
    const { chamadas } = mockApi({
      'GET /orcamentos': [],
      'GET /clientes': [{ id: 1, nome: 'Filinto' }, { id: 2, nome: 'Popy' }],
      'POST /clientes/2/orcamentos': { id: 9 },
    });
    abrir();
    const user = userEvent.setup();
    expect(await screen.findByText('Nenhum orçamento ainda.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Orçamento' }));
    const dialogo = screen.getByRole('dialog', { name: 'Novo orçamento' });
    await user.click(within(dialogo).getByRole('button', { name: 'Criar orçamento' }));
    expect(within(dialogo).getByText('Escolha o cliente')).toBeInTheDocument();
    await user.selectOptions(await within(dialogo).findByRole('combobox', { name: 'Cliente' }), 'Popy');
    await user.click(within(dialogo).getByRole('button', { name: 'Criar orçamento' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/clientes/2/orcamentos')).toBe(true);
  });

  it('a aba Tabela de preços mostra a tabela', async () => {
    mockApi({
      'GET /orcamentos': [],
      'GET /tabela-precos': { servicos: [], pacotes: [], desconto_combo_pct: 10, contato_whatsapp: null },
    });
    abrir();
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Tabela de preços' }));
    expect(screen.getByRole('tab', { name: 'Tabela de preços' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
  });
});
