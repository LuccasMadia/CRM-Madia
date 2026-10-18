import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Projeto } from './Projeto.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

export const projetoExemplo = {
  id: 5, titulo: 'Site Ana', cliente_id: 1, cliente_nome: 'Ana', etapa: 'andamento', valor_total_centavos: 300000,
  data_inicio: '2026-09-01', prazo_entrega: '2026-10-01', data_entrega: null, descricao: null, notas: null, atualizado_em: 'T1',
  servico: 'site_sistema', categorias: [{ id: 1, nome: 'Site' }], nicho_id: null, nicho_nome: null,
  mensalidade_ativa: 0, mensalidade_valor_centavos: 0, mensalidade_dia_vencimento: null,
  mensalidade_inicio_modo: 'entrega', mensalidade_inicio_data: null,
};

const rotasBase = (extra = {}) => ({
  'GET /projetos/5': projetoExemplo,
  'GET /clientes': [{ id: 1, nome: 'Ana' }],
  'GET /categorias': [{ id: 1, nome: 'Site' }, { id: 3, nome: 'Sistema' }],
  'GET /nichos': [{ id: 7, nome: 'Barbearia' }],
  'GET /projetos/5/portfolio': { live_url: null, code_url: null, imagens: [] },
  ...extra,
});

describe('Projeto', () => {
  it('mostra cabeçalho e salva a visão geral convertendo o valor', async () => {
    const { chamadas } = mockApi(rotasBase({ 'PUT /projetos/5': { ...projetoExemplo, atualizado_em: 'T2' } }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    expect(await screen.findByRole('heading', { name: 'Site Ana' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/1');

    const user = userEvent.setup();
    const valor = screen.getByLabelText('Valor (R$)');
    expect(valor).toHaveValue('3000,00');
    await user.clear(valor);
    await user.type(valor, '3.500');
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo).toMatchObject({ valor_total_centavos: 350000, cliente_id: 1, categorias: [1], nicho_id: null });
    expect(put.corpo).not.toHaveProperty('etapa');
    expect(put.corpo).not.toHaveProperty('valor');
  });

  it('troca de aba', async () => {
    mockApi(rotasBase({ 'GET /projetos/5/tarefas': [] }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Tarefas' }));
    expect(await screen.findByText('Nenhuma tarefa ainda.')).toBeInTheDocument();
  });

  it('ativa mensalidade e envia valor/dia convertidos', async () => {
    const { chamadas } = mockApi(rotasBase({
      'PUT /projetos/5': { ...projetoExemplo, mensalidade_ativa: 1, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10, atualizado_em: 'T2' },
    }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    await user.type(screen.getByLabelText('Valor da mensalidade (R$)'), '200');
    await user.type(screen.getByLabelText('Dia de vencimento'), '10');
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo).toMatchObject({
      mensalidade_ativa: true, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10, mensalidade_inicio_modo: 'entrega',
    });
  });

  it('esconde os campos de mensalidade quando desmarcada', async () => {
    mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    await screen.findByLabelText('Cobra mensalidade');
    expect(screen.queryByLabelText('Valor da mensalidade (R$)')).not.toBeInTheDocument();
  });

  it('marca postou no instagram', async () => {
    const { chamadas } = mockApi(rotasBase({ 'PUT /projetos/5': { ...projetoExemplo, postou_instagram: 1, atualizado_em: 'T2' } }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Postou no Instagram'));
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo).toMatchObject({ postou_instagram: true });
  });

  it('etapa é só leitura, com link para o Funil', async () => {
    mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    expect(await screen.findByRole('link', { name: 'alterar no Funil' })).toHaveAttribute('href', '/funil');
    expect(screen.queryByLabelText('Etapa')).toBeNull();
  });

  it('desmarcar a última categoria mostra o erro e não salva', async () => {
    const { chamadas } = mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Site' }));
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    expect(await screen.findByText('Escolha pelo menos uma categoria')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);
  });

  it('projeto de GMN salva sem categorias (não tem o seletor)', async () => {
    const gmn = { ...projetoExemplo, titulo: 'GMN Ana', servico: 'google_meu_negocio', categorias: [] };
    const { chamadas } = mockApi(rotasBase({ 'GET /projetos/5': gmn, 'PUT /projetos/5': { ...gmn, atualizado_em: 'T2' } }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'GMN Ana' });
    expect(screen.queryByRole('group', { name: 'Categorias' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'GMN Ana' });
    expect(screen.queryByText('Escolha pelo menos uma categoria')).toBeNull();
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put).toBeDefined();
    expect(put.corpo).not.toHaveProperty('categorias');
  });

  it('a frase da 1ª mensalidade segue o modo escolhido', async () => {
    mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    expect(screen.getByText('Começa quando o projeto for entregue')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Ao entrar em desenvolvimento'));
    expect(screen.getByText('1ª mensalidade em 01/09/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(1);
    await user.click(screen.getByLabelText('A partir de uma data'));
    await user.type(screen.getByLabelText('Data de início da cobrança'), '2026-11-15');
    expect(screen.getByText('1ª mensalidade em 15/11/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(15);
  });

  it('site entregue: marcar "Cobra mensalidade" já preenche o dia com o dia da entrega', async () => {
    mockApi(rotasBase({ 'GET /projetos/5': { ...projetoExemplo, etapa: 'entregue', data_entrega: '2026-09-15' } }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    expect(screen.getByText('1ª mensalidade em 15/09/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(15);
  });

  it('o dia acompanha a data de entrega e o início quando o modo depende deles', async () => {
    mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    await user.type(screen.getByLabelText('Data de entrega'), '2026-10-20');
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(20);
    await user.click(screen.getByLabelText('Ao entrar em desenvolvimento'));
    const inicio = screen.getByLabelText('Início');
    await user.clear(inicio);
    await user.type(inicio, '2026-09-07');
    expect(screen.getByText('1ª mensalidade em 07/09/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(7);
  });

  it('dia digitado não é trocado ao mudar a data de entrega', async () => {
    mockApi(rotasBase());
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    await user.type(screen.getByLabelText('Dia de vencimento'), '3');
    await user.type(screen.getByLabelText('Data de entrega'), '2026-10-20');
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(3);
  });

  it('dia de vencimento já escolhido não é trocado pela data de início', async () => {
    mockApi(rotasBase({ 'GET /projetos/5': { ...projetoExemplo, mensalidade_ativa: 1, mensalidade_valor_centavos: 100, mensalidade_dia_vencimento: 5 } }));
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('A partir de uma data'));
    await user.type(screen.getByLabelText('Data de início da cobrança'), '2026-11-15');
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue(5);
  });
});
