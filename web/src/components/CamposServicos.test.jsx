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
      'GET /placas/modelos/1/preco?quantidade=1': { total_centavos: 8000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [8000] },
    });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={(v) => emitidos.push(v)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    expect(screen.getByLabelText('Modelo da placa')).toHaveValue('1');
    expect(screen.getByLabelText('Valor total das placas')).toHaveValue('80,00');
    expect(emitidos.at(-1)).toEqual({
      servicos: [{ tipo: 'placas_nfc', modelo_id: 1, quantidade: 1, valor_total_centavos: 8000 }],
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
      'GET /placas/modelos/1/preco?quantidade=1': { total_centavos: 8000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [8000] },
      'GET /placas/modelos/2/preco?quantidade=1': { total_centavos: 10000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000] },
    });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    await user.selectOptions(screen.getByLabelText('Modelo da placa'), '2');
    expect(await screen.findByDisplayValue('100,00')).toBe(screen.getByLabelText('Valor total das placas'));
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

  const MODELO = { id: 2, nome: 'Placa 10x15', ativo: 1, preco_venda_centavos: 10000 };

  it('com cliente que já comprou, preenche o preço de recompra e mostra a etiqueta', async () => {
    mockApi({
      'GET /placas/modelos': [MODELO],
      'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=7': { total_centavos: 8000, ja_comprou: 1, recompra: true, preco_por_placa_centavos: [8000] },
      'GET /placas/modelos/2/preco?quantidade=2&cliente_id=7': { total_centavos: 15000, ja_comprou: 1, recompra: true, preco_por_placa_centavos: [8000, 7000] },
    });
    const emitidos = [];
    renderizar(<CamposServicos servicos={[]} desconto={0} clienteId={7} onChange={(v) => emitidos.push(v)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    const quantidade = screen.getByLabelText('Quantidade de placas');
    await user.clear(quantidade);
    await user.type(quantidade, '2');
    expect(await screen.findByDisplayValue('150,00')).toBeInTheDocument();
    expect(screen.getByText('Cliente já comprou 1 placa — preço de recompra')).toBeInTheDocument();
    expect(emitidos.at(-1).servicos[0]).toEqual({ tipo: 'placas_nfc', modelo_id: 2, quantidade: 2, valor_total_centavos: 15000 });
  });

  it('valor editado à mão não é sobrescrito; o link restaura o sugerido', async () => {
    mockApi({
      'GET /placas/modelos': [MODELO],
      'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=1': { total_centavos: 10000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000] },
      'GET /placas/modelos/2/preco?quantidade=2': { total_centavos: 18000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000, 8000] },
    });
    renderizar(<CamposServicos servicos={[]} desconto={0} clienteId={null} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    const valor = screen.getByLabelText('Valor total das placas');
    await user.clear(valor);
    await user.type(valor, '170');
    const quantidade = screen.getByLabelText('Quantidade de placas');
    await user.clear(quantidade);
    await user.type(quantidade, '2');
    const link = await screen.findByRole('button', { name: /usar preço sugerido \(R\$\s180,00\)/ });
    expect(valor).toHaveValue('170');
    await user.click(link);
    expect(valor).toHaveValue('180,00');
    expect(screen.getByText('Preço de pack')).toBeInTheDocument();
  });

  it('linha existente carrega o total salvo e não é sobrescrita pela sugestão', async () => {
    mockApi({
      'GET /placas/modelos': [MODELO],
      'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=3&cliente_id=7&projeto_id=9': { total_centavos: 25000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000, 8000, 7000] },
    });
    renderizar(
      <CamposServicos
        servicos={[{ tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_unitario_centavos: 6667, valor_total_centavos: 20000 }]}
        desconto={0} clienteId={7} projetoId={9} onChange={() => {}}
      />,
    );
    expect(await screen.findByRole('button', { name: /usar preço sugerido \(R\$\s250,00\)/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Valor total das placas')).toHaveValue('200,00');
    expect(screen.getByText(/Subtotal: R\$ 200,00/)).toBeInTheDocument();
  });

  it('se a consulta de preço falhar, mantém o valor atual', async () => {
    mockApi({ 'GET /placas/modelos': [MODELO], 'GET /config': {} });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    await userEvent.setup().click(await screen.findByLabelText('Placas NFC'));
    expect(screen.getByLabelText('Valor total das placas')).toHaveValue('100,00');
  });

  it('quantidade vazia não consulta preço', async () => {
    const api = mockApi({
      'GET /placas/modelos': [MODELO], 'GET /config': {},
      'GET /placas/modelos/2/preco?quantidade=1': { total_centavos: 10000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000] },
    });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Placas NFC'));
    await user.clear(screen.getByLabelText('Quantidade de placas'));
    expect(api.chamadas.filter((c) => c.caminho.includes('quantidade=0') || c.caminho.endsWith('quantidade='))).toEqual([]);
  });
});
