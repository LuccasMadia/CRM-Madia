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
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': projetos });
    abrir();
    const contato = await screen.findByRole('region', { name: 'Contato' });
    expect(within(contato).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(contato).getByText(/2\.500,00/)).toBeInTheDocument();
    expect(screen.queryByText('Loja antiga')).not.toBeInTheDocument();
    await userEvent.setup().click(within(screen.getByRole('region', { name: 'Perdido' })).getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByText('Loja antiga')).toBeInTheDocument();
  });

  it('muda a etapa pelo menu do card', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': projetos, 'PUT /projetos/1': { ...projetos[0], etapa: 'proposta' } });
    abrir();
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Site Ana'), 'proposta');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/1', corpo: { etapa: 'proposta' } });
  });

  it('nova oportunidade: valor inválido não chama a API', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /clientes': [], 'GET /categorias': [{ id: 1, nome: 'Site' }], 'GET /nichos': [] });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.type(screen.getByLabelText('Valor (R$)'), '12,3,4');
    await user.click(await screen.findByRole('button', { name: 'Site' }));
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Valor inválido')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it('nova oportunidade com cliente novo envia novo_cliente e valor em centavos', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 }, 'GET /categorias': [{ id: 1, nome: 'Site' }], 'GET /nichos': [],
    });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.selectOptions(screen.getByLabelText('Cliente'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo cliente'), 'Diego');
    await user.type(screen.getByLabelText('Valor (R$)'), '1.500,50');
    await user.click(await screen.findByRole('button', { name: 'Site' }));
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Site', etapa: 'contato', valor_total_centavos: 150050, prazo_entrega: '', ficticio: false, novo_cliente: { nome: 'Diego' }, categorias: [1], nicho_id: null,
    });
  });

  it('nova oportunidade: marcar "fictício" restringe etapa a andamento/entregue', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /clientes': [], 'GET /categorias': [{ id: 1, nome: 'Site' }], 'GET /nichos': [] });
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
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': projetos, 'GET /projetos?servico=site_sistema&ficticio=1': ficticios });
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
      'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /projetos?servico=site_sistema&ficticio=1': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
      'GET /categorias': [{ id: 1, nome: 'Site' }], 'GET /nichos': [],
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
    await user.click(await screen.findByRole('button', { name: 'Site' }));
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Case Padaria', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: '', ficticio: true, novo_cliente: { nome: 'Case' }, categorias: [1], nicho_id: null,
    });
  });

  it('move um card fictício pelo menu do card', async () => {
    const ficticios = [{ id: 5, titulo: 'Case Padaria', cliente_nome: 'Case', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: null }];
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /projetos?servico=site_sistema&ficticio=1': ficticios, 'PUT /projetos/5': { ...ficticios[0], etapa: 'entregue' },
    });
    abrir();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Fictícios' }));
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Case Padaria'), 'entregue');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/5', corpo: { etapa: 'entregue' } });
  });

  it('nova oportunidade exige categoria e envia categorias, nicho e valor', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
      'GET /categorias': [{ id: 1, nome: 'Site' }, { id: 4, nome: 'SaaS' }], 'GET /nichos': [{ id: 7, nome: 'Barbearia' }],
    });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.type(screen.getByLabelText('Título'), 'Site');
    await user.selectOptions(screen.getByLabelText('Cliente'), '3');
    await user.type(screen.getByLabelText('Valor (R$)'), '1.500');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Escolha pelo menos uma categoria')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'SaaS' }));
    await user.selectOptions(screen.getByLabelText('Nicho'), '7');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Site', etapa: 'contato', prazo_entrega: '', ficticio: false, cliente_id: 3,
      categorias: [4], nicho_id: 7, valor_total_centavos: 150000,
    });
  });

  it('o nome do cliente no card leva ao perfil', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [{ ...projetos[0], cliente_id: 7 }] });
    abrir();
    expect(await screen.findByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/7');
  });
});
