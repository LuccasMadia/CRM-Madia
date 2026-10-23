import { describe, it, expect } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SitesSistemas } from './SitesSistemas.jsx';
import { Notificacoes } from '../../components/Notificacoes.jsx';
import { mockApi as mockApiBase, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';

const somar = (iso, dias) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

const projetos = [
  { id: 1, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'ideia', valor_total_centavos: 250000, prazo_entrega: '2026-10-01' },
  { id: 2, titulo: 'Loja antiga', cliente_nome: 'Bruno', etapa: 'perdido', valor_total_centavos: 0, prazo_entrega: null },
];

// A faixa "Pede atenção" fica em cima nas duas visões.
const mockApi = (rotas) => mockApiBase({
  'GET /parcelas?servico=site_sistema': [], 'GET /hospedagem/status': [], 'GET /financeiro/mensalidades': { resumo: {}, itens: [] }, ...rotas,
});

const abrir = () => renderizar(<><SitesSistemas /><Notificacoes /></>, { rota: '/servicos?aba=sites&ver=andamento', padrao: '/servicos' });
const mostrar = (user, modo) => user.selectOptions(screen.getByLabelText('Mostrar'), modo);

describe('Sites e Sistemas — visão Em andamento', () => {
  it('mostra cards por etapa, sem as colunas Entregue e Perdido', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': projetos });
    abrir();
    const contato = await screen.findByRole('region', { name: 'Ideia' });
    expect(within(contato).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(contato).getByText(/2\.500,00/)).toBeInTheDocument();
    expect(screen.queryByText('Loja antiga')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Entregue' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Perdido' })).toBeNull();
  });

  it('o menu do card ainda leva para Entregue e Perdido, e avisa para onde foi', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': projetos, 'PUT /projetos/1': { ...projetos[0], etapa: 'entregue' } });
    abrir();
    const mover = await screen.findByLabelText('Mover Site Ana');
    expect(within(mover).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Ideia', 'Protótipo', 'Apresentado', 'Valor definido', 'Em teste', 'Versão final', 'Entregue', 'Perdido']);
    await userEvent.setup().selectOptions(mover, 'entregue');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/1', corpo: { etapa: 'entregue' } });
    expect(await screen.findByText('Site Ana foi para No ar')).toBeInTheDocument();
  });

  it('muda a etapa pelo menu do card', async () => {
    const { chamadas } = mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': projetos, 'PUT /projetos/1': { ...projetos[0], etapa: 'apresentado' } });
    abrir();
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Site Ana'), 'apresentado');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/1', corpo: { etapa: 'apresentado' } });
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
      titulo: 'Site', etapa: 'ideia', valor_total_centavos: 150050, prazo_entrega: '', ficticio: false, novo_cliente: { nome: 'Diego' }, categorias: [1], nicho_id: null,
    });
  });

  it('nova oportunidade: marcar "fictício" restringe etapa a andamento/entregue', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /clientes': [], 'GET /categorias': [{ id: 1, nome: 'Site' }], 'GET /nichos': [] });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.click(screen.getByLabelText('Projeto fictício (só portfólio)'));
    const opcoes = within(screen.getByLabelText('Etapa')).getAllByRole('option').map((o) => o.textContent);
    expect(opcoes).toEqual(['Versão final', 'Entregue']);
  });

  it('"Mostrar: Fictícios" carrega só fictícios e mostra colunas reduzidas', async () => {
    const ficticios = [
      { id: 5, titulo: 'Case Padaria', cliente_nome: 'Case', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: null },
    ];
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': projetos, 'GET /projetos?servico=site_sistema&ficticio=1': ficticios });
    abrir();
    await screen.findByRole('region', { name: 'Ideia' });
    await mostrar(userEvent.setup(), 'ficticios');
    expect(await screen.findByRole('link', { name: 'Case Padaria' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ideia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Apresentado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Perdido' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Versão final' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Entregue' })).toBeInTheDocument();
  });

  it('+ Oportunidade com Fictícios cria com ficticio travado e etapa andamento', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /projetos?servico=site_sistema&ficticio=1': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
      'GET /categorias': [{ id: 1, nome: 'Site' }], 'GET /nichos': [],
    });
    abrir();
    const user = userEvent.setup();
    await mostrar(user, 'ficticios');
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
    await mostrar(userEvent.setup(), 'ficticios');
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
      titulo: 'Site', etapa: 'ideia', prazo_entrega: '', ficticio: false, cliente_id: 3,
      categorias: [4], nicho_id: 7, valor_total_centavos: 150000,
    });
  });

  it('nova oportunidade mostra o erro quando as categorias não carregam', async () => {
    mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [], 'GET /clientes': [], 'GET /nichos': [],
      'GET /categorias': resposta(500, { erro: 'Falha ao carregar as categorias' }),
    });
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    expect(await screen.findByText('Falha ao carregar as categorias')).toBeInTheDocument();
  });

  it('o nome do cliente no card leva ao perfil', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [{ ...projetos[0], cliente_id: 7 }] });
    abrir();
    expect(await screen.findByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/7');
  });

  it('protótipo: o card mostra se está pronto e alterna com um clique', async () => {
    const proto = { id: 4, titulo: 'App Barbearia', cliente_id: 1, cliente_nome: 'Thiago', etapa: 'prototipo', prototipo_pronto: 0, valor_total_centavos: 0, prazo_entrega: null };
    const { chamadas } = mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [proto], 'PUT /projetos/4': { ...proto, prototipo_pronto: 1 } });
    abrir();
    const botao = await screen.findByRole('button', { name: 'Protótipo em construção' });
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(botao);
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')).toMatchObject({ caminho: '/projetos/4', corpo: { prototipo_pronto: true } }));
  });

  it('em teste: sem data pede o início; com data mostra quanto falta ou que acabou', async () => {
    const hoje = hojeISO();
    const base = { cliente_id: 1, cliente_nome: 'Ana', etapa: 'teste', valor_total_centavos: 0, prazo_entrega: null };
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [
        { ...base, id: 5, titulo: 'Sem data', teste_inicio: null },
        { ...base, id: 6, titulo: 'Recente', teste_inicio: somar(hoje, -2) },
        { ...base, id: 7, titulo: 'Antigo', teste_inicio: somar(hoje, -10) },
      ],
      'PUT /projetos/5': { ...base, id: 5, teste_inicio: hoje },
    });
    abrir();
    const coluna = await screen.findByRole('region', { name: 'Em teste' });
    expect(within(coluna).getByText('Faltam 5 dias')).toBeInTheDocument();
    expect(within(coluna).getByText(/Teste acabou/)).toHaveClass('etiqueta--atrasada');
    const campo = within(coluna).getByLabelText('Início do teste de Sem data');
    fireEvent.change(campo, { target: { value: hoje } });
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')).toMatchObject({ caminho: '/projetos/5', corpo: { teste_inicio: hoje } }));
  });

  it('versão final: selo de pagamento pelas parcelas', async () => {
    const base = { cliente_id: 1, cliente_nome: 'Ana', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: null };
    mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [
        { ...base, id: 8, titulo: 'Quitado', parcelas_total: 2, parcelas_pagas: 2 },
        { ...base, id: 9, titulo: 'Parte', parcelas_total: 2, parcelas_pagas: 1 },
        { ...base, id: 10, titulo: 'Nada', parcelas_total: 1, parcelas_pagas: 0 },
        { ...base, id: 11, titulo: 'Sem parcelas', parcelas_total: 0, parcelas_pagas: 0 },
      ],
    });
    abrir();
    const coluna = await screen.findByRole('region', { name: 'Versão final' });
    const card = (titulo) => within(coluna).getByRole('link', { name: titulo }).closest('.kanban__card');
    expect(within(card('Quitado')).getByText('Pago')).toHaveClass('etiqueta--entregue');
    expect(within(card('Parte')).getByText('Pago em parte')).toBeInTheDocument();
    expect(within(card('Nada')).getByText('Aguardando pagamento')).toBeInTheDocument();
    expect(within(card('Sem parcelas')).getByText('Sem parcelas lançadas')).toBeInTheDocument();
  });
});
