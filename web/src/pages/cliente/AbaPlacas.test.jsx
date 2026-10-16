import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from '../ClienteDetalhe.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { rotasPerfil } from '../../test/perfilCliente.js';

const venda = {
  id: 8, titulo: 'Placas NFC', etapa: 'andamento', servico: 'placas_nfc', valor_total_centavos: 25000, notas: null, atualizado_em: 'T',
  mensalidade_ativa: 0, qrcodes: [{ id: 5, nome: 'QR balcão' }],
  servicos: [{ tipo: 'placas_nfc', modelo_id: 2, modelo_nome: 'Placa 10x15', quantidade: 3, valor_total_centavos: 25000, venda_id: null }],
};
const abrir = () => renderizar(<ClienteDetalhe />, { rota: '/clientes/1?aba=placas', padrao: '/clientes/:id' });

describe('Aba Placas NFC', () => {
  it('mostra resumo, cartão da venda, histórico avulso e QR codes com #id', async () => {
    mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [venda],
      'GET /projetos/8/parcelas': { parcelas: [{ id: 40, valor_centavos: 25000, vencimento: '2026-10-05', pago_em: null, mensalidade: 0 }], resumo: {} },
      'GET /clientes/1/placas': { ja_comprou: 7, vendas_avulsas: [{ id: 2, modelo_nome: 'Placa 10x10', quantidade: 2, preco_vendido_centavos: 8000, data_venda: '2026-08-01' }] },
    }));
    abrir();
    expect(await screen.findByText('Já comprou 7 placas')).toBeInTheDocument();
    const cartao = screen.getByText('Placa 10x15 × 3').closest('li');
    expect(within(cartao).getByText('Pendente')).toBeInTheDocument();
    expect(within(cartao).getByText('#5')).toBeInTheDocument();
    expect(within(cartao).getByText(/a receber \(vence 05\/10\/2026\)/)).toBeInTheDocument();
    expect(screen.getByText(/Placa 10x10 × 2/)).toBeInTheDocument();
    expect(screen.getByText('01/08/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QR balcão' })).toHaveAttribute('href', '/qrcodes/5');
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
