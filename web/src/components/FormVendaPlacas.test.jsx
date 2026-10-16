import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormVendaPlacas } from './FormVendaPlacas.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const cliente = { id: 1, qrcodes: [{ id: 3, nome: 'Balcão' }, { id: 5, nome: 'Mesa' }] };
const modelos = [{ id: 2, nome: 'Placa 10x15', ativo: 1, preco_venda_centavos: 10000 }];
const preco = (total, extra = {}) => ({ total_centavos: total, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [], ...extra });

describe('FormVendaPlacas', () => {
  it('sugere o preço de pack, permite escolher QRs e envia a venda', async () => {
    mockApi({
      'GET /placas/modelos': modelos,
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=1': preco(10000),
      'GET /placas/modelos/2/preco?quantidade=3&cliente_id=1': preco(25000),
    });
    const enviados = [];
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={(c) => enviados.push(c)} />);
    const user = userEvent.setup();
    const modelo = await screen.findByLabelText('Modelo da placa');
    await waitFor(() => expect(modelo).toHaveValue('2'));
    const quantidade = screen.getByLabelText('Quantidade');
    await user.clear(quantidade);
    await user.type(quantidade, '3');
    expect(await screen.findByDisplayValue('250,00')).toBeInTheDocument();
    expect(screen.getByText('Preço de pack')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Vencimento'), '2026-10-05');
    await user.click(screen.getByLabelText('#5 Mesa'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados.at(-1)).toEqual({
      servico: 'placas_nfc', titulo: 'Placas NFC', cliente_id: 1,
      servicos: [{ tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_total_centavos: 25000 }],
      vencimento: '2026-10-05', qrcodes: [5], notas: '',
    });
  });

  it('cliente que já comprou mostra a etiqueta de recompra', async () => {
    mockApi({
      'GET /placas/modelos': modelos,
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=1': preco(9000, { ja_comprou: 4, recompra: true }),
    });
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={() => {}} />);
    expect(await screen.findByText('Cliente já comprou 4 placas — preço de recompra')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Valor total')).toHaveValue('90,00'));
  });

  it('valor digitado à mão não é sobrescrito; o botão restaura o sugerido', async () => {
    mockApi({
      'GET /placas/modelos': modelos,
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=1': preco(10000),
    });
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={() => {}} />);
    const user = userEvent.setup();
    const valor = await screen.findByLabelText('Valor total');
    await screen.findByDisplayValue('100,00');
    await user.clear(valor);
    await user.type(valor, '80');
    await user.click(screen.getByRole('button', { name: /usar preço sugerido/ }));
    expect(valor).toHaveValue('100,00');
  });

  it('se a consulta de preço falhar, mantém o valor e deixa salvar', async () => {
    mockApi({ 'GET /placas/modelos': modelos });
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={() => {}} />);
    expect(await screen.findByLabelText('Valor total')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('venda entregue trava modelo, quantidade e valor e não reenvia a linha', async () => {
    mockApi({ 'GET /placas/modelos': modelos });
    const projeto = {
      id: 8, notas: null, qrcodes: [{ id: 3, nome: 'Balcão' }],
      servicos: [{ tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_total_centavos: 25000, venda_id: 11 }],
    };
    const enviados = [];
    renderizar(<FormVendaPlacas cliente={cliente} projeto={projeto} onSalvar={(c) => enviados.push(c)} />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Modelo da placa')).toBeDisabled();
    expect(screen.getByLabelText('Quantidade')).toBeDisabled();
    expect(screen.getByLabelText('Valor total')).toBeDisabled();
    expect(screen.getByLabelText('#3 Balcão')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados.at(-1)).toEqual({ vencimento: '', qrcodes: [3], notas: '' });
  });
});
