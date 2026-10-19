import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvisosSites } from './AvisosSites.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const VAZIO = { fora_do_ar: [], cobrancas: [] };
const FORA = { projeto_id: 7, titulo: 'Site Rango', cliente_nome: 'Rango', url: 'https://rango.com.br', desde: '2026-10-19T17:32:00.000Z', motivo: 'Erro 503' };
const COBRANCA = { projeto_id: 7, titulo: 'Site Rango', cliente_nome: 'Rango', fase: 'atrasada', atrasada_desde: '2026-10-10', valor_centavos: 15000, avisado_em: null, prazo_ate: null };

describe('AvisosSites', () => {
  it('nada a avisar não renderiza nada', async () => {
    const { chamadas } = mockApi({ 'GET /hospedagem/avisos': VAZIO, 'GET /vercel/estado': { conectado: true, prazo_dias: 7 } });
    const { container } = renderizar(<AvisosSites />);
    await waitFor(() => expect(chamadas).toHaveLength(2));
    expect(container).toBeEmptyDOMElement();
  });

  it('site fora do ar mostra desde, motivo e link para o projeto', async () => {
    mockApi({ 'GET /hospedagem/avisos': { ...VAZIO, fora_do_ar: [FORA] }, 'GET /vercel/estado': { conectado: true, prazo_dias: 7 } });
    renderizar(<AvisosSites />);
    expect(await screen.findByText(/Site Rango — fora do ar desde/)).toBeInTheDocument();
    expect(screen.getByText(/\(Erro 503\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/projetos/7');
  });

  it('atrasada mostra o valor e Avisei o cliente, que recarrega', async () => {
    let cob = COBRANCA;
    const { chamadas } = mockApi({
      'GET /hospedagem/avisos': () => ({ ...VAZIO, cobrancas: [cob] }),
      'GET /vercel/estado': { conectado: true, prazo_dias: 7 },
      'POST /projetos/7/hospedagem/avisei': () => {
        cob = { ...COBRANCA, fase: 'avisado', avisado_em: '2026-10-19', prazo_ate: '2026-10-26' };
        return {};
      },
    });
    renderizar(<AvisosSites />);
    expect(await screen.findByText(/Mensalidade de .*150,00 atrasada desde 10\/10\/2026/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Avisei o cliente' }));
    expect(await screen.findByText(/Cliente avisado em 19\/10\/2026 — prazo até 26\/10\/2026/)).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/projetos/7/hospedagem/avisei')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Avisei o cliente' })).toBeNull();
  });

  it('prazo vencido: Tirar do ar pede confirmação e pausa', async () => {
    let cob = { ...COBRANCA, fase: 'prazo_vencido', avisado_em: '2026-10-10', prazo_ate: '2026-10-17' };
    const { chamadas } = mockApi({
      'GET /hospedagem/avisos': () => ({ ...VAZIO, cobrancas: [cob] }),
      'GET /vercel/estado': { conectado: true, prazo_dias: 10 },
      'POST /projetos/7/hospedagem/pausar': () => {
        cob = { ...COBRANCA, fase: 'pausado_atrasado' };
        return {};
      },
    });
    renderizar(<AvisosSites />);
    expect(await screen.findByText('Prazo de 10 dias venceu — tirar do ar?')).toBeInTheDocument();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: 'Tirar do ar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Tirar Site Rango do ar?' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Tirar do ar' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/projetos/7/hospedagem/pausar')).toBe(true));
    expect(await screen.findByText(/O site já está fora do ar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tirar do ar' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/projetos/7');
  });

  it('pago e pausado: Colocar no ar com confirmação', async () => {
    let cob = { ...COBRANCA, fase: 'pago_pausado', valor_centavos: 0, atrasada_desde: null };
    const { chamadas } = mockApi({
      'GET /hospedagem/avisos': () => ({ ...VAZIO, cobrancas: cob ? [cob] : [] }),
      'GET /vercel/estado': { conectado: true, prazo_dias: 7 },
      'POST /projetos/7/hospedagem/religar': () => {
        cob = null;
        return {};
      },
    });
    const { container } = renderizar(<AvisosSites />);
    expect(await screen.findByText('Pago — colocar no ar?')).toBeInTheDocument();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: 'Colocar no ar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Colocar Site Rango no ar?' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Colocar no ar' }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/projetos/7/hospedagem/religar')).toBe(true));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('pausado_atrasado ignora prazo_ate e só tem texto e Abrir', async () => {
    mockApi({
      'GET /hospedagem/avisos': { ...VAZIO, cobrancas: [{ ...COBRANCA, fase: 'pausado_atrasado', avisado_em: '2026-10-10', prazo_ate: '2026-10-17' }] },
      'GET /vercel/estado': { conectado: true, prazo_dias: 7 },
    });
    renderizar(<AvisosSites />);
    expect(await screen.findByText(/O site já está fora do ar/)).toBeInTheDocument();
    expect(screen.queryByText(/prazo até/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
