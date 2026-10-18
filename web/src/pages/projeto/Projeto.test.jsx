import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Projeto } from './Projeto.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

export const projetoExemplo = {
  id: 5, titulo: 'Site Ana', cliente_id: 1, cliente_nome: 'Ana', etapa: 'andamento', valor_total_centavos: 300000,
  data_inicio: null, prazo_entrega: '2026-10-01', data_entrega: null, descricao: null, notas: null, atualizado_em: 'T1',
};

describe('Projeto', () => {
  it('mostra cabeçalho e salva a visão geral convertendo o valor', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5': projetoExemplo,
      'GET /clientes': [{ id: 1, nome: 'Ana' }],
      'PUT /projetos/5': { ...projetoExemplo, atualizado_em: 'T2' },
    });
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
    expect(put.corpo).toMatchObject({ valor_total_centavos: 350000, cliente_id: 1, etapa: 'andamento' });
    expect(put.corpo).not.toHaveProperty('valor');
  });

  it('troca de aba', async () => {
    mockApi({ 'GET /projetos/5': projetoExemplo, 'GET /clientes': [], 'GET /projetos/5/tarefas': [] });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Tarefas' }));
    expect(await screen.findByText('Nenhuma tarefa ainda.')).toBeInTheDocument();
  });

  it('ativa mensalidade e envia valor/dia convertidos', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5': projetoExemplo,
      'GET /clientes': [{ id: 1, nome: 'Ana' }],
      'PUT /projetos/5': { ...projetoExemplo, mensalidade_ativa: 1, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10, atualizado_em: 'T2' },
    });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Cobra mensalidade'));
    await user.type(screen.getByLabelText('Valor da mensalidade (R$)'), '200');
    await user.type(screen.getByLabelText('Dia de vencimento'), '10');
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo).toMatchObject({ mensalidade_ativa: true, mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 10 });
  });

  it('esconde os campos de mensalidade quando desmarcada', async () => {
    mockApi({ 'GET /projetos/5': projetoExemplo, 'GET /clientes': [] });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    await screen.findByLabelText('Cobra mensalidade');
    expect(screen.queryByLabelText('Valor da mensalidade (R$)')).not.toBeInTheDocument();
  });

  it('marca postou no instagram', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5': projetoExemplo,
      'GET /clientes': [{ id: 1, nome: 'Ana' }],
      'PUT /projetos/5': { ...projetoExemplo, postou_instagram: 1, atualizado_em: 'T2' },
    });
    renderizar(<Projeto />, { rota: '/projetos/5', padrao: '/projetos/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Postou no Instagram'));
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }));
    await screen.findByRole('heading', { name: 'Site Ana' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.corpo).toMatchObject({ postou_instagram: true });
  });
});
