import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Placas } from './Placas.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('Placas', () => {
  it('mostra o resumo de lucro previsto, lucro real e estoque', async () => {
    mockApi({
      'GET /placas/resumo': {
        lucro_previsto_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, custo_previsto_centavos: 376, lucro_previsto_centavos: 7624 },
        ],
        lucro_real_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', quantidade: 2, lucro_total_centavos: 15000, lucro_medio_centavos: 7500 },
        ],
        materiais: [{ material_id: 1, nome: 'Placa 10x10 PVC', estoque_atual: -1 }],
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    expect(await screen.findByRole('heading', { name: 'Placas de avaliação' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*76,24/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*75,00/)).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('cria material na aba Materiais', async () => {
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [],
      'POST /placas/materiais': { id: 1, nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: null },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Materiais' }));
    await user.click(await screen.findByRole('button', { name: '+ Material' }));
    await user.type(screen.getByLabelText('Nome'), 'Placa 10x10 PVC');
    await user.click(screen.getByRole('button', { name: 'Criar material' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ nome: 'Placa 10x10 PVC' });
  });

  it('lança lote na aba Lotes', async () => {
    const material = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, estoque_atual: 0, custo_unitario_atual: null };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [material],
      'GET /placas/lotes': [],
      'POST /placas/lotes': {
        id: 1, material_id: 1, nome_lote: '', quantidade: 10,
        valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-10-03',
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    await user.click(await screen.findByRole('button', { name: '+ Lote' }));
    await user.selectOptions(await screen.findByLabelText('Material'), '1');
    await user.type(screen.getByLabelText('Quantidade'), '10');
    await user.type(screen.getByLabelText('Valor do kit (R$)'), '24,90');
    await user.click(screen.getByRole('button', { name: 'Lançar lote' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/placas/lotes');
    expect(post.corpo).toMatchObject({ material_id: 1, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0 });
    expect(post.corpo.data_compra).toEqual(expect.any(String));
  });

  it('esconde materiais inativos do select de novo lote', async () => {
    const ativo = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, estoque_atual: 0, custo_unitario_atual: null };
    const inativo = { id: 2, nome: 'Placa Antiga', ativo: 0, estoque_atual: 0, custo_unitario_atual: null };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] } },
      'GET /placas/materiais': [ativo, inativo],
      'GET /placas/lotes': [],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    await user.click(await screen.findByRole('button', { name: '+ Lote' }));
    const select = await screen.findByLabelText('Material');
    const opcoes = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes).toEqual(['Selecione…', 'Placa 10x10 PVC']);
  });

  it('separa materiais ativos e inativos, com botão de desativar e reativar', async () => {
    const ativo = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, estoque_atual: 0, custo_unitario_atual: null };
    const inativo = { id: 2, nome: 'Placa Antiga', ativo: 0, estoque_atual: 0, custo_unitario_atual: null };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] } },
      'GET /placas/materiais': [ativo, inativo],
      'POST /placas/materiais/2/ativar': { ...inativo, ativo: 1 },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Materiais' }));
    expect(await screen.findByText('Inativos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reativar' }));
    const post = chamadas.find((c) => c.caminho === '/placas/materiais/2/ativar');
    expect(post.metodo).toBe('POST');
  });

  it('agrupa lotes com o mesmo nome_lote numa seção expansível com total e intervalo de datas', async () => {
    const pvc = { id: 1, nome: 'Placa 10x10 PVC' };
    const nfc = { id: 2, nome: 'Tag NFC' };
    const loteA = {
      id: 1, material_id: 1, nome_lote: 'Compra Outubro', quantidade: 10,
      valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-05',
    };
    const loteB = {
      id: 2, material_id: 2, nome_lote: 'Compra Outubro', quantidade: 20,
      valor_kit_centavos: 2000, valor_frete_centavos: 200, data_compra: '2026-10-08',
    };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [pvc, nfc],
      'GET /placas/lotes': [loteA, loteB],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    expect(await screen.findByText('Compra Outubro')).toBeInTheDocument();
    expect(screen.getByText('Tag NFC')).not.toBeVisible();
    const resumo = screen.getByText('Compra Outubro').closest('summary');
    expect(resumo.textContent).toContain('05/10/2026 – 08/10/2026');
    expect(resumo.textContent).toMatch(/R\$\s*33,00/);
    await user.click(screen.getByText('Compra Outubro'));
    expect(screen.getByText('Tag NFC')).toBeVisible();
  });

  it('lote sem nome_lote continua aparecendo como linha solta, fora de qualquer seção', async () => {
    const pvc = { id: 1, nome: 'Placa 10x10 PVC' };
    const loteSolto = {
      id: 3, material_id: 1, nome_lote: '', quantidade: 5,
      valor_kit_centavos: 500, valor_frete_centavos: 0, data_compra: '2026-10-01',
    };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [pvc],
      'GET /placas/lotes': [loteSolto],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    expect(await screen.findByText('Placa 10x10 PVC')).toBeVisible();
    expect(document.querySelector('details.cartao')).not.toBeInTheDocument();
  });

  it('sugere no formulário de novo lote os nomes de lote já usados', async () => {
    const pvc = { id: 1, nome: 'Placa 10x10 PVC' };
    const loteA = {
      id: 1, material_id: 1, nome_lote: 'Compra Outubro', quantidade: 10,
      valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-05',
    };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [pvc],
      'GET /placas/lotes': [loteA],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    await user.click(await screen.findByRole('button', { name: '+ Lote' }));
    const opcoes = [...document.querySelectorAll('#lista-nomes-lote option')].map((o) => o.value);
    expect(opcoes).toEqual(['Compra Outubro']);
  });

  it('cria modelo com um item de receita na aba Modelos', async () => {
    const material = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, estoque_atual: 0, custo_unitario_atual: 249 };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/modelos': [],
      'GET /placas/materiais': [material],
      'POST /placas/modelos': {
        id: 1, nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000,
        itens: [{ id: 1, modelo_id: 1, material_id: 1, quantidade: 1 }],
        custo_previsto_centavos: 249, lucro_previsto_centavos: 7751,
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Modelos' }));
    await user.click(await screen.findByRole('button', { name: '+ Modelo' }));
    await user.type(screen.getByLabelText('Nome'), 'Placa 10x10 PVC');
    await user.type(screen.getByLabelText('Preço de venda (R$)'), '80');
    await user.click(screen.getByRole('button', { name: '+ Item da receita' }));
    await user.selectOptions(await screen.findByLabelText('Material do item 1'), '1');
    await user.click(screen.getByRole('button', { name: 'Criar modelo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/placas/modelos');
    expect(post.corpo).toEqual({
      nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, itens: [{ material_id: 1, quantidade: 1 }],
    });
  });

  it('lança venda e mostra aviso de estoque negativo', async () => {
    const modelo = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, preco_venda_centavos: 8000, custo_previsto_centavos: 249, lucro_previsto_centavos: 7751, itens: [] };
    const ana = { id: 1, nome: 'Ana' };
    const { chamadas } = mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/vendas': [],
      'GET /placas/modelos': [modelo],
      'GET /clientes': [ana],
      'POST /placas/vendas': {
        venda: {
          id: 1, modelo_id: 1, quantidade: 1, preco_vendido_centavos: 8000, custo_unitario_centavos: 249,
          cliente_id: 1, comprador_nome: null, data_venda: '2026-10-03', lucro_real_centavos: 7751,
        },
        avisos_estoque: [{ material_id: 1, nome: 'Placa 10x10 PVC', estoque_atual: -1 }],
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Vendas' }));
    await user.click(await screen.findByRole('button', { name: '+ Venda' }));
    await user.selectOptions(await screen.findByLabelText('Modelo'), '1');
    await user.selectOptions(screen.getByLabelText('Comprador'), '1');
    await user.click(screen.getByRole('button', { name: 'Lançar venda' }));
    expect(await screen.findByText(/Estoque negativo após esta venda/)).toBeInTheDocument();
    const post = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/placas/vendas');
    expect(post.corpo).toMatchObject({ modelo_id: 1, quantidade: 1, preco_vendido_centavos: 8000, cliente_id: 1, comprador_nome: null });
  });
});
