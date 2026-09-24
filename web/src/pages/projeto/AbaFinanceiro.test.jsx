import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaFinanceiro } from './AbaFinanceiro.jsx';
import { mockApi } from '../../test/mockApi.js';
import { hojeISO } from '../../lib/datas.js';

const dados = {
  parcelas: [{ id: 8, descricao: 'Entrada', valor_centavos: 150000, vencimento: '2026-09-10', pago_em: null, estado: 'atrasada' }],
  resumo: { total_centavos: 150000, pago_centavos: 0, pendente_centavos: 0, atrasado_centavos: 150000, nao_parcelado_centavos: -50000 },
};

describe('AbaFinanceiro', () => {
  it('mostra resumo e marca parcela como paga com a data de hoje', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/parcelas': dados, 'PUT /parcelas/8': {} });
    render(<AbaFinanceiro projeto={{ id: 5 }} />);
    expect(await screen.findByText('Parcelas acima do valor')).toBeInTheDocument();
    expect(screen.getByText('Atrasada')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Marcar Entrada como paga' }));
    await screen.findByText('Entrada');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ pago_em: hojeISO() });
  });

  it('não envia parcela sem valor válido', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/parcelas': { parcelas: [], resumo: dados.resumo } });
    render(<AbaFinanceiro projeto={{ id: 5 }} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Valor da parcela (R$)'), 'mil');
    await user.click(screen.getByRole('button', { name: 'Adicionar parcela' }));
    expect(await screen.findByText('Informe um valor válido')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it('gera parcelas em lote', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5/parcelas': { parcelas: [], resumo: dados.resumo },
      'POST /projetos/5/parcelas/lote': [],
    });
    render(<AbaFinanceiro projeto={{ id: 5 }} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Quantidade'), '3');
    await user.type(screen.getByLabelText('Valor de cada parcela (R$)'), '500');
    fireEvent.change(screen.getByLabelText('Vencimento da 1ª parcela'), { target: { value: '2026-04-10' } });
    await user.click(screen.getByRole('button', { name: 'Gerar parcelas' }));
    await screen.findByText('Nenhuma parcela cadastrada.');
    const post = chamadas.find((c) => c.caminho === '/projetos/5/parcelas/lote');
    expect(post.corpo).toEqual({ quantidade: 3, valor_centavos: 50000, primeira_vencimento: '2026-04-10' });
  });

  it('não gera lote sem valor válido', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/parcelas': { parcelas: [], resumo: dados.resumo } });
    render(<AbaFinanceiro projeto={{ id: 5 }} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Quantidade'), '3');
    await user.type(screen.getByLabelText('Valor de cada parcela (R$)'), 'mil');
    await user.click(screen.getByRole('button', { name: 'Gerar parcelas' }));
    expect(await screen.findByText('Informe um valor válido')).toBeInTheDocument();
    expect(chamadas.some((c) => c.caminho === '/projetos/5/parcelas/lote')).toBe(false);
  });
});
