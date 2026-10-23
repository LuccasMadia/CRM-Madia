import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlacasNfc } from '../servicos/PlacasNfc.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const venda = {
  id: 7, modelo_id: 1, modelo_nome: 'Placa 10x10 EN', quantidade: 1, cliente_id: 3, cliente_nome: 'Rango do Bicho',
  comprador_nome: null, data_venda: '2026-10-02', valor_total_centavos: 8000, estado: 'atrasada', recebido_em: null,
  preco_vendido_centavos: 8000, lucro_real_centavos: 7000, via_projeto: false,
};
const recebida = { ...venda, id: 8, cliente_nome: 'House', estado: 'paga', recebido_em: '2026-10-05' };

const resumo = {
  lucro_previsto_por_modelo: [], lucro_real_por_modelo: [],
  materiais: [{ material_id: 1, nome: 'Tag NFC', estoque_atual: -2 }],
  prejuizo_avarias: { total_centavos: 0, por_modelo: [] },
  a_receber: { total_centavos: 8000, vendas: [venda] },
  montadas: [
    { modelo_id: 1, modelo_nome: 'Placa 10x10 EN', montadas: 2, da_pra_montar: 3 },
    { modelo_id: 2, modelo_nome: 'Placa 10x15 Acrílico', montadas: 0, da_pra_montar: 0 },
  ],
  mes: { vendidas: 4, lucro_centavos: 5240 },
};

const tudoEmDia = {
  ...resumo, materiais: [], a_receber: { total_centavos: 0, vendas: [] },
  montadas: [{ modelo_id: 1, modelo_nome: 'Placa 10x10 EN', montadas: 2, da_pra_montar: 3 }],
};

describe('Placas — três seções e "Pede atenção"', () => {
  it('abre em Vendas com o que pede atenção no topo', async () => {
    mockApi({ 'GET /placas/resumo': resumo, 'GET /placas/vendas': [venda, recebida] });
    renderizar(<PlacasNfc />, { rota: '/servicos?aba=placas', padrao: '/servicos' });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Vendas', 'Estoque', 'Cadastros']);
    expect(screen.getByRole('tab', { name: 'Vendas' })).toHaveAttribute('aria-selected', 'true');
    const faixa = await screen.findByRole('region', { name: 'Pede atenção' });
    const aReceber = within(faixa).getByRole('link', { name: /1 venda a receber · R\$\s*80,00/ });
    expect(aReceber).toHaveAttribute('href', '/servicos?aba=placas&placas=vendas&sub=a_receber');
    expect(within(faixa).getByRole('link', { name: '1 venda atrasada' })).toHaveClass('pede-atencao__item--perigo');
    // modelo sem placa montada não é pendência: só se monta quando vende
    expect(within(faixa).queryByText(/sem placa montada/i)).not.toBeInTheDocument();
    expect(within(faixa).getByRole('link', { name: '1 material com estoque negativo' })).toHaveClass('pede-atencao__item--atencao');
    expect(await screen.findByText('House')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Venda' })).toHaveClass('btn--primario');
  });

  it('sem pendências a faixa diz que está tudo em dia', async () => {
    mockApi({ 'GET /placas/resumo': tudoEmDia, 'GET /placas/vendas': [] });
    renderizar(<PlacasNfc />, { rota: '/servicos?aba=placas', padrao: '/servicos' });
    expect(await screen.findByText('Nada pendente por aqui')).toBeInTheDocument();
  });

  it('o link "a receber" filtra as vendas e "Recebi" marca como recebida', async () => {
    const { chamadas } = mockApi({
      'GET /placas/resumo': resumo,
      'GET /placas/vendas': [venda, recebida],
      'POST /placas/vendas/7/recebimento': { ...venda, recebido_em: '2026-10-18', estado: 'paga' },
    });
    renderizar(<PlacasNfc />, { rota: '/servicos?aba=placas', padrao: '/servicos' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: /venda a receber/ }));
    expect(screen.getByRole('button', { name: 'A receber' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.queryByText('House')).not.toBeInTheDocument());
    expect(screen.getByText(/há \d+ dias/)).toBeInTheDocument();
    const antes = chamadas.filter((c) => c.caminho === '/placas/resumo').length;
    await user.click(screen.getByRole('button', { name: 'Recebi de Rango do Bicho' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/placas/vendas/7/recebimento')).toBe(true));
    // O "Pede atenção" se atualiza depois do recebimento.
    await waitFor(() => expect(chamadas.filter((c) => c.caminho === '/placas/resumo').length).toBeGreaterThan(antes));
  });

  it('a receber vazio mostra "Tudo recebido."', async () => {
    mockApi({ 'GET /placas/resumo': tudoEmDia, 'GET /placas/vendas': [recebida] });
    renderizar(<PlacasNfc />, { rota: '/servicos?aba=placas&placas=vendas&sub=a_receber', padrao: '/servicos' });
    expect(await screen.findByText('Tudo recebido.')).toBeInTheDocument();
  });

  it('Estoque mostra montadas e materiais, e "+ Montar" lança a montagem', async () => {
    const { chamadas } = mockApi({
      'GET /placas/resumo': resumo,
      'GET /placas/modelos': [{ id: 1, nome: 'Placa 10x10 EN', ativo: 1, itens: [{ material_id: 1, quantidade: 1 }] }],
      'POST /placas/montagens': { montagem: { id: 1 }, avisos_estoque: [] },
    });
    renderizar(<PlacasNfc />, { rota: '/servicos?aba=placas&placas=estoque', padrao: '/servicos' });
    const montadas = await screen.findByRole('region', { name: 'Montadas, prontas para vender' });
    expect(within(montadas).getByText('os materiais dão para mais 3')).toBeInTheDocument();
    expect(screen.getByText('Montadas prontas').nextSibling).toHaveTextContent('2');
    expect(within(screen.getByRole('region', { name: 'Materiais em estoque' })).getByText('-2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Em estoque' })).toHaveAttribute('aria-pressed', 'true');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Montar' }));
    const quantidade = await screen.findByLabelText('Quantidade');
    await user.clear(quantidade);
    await user.type(quantidade, '3');
    await user.click(screen.getByRole('button', { name: 'Registrar montagem' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({ modelo_id: 1, quantidade: 3 });
  });

  it('trocar de seção e de visão vai para o endereço', async () => {
    mockApi({ 'GET /placas/resumo': resumo, 'GET /placas/vendas': [], 'GET /placas/materiais': [], 'GET /placas/modelos': [] });
    renderizar(<PlacasNfc />, { rota: '/servicos?aba=placas', padrao: '/servicos' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Cadastros' }));
    expect(screen.getByRole('button', { name: 'Modelos' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Materiais' }));
    expect(await screen.findByRole('button', { name: '+ Material' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cadastros' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Placas — links antigos', () => {
  const casos = [
    ['vendas', 'Vendas', 'Todas'],
    ['resumo', 'Estoque', 'Em estoque'],
    ['montagem', 'Estoque', 'Montagem'],
    ['lotes', 'Estoque', 'Lotes'],
    ['avarias', 'Estoque', 'Avarias'],
    ['modelos', 'Cadastros', 'Modelos'],
    ['materiais', 'Cadastros', 'Materiais'],
  ];
  it.each(casos)('?placas=%s abre %s › %s', async (antigo, secao, sub) => {
    mockApi({ 'GET /placas/resumo': resumo });
    renderizar(<PlacasNfc />, { rota: `/servicos?aba=placas&placas=${antigo}`, padrao: '/servicos' });
    expect(screen.getByRole('tab', { name: secao })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: sub })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('region', { name: 'Pede atenção' });
  });
});

describe('Aba Vendas — recebimento', () => {
  it('mostra a situação e permite desfazer o recebimento', async () => {
    const { chamadas } = mockApi({
      'GET /placas/resumo': resumo,
      'GET /placas/vendas': [recebida, venda],
      'DELETE /placas/vendas/8/recebimento': { ...recebida, recebido_em: null, estado: 'pendente' },
    });
    renderizar(<PlacasNfc />, { rota: '/servicos', padrao: '/servicos' });
    const user = userEvent.setup();
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
    expect(screen.getByRole('tab', { name: 'Vendas' })).toHaveAttribute('aria-selected', 'true');
  });
});
