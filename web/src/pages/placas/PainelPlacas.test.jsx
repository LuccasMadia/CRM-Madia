import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlacasNfc } from '../servicos/PlacasNfc.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const venda = {
  id: 7, modelo_id: 1, modelo_nome: 'Placa 10x10 EN', quantidade: 1, cliente_id: 3, cliente_nome: 'Rango do Bicho',
  comprador_nome: null, data_venda: '2026-10-02', valor_total_centavos: 8000, estado: 'atrasada', recebido_em: null,
};

const resumo = {
  lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [],
  prejuizo_avarias: { total_centavos: 0, por_modelo: [] },
  a_receber: { total_centavos: 8000, vendas: [venda] },
  montadas: [{ modelo_id: 1, modelo_nome: 'Placa 10x10 EN', montadas: 2, da_pra_montar: 3 }],
  mes: { vendidas: 4, lucro_centavos: 5240 },
};

describe('Resumo de Placas — painel', () => {
  it('mostra os números, a venda a receber e as montadas', async () => {
    mockApi({ 'GET /placas/resumo': resumo });
    renderizar(<PlacasNfc />, { rota: '/servicos', padrao: '/servicos' });
    const aReceber = await screen.findByRole('region', { name: 'Vendidas e ainda não recebidas' });
    expect(within(aReceber).getByText('Rango do Bicho')).toBeInTheDocument();
    expect(within(aReceber).getByText(/há \d+ dias/)).toBeInTheDocument();
    const montadas = screen.getByRole('region', { name: 'Montadas, prontas para vender' });
    expect(within(montadas).getByText('Placa 10x10 EN')).toBeInTheDocument();
    expect(within(montadas).getByText('os materiais dão para mais 3')).toBeInTheDocument();
    expect(screen.getByText('Montadas prontas').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Montadas prontas').closest('.faixa-numeros')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Resumo' })).toHaveClass('pilula');
    expect(screen.getByText('Vendidas no mês').nextSibling).toHaveTextContent('4');
  });

  it('"Recebi" marca a venda como recebida', async () => {
    const { chamadas } = mockApi({
      'GET /placas/resumo': resumo,
      'POST /placas/vendas/7/recebimento': { ...venda, recebido_em: '2026-10-18', estado: 'paga' },
    });
    renderizar(<PlacasNfc />, { rota: '/servicos', padrao: '/servicos' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Recebi de Rango do Bicho' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/placas/vendas/7/recebimento')).toBe(true));
  });

  it('sem pendências mostra "Tudo recebido"', async () => {
    mockApi({ 'GET /placas/resumo': { ...resumo, a_receber: { total_centavos: 0, vendas: [] } } });
    renderizar(<PlacasNfc />, { rota: '/servicos', padrao: '/servicos' });
    expect(await screen.findByText('Tudo recebido.')).toBeInTheDocument();
  });

  it('"+ Montar" lança a montagem', async () => {
    const { chamadas } = mockApi({
      'GET /placas/resumo': resumo,
      'GET /placas/modelos': [{ id: 1, nome: 'Placa 10x10 EN', ativo: 1, itens: [{ material_id: 1, quantidade: 1 }] }],
      'POST /placas/montagens': { montagem: { id: 1 }, avisos_estoque: [] },
    });
    renderizar(<PlacasNfc />, { rota: '/servicos', padrao: '/servicos' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Montar' }));
    const quantidade = await screen.findByLabelText('Quantidade');
    await user.clear(quantidade);
    await user.type(quantidade, '3');
    await user.click(screen.getByRole('button', { name: 'Registrar montagem' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({ modelo_id: 1, quantidade: 3 });
  });
});

describe('Aba Vendas — recebimento', () => {
  it('mostra a situação e permite desfazer o recebimento', async () => {
    const recebida = { ...venda, id: 8, estado: 'paga', recebido_em: '2026-10-05', lucro_real_centavos: 7000, preco_vendido_centavos: 8000, via_projeto: false };
    const { chamadas } = mockApi({
      'GET /placas/resumo': resumo,
      'GET /placas/vendas': [recebida, { ...venda, lucro_real_centavos: 7000, preco_vendido_centavos: 8000, via_projeto: false }],
      'DELETE /placas/vendas/8/recebimento': { ...recebida, recebido_em: null, estado: 'pendente' },
    });
    renderizar(<PlacasNfc />, { rota: '/servicos', padrao: '/servicos' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Vendas' }));
    expect(await screen.findByText('Recebido em 05/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Atrasada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desfazer recebimento' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(true));
  });

  it('abre a nova venda com o cliente escolhido quando a URL pede', async () => {
    mockApi({
      'GET /placas/resumo': resumo,
      'GET /placas/vendas': [],
      'GET /placas/modelos': [],
      'GET /clientes': [{ id: 3, nome: 'Rango do Bicho' }],
    });
    renderizar(<PlacasNfc />, { rota: '/servicos?aba=placas&nova_venda=3', padrao: '/servicos' });
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialogo).getByLabelText('Comprador')).toHaveValue('3'));
  });
});
