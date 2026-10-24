import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { AbaTarefas } from '../../pages/projeto/AbaTarefas.jsx';
import { AbaVendas } from '../../pages/placas/AbaVendas.jsx';
import { AbaFinanceiro } from '../../pages/projeto/AbaFinanceiro.jsx';
import { ModelosTarefas } from '../../pages/config/ModelosTarefas.jsx';
import { FormGmn } from '../FormGmn.jsx';
import { Tarefas } from '../../pages/Tarefas.jsx';

const itens = (n, prefixo) => Array.from({ length: n }, (_, i) => ({ id: i + 1, texto: `${prefixo} ${i + 1}`, descricao: null, dias_apos_inicio: i, ordem: i }));
const modelos = [
  { id: 2, nome: 'Google Meu Negócio', tipo: 'google_meu_negocio', itens: itens(5, 'GMN') },
  { id: 1, nome: 'Site', tipo: 'site_sistema', itens: itens(3, 'Site') },
];

describe('Aplicar modelo na aba Tarefas do projeto', () => {
  it('escolhe o modelo do serviço, mostra a prévia com o que já existe e cria só o que falta', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5/tarefas': [],
      'GET /tarefas-modelos': modelos,
      'GET /projetos/5/aplicar-modelo?modelo_id=1': { modelo_id: 1, itens: [
        { texto: 'Levantar conteúdo', prazo: '2026-10-22', ja_existe: false },
        { texto: 'Montar o wireframe', prazo: '2026-10-24', ja_existe: true },
        { texto: 'Publicar', prazo: null, ja_existe: false },
      ] },
      'POST /projetos/5/aplicar-modelo': { criadas: 2, ignoradas: 1 },
    });
    render(<MemoryRouter><AbaTarefas projetoId={5} servico="site_sistema" /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aplicar modelo' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Aplicar modelo de tarefas' }));
    await waitFor(() => expect(dialogo.getByLabelText('Modelo')).toHaveDisplayValue('Site · Site/Sistema'));
    const previa = within(await dialogo.findByRole('list', { name: 'Prévia das tarefas' }));
    expect(previa.getByText('já existe, não repete')).toBeInTheDocument();
    expect(previa.getByText('prazo 22/10/2026')).toBeInTheDocument();
    await user.click(dialogo.getByRole('button', { name: 'Criar 2 tarefas' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas.find((c) => c.metodo === 'POST')).toEqual({ metodo: 'POST', caminho: '/projetos/5/aplicar-modelo', corpo: { modelo_id: 1 } });
  });
});

describe('Criar lembrete de cobrança', () => {
  it('em Placas › Vendas › A receber cria a tarefa ligada à venda', async () => {
    const { chamadas } = mockApi({
      'GET /placas/vendas': [{ id: 5, modelo_nome: 'Redonda', cliente_nome: 'House Hamburgueria', quantidade: 1, preco_vendido_centavos: 8000, lucro_real_centavos: 5000, data_venda: '2026-10-19', recebido_em: null, estado: 'pendente' }],
      'POST /tarefas/lembrete-cobranca': { id: 30, texto: 'Cobrar House Hamburgueria — R$ 80,00' },
    });
    render(<MemoryRouter><AbaVendas visao="a_receber" /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Criar lembrete de cobrança de House Hamburgueria' }));
    expect(await screen.findByRole('button', { name: 'Criar lembrete de cobrança de House Hamburgueria' })).toHaveTextContent('Lembrete criado');
    expect(chamadas.find((c) => c.metodo === 'POST')).toEqual({ metodo: 'POST', caminho: '/tarefas/lembrete-cobranca', corpo: { placa_venda_id: 5 } });
  });

  it('na aba Financeiro do projeto aparece só nas parcelas em aberto', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/7/parcelas': {
        parcelas: [
          { id: 1, descricao: 'Entrada', valor_centavos: 50000, vencimento: '2026-10-01', pago_em: '2026-10-01', estado: 'paga' },
          { id: 2, descricao: 'Final', valor_centavos: 50000, vencimento: '2026-11-01', pago_em: null, estado: 'pendente' },
        ],
        resumo: { pago_centavos: 50000, pendente_centavos: 50000, atrasado_centavos: 0, nao_parcelado_centavos: 0 },
      },
      'POST /tarefas/lembrete-cobranca': { id: 31, texto: 'Cobrar', ja_existia: true },
    });
    render(<MemoryRouter><AbaFinanceiro projeto={{ id: 7 }} /></MemoryRouter>);
    const user = userEvent.setup();
    await screen.findByText('Final');
    expect(screen.queryByRole('button', { name: 'Criar lembrete de cobrança de Entrada' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Criar lembrete de cobrança de Final' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({ parcela_id: 2 }));
  });
});

describe('"Ligada a" no painel da tarefa de cobrança', () => {
  it('lista as parcelas e vendas a receber da empresa e liga a escolhida', async () => {
    const tarefa = {
      id: 16, texto: 'Receber placa NFC house 80,00', tipo: 'cobranca', prioridade: 'alta', etapa: 'aguardando_cliente', cliente_id: 12,
      cliente_nome: 'House Hamburgueria', projeto_id: null, parcela_id: null, placa_venda_id: null, descricao: null,
      criado_em: '2026-10-22T10:00:00Z', atualizado_em: '2026-10-23T10:00:00Z', checklist: [], comentarios: [],
    };
    const { chamadas } = mockApi({
      'GET /clientes': [{ id: 12, nome: 'House Hamburgueria' }],
      'GET /tarefas': [],
      'GET /tarefas/16': tarefa,
      'GET /projetos?cliente_id=12': [],
      'GET /tarefas/16/cobrancas': [{ tipo: 'placa_venda', id: 5, rotulo: 'Placas Redonda × 1 · R$ 80,00 · vendida em 19/10/2026', pago: false }],
      'PUT /tarefas/16': tarefa,
    });
    renderizar(<Tarefas />, { rota: '/tarefas?tarefa=16', padrao: '/tarefas' });
    const user = userEvent.setup();
    const ligada = await screen.findByLabelText('Ligada a');
    await screen.findByRole('option', { name: /Placas Redonda/ });
    await user.selectOptions(ligada, 'Placas Redonda × 1 · R$ 80,00 · vendida em 19/10/2026');
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toEqual({ placa_venda_id: 5 }));
  });
});

describe('Configurações › Modelos de tarefas', () => {
  it('mostra os modelos com os itens, adiciona item, reordena e exclui modelo com confirmação', async () => {
    const { chamadas } = mockApi({
      'GET /tarefas-modelos': modelos,
      'POST /tarefas-modelos/1/itens': modelos[1],
      'PUT /tarefas-modelos/1/itens/ordem': modelos[1],
      'DELETE /tarefas-modelos/2': null,
      'POST /tarefas-modelos': modelos[0],
    });
    render(<MemoryRouter><ModelosTarefas /></MemoryRouter>);
    const user = userEvent.setup();
    const site = within(await screen.findByRole('article', { name: 'Modelo Site' }));
    expect(site.getAllByRole('listitem')).toHaveLength(3);
    await user.type(site.getByLabelText('Novo item do modelo Site'), 'Gravar vídeo');
    await user.type(site.getByLabelText('Dias após o início do novo item de Site'), '14');
    await user.click(site.getByRole('button', { name: 'Adicionar' }));
    await user.click(site.getByRole('button', { name: 'Descer Site 1' }));
    await user.click(within(screen.getByRole('article', { name: 'Modelo Google Meu Negócio' })).getByRole('button', { name: 'Excluir' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Excluir o modelo "Google Meu Negócio"?' })).getByRole('button', { name: 'Excluir' }));
    await user.type(screen.getByLabelText('Novo modelo'), 'Conteúdo mensal');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Conteúdo');
    await user.click(screen.getByRole('button', { name: 'Criar modelo' }));
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(2));
    expect(chamadas.filter((c) => c.metodo !== 'GET').map((c) => [c.metodo, c.caminho, c.corpo])).toEqual([
      ['POST', '/tarefas-modelos/1/itens', { texto: 'Gravar vídeo', dias_apos_inicio: 14 }],
      ['PUT', '/tarefas-modelos/1/itens/ordem', { ids: [2, 1, 3] }],
      ['DELETE', '/tarefas-modelos/2', undefined],
      ['POST', '/tarefas-modelos', { nome: 'Conteúdo mensal', tipo: 'conteudo' }],
    ]);
  });
});

describe('Caixinha "Criar tarefas do modelo" ao criar', () => {
  it('GMN novo manda o modelo marcado por padrão; desmarcado não manda', async () => {
    mockApi({ 'GET /tarefas-modelos': modelos });
    const onSalvar = vi.fn(async () => {});
    render(<FormGmn clientes={[{ id: 12, nome: 'House' }]} onSalvar={onSalvar} />);
    const user = userEvent.setup();
    const caixa = await screen.findByLabelText('Criar tarefas do modelo Google Meu Negócio (5)');
    expect(caixa).toBeChecked();
    await user.selectOptions(screen.getByLabelText('Cliente'), 'House');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar.mock.calls[0][0]).toMatchObject({ servico: 'google_meu_negocio', modelo_tarefas_id: 2 });
    await user.click(caixa);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar.mock.calls[1][0]).not.toHaveProperty('modelo_tarefas_id');
  });

  it('sem modelos (ou sem carregar) a caixinha não aparece', async () => {
    mockApi({});
    render(<FormGmn clientes={[]} onSalvar={async () => {}} />);
    await screen.findByLabelText('Cliente');
    expect(screen.queryByText(/Criar tarefas do modelo/)).toBeNull();
  });
});
