import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from '../ClienteDetalhe.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { rotasPerfil } from '../../test/perfilCliente.js';

const venda = {
  id: 8, titulo: 'Placas NFC', etapa: 'andamento', servico: 'placas_nfc', valor_total_centavos: 25000, notas: null, atualizado_em: 'T',
  mensalidade_ativa: 0,
  servicos: [{ tipo: 'placas_nfc', modelo_id: 2, modelo_nome: 'Placa 10x15', quantidade: 3, valor_total_centavos: 25000, venda_id: null }],
};
const abrir = () => renderizar(<ClienteDetalhe />, { rota: '/clientes/1?aba=placas', padrao: '/clientes/:id' });

describe('Aba Placas NFC', () => {
  it('lista as vendas do cliente com a situação e manda lançar venda em Placas', async () => {
    mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [],
      'GET /clientes/1/placas': {
        ja_comprou: 3, vendas_avulsas: [],
        vendas: [
          { id: 2, modelo_nome: 'Placa 10x10', quantidade: 2, valor_total_centavos: 16000, data_venda: '2026-08-01', recebido_em: null, estado: 'atrasada' },
          { id: 3, modelo_nome: 'Placa 10x15', quantidade: 1, valor_total_centavos: 10000, data_venda: '2026-07-01', recebido_em: '2026-07-02', estado: 'paga' },
        ],
      },
    }));
    abrir();
    expect(await screen.findByText('Já comprou 3 placas')).toBeInTheDocument();
    const linha = screen.getByText('Placa 10x10 × 2').closest('tr');
    expect(within(linha).getByText('Atrasada')).toBeInTheDocument();
    expect(within(linha).getByText('01/08/2026')).toBeInTheDocument();
    expect(screen.getByText('Recebido em 02/07/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lançar venda' })).toHaveAttribute('href', '/servicos?aba=placas&nova_venda=1');
    expect(screen.queryByRole('button', { name: '+ Venda de placas' })).toBeNull();
  });

  it('vendas antigas feitas pelo perfil continuam aparecendo, sem QR codes', async () => {
    mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [venda],
      'GET /projetos/8/parcelas': { parcelas: [{ id: 40, valor_centavos: 25000, vencimento: '2026-10-05', pago_em: null, mensalidade: 0 }], resumo: {} },
      'GET /clientes/1/placas': { ja_comprou: 7, vendas_avulsas: [], vendas: [] },
    }));
    abrir();
    expect(await screen.findByText('Já comprou 7 placas')).toBeInTheDocument();
    const cartao = screen.getByText('Placa 10x15 × 3').closest('li');
    expect(within(cartao).getByText('Pendente')).toBeInTheDocument();
    expect(within(cartao).getByText(/a receber \(vence 05\/10\/2026\)/)).toBeInTheDocument();
    expect(screen.queryByText(/QR/)).toBeNull();
  });

  it('marcar entregue envia a etapa', async () => {
    const { chamadas } = mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [venda],
      'GET /projetos/8/parcelas': { parcelas: [], resumo: {} },
      'PUT /projetos/8': { ...venda, etapa: 'entregue' },
    }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Marcar entregue' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ etapa: 'entregue' });
  });
});
