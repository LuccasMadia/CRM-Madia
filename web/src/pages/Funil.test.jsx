import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Funil } from './Funil.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const projetos = [
  { id: 1, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'contato', valor_total_centavos: 250000, prazo_entrega: '2026-10-01' },
  { id: 2, titulo: 'Loja antiga', cliente_nome: 'Bruno', etapa: 'perdido', valor_total_centavos: 0, prazo_entrega: null },
];

const abrir = () => renderizar(<Funil />, { rota: '/funil', padrao: '/funil' });

describe('Funil', () => {
  it('mostra cards por etapa e recolhe "Perdido"', async () => {
    mockApi({ 'GET /projetos': projetos });
    abrir();
    const contato = await screen.findByRole('region', { name: 'Contato' });
    expect(within(contato).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(contato).getByText(/2\.500,00/)).toBeInTheDocument();
    expect(screen.queryByText('Loja antiga')).not.toBeInTheDocument();
    await userEvent.setup().click(within(screen.getByRole('region', { name: 'Perdido' })).getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByText('Loja antiga')).toBeInTheDocument();
  });

  it('muda a etapa pelo menu do card', async () => {
    const { chamadas } = mockApi({ 'GET /projetos': projetos, 'PUT /projetos/1': { ...projetos[0], etapa: 'proposta' } });
    abrir();
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Site Ana'), 'proposta');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/1', corpo: { etapa: 'proposta' } });
  });

  it('nova oportunidade: valor inválido não chama a API', async () => {
    const { chamadas } = mockApi({ 'GET /projetos': [], 'GET /clientes': [] });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.type(screen.getByLabelText('Valor (R$)'), '12,3,4');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Valor inválido')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it('nova oportunidade com cliente novo envia novo_cliente e valor em centavos', async () => {
    const { chamadas } = mockApi({ 'GET /projetos': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 } });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.selectOptions(screen.getByLabelText('Cliente'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo cliente'), 'Diego');
    await user.type(screen.getByLabelText('Valor (R$)'), '1.500,50');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Site', etapa: 'contato', valor_total_centavos: 150050, prazo_entrega: '', novo_cliente: { nome: 'Diego' },
    });
  });
});
