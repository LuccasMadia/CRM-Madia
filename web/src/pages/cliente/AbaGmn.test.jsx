import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from '../ClienteDetalhe.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { rotasPerfil, gmn } from '../../test/perfilCliente.js';
import { hojeISO } from '../../lib/datas.js';

const parcelaAberta = { id: 30, descricao: 'Pagamento', valor_centavos: 20000, vencimento: '2026-10-05', pago_em: null, mensalidade: 0 };
const abrir = () => renderizar(<ClienteDetalhe />, { rota: '/clientes/1?aba=gmn', padrao: '/clientes/:id' });
const cartao = async () => (await screen.findByRole('link', { name: 'https://g.page/ana' })).closest('li');

describe('Aba Google Meu Negócio', () => {
  it('cartão mostra pendente, link e cobrança a receber; marca pago e configurado', async () => {
    const { chamadas } = mockApi(rotasPerfil({
      'GET /projetos/6/parcelas': { parcelas: [parcelaAberta], resumo: {} },
      'PUT /parcelas/30': { ...parcelaAberta, pago_em: hojeISO() },
      'PUT /projetos/6': { ...gmn, etapa: 'entregue' },
    }));
    abrir();
    const item = await cartao();
    expect(within(item).getByText('Pendente')).toBeInTheDocument();
    expect(await within(item).findByText(/R\$\s200,00 · a receber \(vence 05\/10\/2026\)/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(item).getByRole('button', { name: 'Marcar pago' }));
    expect(chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/parcelas/30').corpo).toEqual({ pago_em: hojeISO() });
    await user.click(within(item).getByRole('button', { name: 'Marcar configurado' }));
    expect(chamadas.find((c) => c.caminho === '/projetos/6' && c.metodo === 'PUT').corpo).toEqual({ etapa: 'entregue' });
  });

  it('configurado mostra a data; mensalidade mostra valor por mês', async () => {
    mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [{ ...gmn, etapa: 'entregue', data_entrega: '2026-09-20', mensalidade_ativa: 1, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10, valor_total_centavos: 0 }],
    }));
    abrir();
    const item = await cartao();
    expect(within(item).getByText('Configurado em 20/09/2026')).toBeInTheDocument();
    expect(await within(item).findByText(/R\$\s50,00\/mês, dia 10/)).toBeInTheDocument();
  });

  it('+ Google Meu Negócio cria com cobrança única', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'POST /projetos': { ...gmn, id: 9 } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Google Meu Negócio' }));
    const dialogo = screen.getByRole('dialog');
    await user.type(within(dialogo).getByLabelText('Valor (R$)'), '200');
    await user.type(within(dialogo).getByLabelText('Vencimento'), '2026-10-05');
    await user.type(within(dialogo).getByLabelText('Link do perfil'), 'https://g.page/ana');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', cliente_id: 1,
      valor_total_centavos: 20000, vencimento: '2026-10-05', mensalidade_ativa: false,
      link_perfil: 'https://g.page/ana', notas: '',
    });
  });

  it('cria com mensalidade', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'POST /projetos': { ...gmn, id: 9 } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Google Meu Negócio' }));
    const dialogo = screen.getByRole('dialog');
    await user.click(within(dialogo).getByLabelText('Mensalidade'));
    await user.type(within(dialogo).getByLabelText('Valor (R$)'), '50');
    await user.type(within(dialogo).getByLabelText('Dia do vencimento'), '10');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      valor_total_centavos: 0, mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10,
    });
  });

  it('editar com cobrança já paga trava o valor', async () => {
    mockApi(rotasPerfil({ 'GET /projetos/6/parcelas': { parcelas: [{ ...parcelaAberta, pago_em: '2026-10-01' }], resumo: {} } }));
    abrir();
    const item = await cartao();
    expect(await within(item).findByText(/· pago/)).toBeInTheDocument();
    await userEvent.setup().click(within(item).getByRole('button', { name: 'Editar' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Valor (R$)')).toBeDisabled();
  });

  it('excluir pede confirmação e chama DELETE', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { chamadas } = mockApi(rotasPerfil({ 'DELETE /projetos/6': resposta(204) }));
    abrir();
    await userEvent.setup().click(within(await cartao()).getByRole('button', { name: 'Excluir' }));
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/projetos/6')).toBe(true);
  });
});
