import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Ferramentas } from './Ferramentas.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';

const mes = hojeISO().slice(0, 7);
const claude = { id: 1, nome: 'Claude', cobranca: 'mensalidade', valor_centavos: 11000, dia_cobranca: 5, cancelada_em: null, observacao: null, gasto_mes_centavos: 11000, ultima_recarga: null };
const openai = { id: 2, nome: 'API OpenAI', cobranca: 'creditos', valor_centavos: null, dia_cobranca: null, cancelada_em: null, observacao: null, gasto_mes_centavos: 5000, ultima_recarga: '2026-10-15' };
const lista = { mes, ferramentas: [openai, claude], total_mes_centavos: 16000 };

describe('Ferramentas', () => {
  it('mostra o total do mês e cada ferramenta com o tipo de cobrança', async () => {
    mockApi({ [`GET /ferramentas?mes=${mes}`]: lista });
    renderizar(<Ferramentas />);
    expect(await screen.findByText(/160,00/)).toBeInTheDocument();
    const linhaClaude = screen.getByRole('row', { name: /Claude/ });
    expect(within(linhaClaude).getByText('Mensalidade · dia 5')).toBeInTheDocument();
    expect(within(linhaClaude).getAllByText(/110,00/)).toHaveLength(2);
    const linhaOpenai = screen.getByRole('row', { name: /API OpenAI/ });
    expect(within(linhaOpenai).getByText('Créditos')).toBeInTheDocument();
    expect(within(linhaOpenai).getByText('Última recarga 15/10/2026')).toBeInTheDocument();
    expect(within(linhaClaude).queryByRole('button', { name: /Recargas/ })).not.toBeInTheDocument();
  });

  it('cadastra ferramenta de créditos sem pedir valor fixo', async () => {
    const { chamadas } = mockApi({
      [`GET /ferramentas?mes=${mes}`]: lista,
      'POST /ferramentas': (corpo) => resposta(201, { id: 3, ...corpo }),
    });
    renderizar(<Ferramentas />);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: '+ Ferramenta' }));
    await usuario.type(screen.getByLabelText('Nome'), 'Gemini');
    await usuario.selectOptions(screen.getByLabelText('Como paga'), 'creditos');
    expect(screen.queryByLabelText('Valor por mês (R$)')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ nome: 'Gemini', cobranca: 'creditos', observacao: '' });
  });

  it('edita a mensalidade convertendo o valor para centavos', async () => {
    const { chamadas } = mockApi({
      [`GET /ferramentas?mes=${mes}`]: lista,
      'PUT /ferramentas/1': (corpo) => ({ ...claude, ...corpo }),
    });
    renderizar(<Ferramentas />);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Editar Claude' }));
    const valor = screen.getByLabelText('Valor por mês (R$)');
    expect(valor).toHaveValue('110,00');
    await usuario.clear(valor);
    await usuario.type(valor, '120,50');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ cobranca: 'mensalidade', valor_centavos: 12050, dia_cobranca: 5 });
  });

  it('registra e exclui recargas de uma ferramenta de créditos', async () => {
    const recarga = { id: 9, ferramenta_id: 2, data: '2026-10-15', valor_centavos: 5000 };
    const { chamadas } = mockApi({
      [`GET /ferramentas?mes=${mes}`]: lista,
      'GET /ferramentas/2/recargas': [recarga],
      'POST /ferramentas/2/recargas': (corpo) => resposta(201, { id: 10, ferramenta_id: 2, ...corpo }),
      'DELETE /ferramentas/recargas/9': resposta(204),
    });
    renderizar(<Ferramentas />);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Recargas de API OpenAI' }));
    const dialogo = screen.getByRole('dialog', { name: 'Recargas — API OpenAI' });
    expect(await within(dialogo).findByText('15/10/2026')).toBeInTheDocument();
    await usuario.type(within(dialogo).getByLabelText('Valor (R$)'), '20');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar recarga' }));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ data: hojeISO(), valor_centavos: 2000 });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Excluir recarga de 15/10/2026' }));
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/ferramentas/recargas/9')).toBe(true);
  });

  it('cancela a assinatura depois de confirmar e reativa uma cancelada', async () => {
    const midjourney = { ...claude, id: 3, nome: 'Midjourney', cancelada_em: '2026-09-10', gasto_mes_centavos: 0 };
    const { chamadas } = mockApi({
      [`GET /ferramentas?mes=${mes}`]: { ...lista, ferramentas: [openai, claude, midjourney] },
      'POST /ferramentas/1/cancelar': { ...claude, cancelada_em: hojeISO() },
      'POST /ferramentas/3/reativar': { ...midjourney, cancelada_em: null },
    });
    renderizar(<Ferramentas />);
    const usuario = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura de API OpenAI' })).not.toBeInTheDocument();
    expect(await screen.findByText('Cancelada em 10/09/2026')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Cancelar assinatura de Claude' }));
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar assinatura de Claude?' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Voltar' }));
    expect(chamadas.some((c) => c.caminho === '/ferramentas/1/cancelar')).toBe(false);

    await usuario.click(screen.getByRole('button', { name: 'Cancelar assinatura de Claude' }));
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar assinatura' }));
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/ferramentas/1/cancelar')).toBe(true);

    await usuario.click(screen.getByRole('button', { name: 'Reativar Midjourney' }));
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/ferramentas/3/reativar')).toBe(true);
  });
});
