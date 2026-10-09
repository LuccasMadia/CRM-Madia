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
    mockApi({ 'GET /projetos?ficticio=0': projetos });
    abrir();
    const contato = await screen.findByRole('region', { name: 'Contato' });
    expect(within(contato).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(contato).getByText(/2\.500,00/)).toBeInTheDocument();
    expect(screen.queryByText('Loja antiga')).not.toBeInTheDocument();
    await userEvent.setup().click(within(screen.getByRole('region', { name: 'Perdido' })).getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByText('Loja antiga')).toBeInTheDocument();
  });

  it('muda a etapa pelo menu do card', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?ficticio=0': projetos, 'PUT /projetos/1': { ...projetos[0], etapa: 'proposta' } });
    abrir();
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Site Ana'), 'proposta');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/1', corpo: { etapa: 'proposta' } });
  });

  it('nova oportunidade: valor inválido não chama a API', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [], 'GET /placas/modelos': [], 'GET /config': {} });
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
    const { chamadas } = mockApi({
      'GET /projetos?ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 }, 'GET /placas/modelos': [], 'GET /config': {},
    });
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
      titulo: 'Site', etapa: 'contato', valor_total_centavos: 150050, prazo_entrega: '', ficticio: false, novo_cliente: { nome: 'Diego' },
    });
  });

  it('nova oportunidade: marcar "fictício" restringe etapa a andamento/entregue', async () => {
    mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [], 'GET /placas/modelos': [], 'GET /config': {} });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.click(screen.getByLabelText('Projeto fictício (só portfólio)'));
    const opcoes = within(screen.getByLabelText('Etapa')).getAllByRole('option').map((o) => o.textContent);
    expect(opcoes).toEqual(['Em andamento', 'Entregue']);
  });

  it('aba Fictícios carrega só fictícios e mostra colunas reduzidas', async () => {
    const ficticios = [
      { id: 5, titulo: 'Case Padaria', cliente_nome: 'Case', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: null },
    ];
    mockApi({ 'GET /projetos?ficticio=0': projetos, 'GET /projetos?ficticio=1': ficticios });
    abrir();
    await screen.findByRole('region', { name: 'Contato' });
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Fictícios' }));
    expect(await screen.findByRole('link', { name: 'Case Padaria' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Contato' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Proposta enviada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Perdido' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Em andamento' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Entregue' })).toBeInTheDocument();
  });

  it('+ Oportunidade na aba Fictícios cria com ficticio travado e etapa andamento', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?ficticio=0': [], 'GET /projetos?ficticio=1': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
      'GET /placas/modelos': [], 'GET /config': {},
    });
    abrir();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Fictícios' }));
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    const checkboxFicticio = screen.getByLabelText('Projeto fictício (só portfólio)');
    expect(checkboxFicticio).toBeChecked();
    expect(checkboxFicticio).toBeDisabled();
    await user.type(screen.getByLabelText('Título'), 'Case Padaria');
    await user.selectOptions(screen.getByLabelText('Cliente'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo cliente'), 'Case');
    await user.type(screen.getByLabelText('Valor (R$)'), '0,00');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Case Padaria', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: '', ficticio: true, novo_cliente: { nome: 'Case' },
    });
  });

  it('move um card fictício pelo menu do card', async () => {
    const ficticios = [{ id: 5, titulo: 'Case Padaria', cliente_nome: 'Case', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: null }];
    const { chamadas } = mockApi({
      'GET /projetos?ficticio=0': [], 'GET /projetos?ficticio=1': ficticios, 'PUT /projetos/5': { ...ficticios[0], etapa: 'entregue' },
    });
    abrir();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Fictícios' }));
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Case Padaria'), 'entregue');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/5', corpo: { etapa: 'entregue' } });
  });

  it('nova oportunidade com serviço marcado esconde o campo Valor manual e envia servicos', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
      'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 },
    });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.selectOptions(screen.getByLabelText('Cliente'), '3');
    await user.click(await screen.findByLabelText('SaaS'));
    expect(screen.queryByLabelText('Valor (R$)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    const corpo = chamadas.find((c) => c.metodo === 'POST').corpo;
    expect(corpo).toEqual({
      titulo: 'Site', etapa: 'contato', prazo_entrega: '', ficticio: false, cliente_id: 3,
      servicos: [{ tipo: 'saas', valor_unitario_centavos: 15000 }], desconto_centavos: 0,
    });
    expect(corpo).not.toHaveProperty('valor_total_centavos');
  });

  it('desmarcar o único serviço volta a mostrar o campo Valor manual', async () => {
    mockApi({
      'GET /projetos?ficticio=0': [], 'GET /clientes': [], 'GET /placas/modelos': [], 'GET /config': { preco_servico_saas_centavos: 15000 },
    });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    const checkboxSaas = await screen.findByLabelText('SaaS');
    await user.click(checkboxSaas);
    expect(screen.queryByLabelText('Valor (R$)')).not.toBeInTheDocument();
    await user.click(checkboxSaas);
    expect(screen.getByLabelText('Valor (R$)')).toBeInTheDocument();
  });
});
