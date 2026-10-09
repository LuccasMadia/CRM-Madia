import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CamposServicos } from './CamposServicos.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('CamposServicos', () => {
  it('marcar "Placas NFC" adiciona a linha com o primeiro modelo ativo e o preço dele', async () => {
    mockApi({
      'GET /placas/modelos': [{ id: 1, nome: 'Placa 10x10 PVC', ativo: 1, preco_venda_centavos: 8000 }],
      'GET /config': {},
    });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={(v) => emitidos.push(v)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    expect(screen.getByLabelText('Modelo da placa')).toHaveValue('1');
    expect(screen.getByLabelText('Valor de Placas NFC')).toHaveValue('80,00');
    expect(emitidos.at(-1)).toEqual({
      servicos: [{ tipo: 'placas_nfc', modelo_id: 1, quantidade: 1, valor_unitario_centavos: 8000 }],
      desconto_centavos: 0,
    });
  });

  it('marcar "SaaS" usa o preço padrão configurado', async () => {
    mockApi({ 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 } });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={(v) => emitidos.push(v)} />);
    await userEvent.setup().click(await screen.findByLabelText('SaaS'));
    expect(screen.getByLabelText('Valor de SaaS')).toHaveValue('150,00');
    expect(emitidos.at(-1).servicos).toEqual([{ tipo: 'saas', valor_unitario_centavos: 15000 }]);
  });

  it('trocar o modelo de placas atualiza o valor sugerido', async () => {
    mockApi({
      'GET /placas/modelos': [
        { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, preco_venda_centavos: 8000 },
        { id: 2, nome: 'Placa 10x15 Acrílico', ativo: 1, preco_venda_centavos: 10000 },
      ],
      'GET /config': {},
    });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    await user.selectOptions(screen.getByLabelText('Modelo da placa'), '2');
    expect(screen.getByLabelText('Valor de Placas NFC')).toHaveValue('100,00');
  });

  it('desmarcar remove a linha', async () => {
    mockApi({ 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 } });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={(v) => emitidos.push(v)} />);
    const user = userEvent.setup();
    const checkbox = await screen.findByLabelText('SaaS');
    await user.click(checkbox);
    await user.click(checkbox);
    expect(screen.queryByLabelText('Valor de SaaS')).not.toBeInTheDocument();
    expect(emitidos.at(-1)).toEqual({ servicos: [], desconto_centavos: 0 });
  });

  it('subtotal, desconto e total calculam certo na tela', async () => {
    mockApi({ 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 10000 } });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('SaaS'));
    expect(screen.getByText(/Subtotal: R\$ 100,00/)).toBeInTheDocument();
    const desconto = screen.getByLabelText('Desconto (R$)');
    await user.clear(desconto);
    await user.type(desconto, '20');
    expect(screen.getByText(/Total: R\$ 80,00/)).toBeInTheDocument();
  });
});
