import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartaoSupabase } from './CartaoSupabase.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const REF = 'abcdefghijklmnopqrst';
const projeto = (extra = {}) => ({ id: 5, servico: 'site_sistema', ficticio: 0, privado: 0, supabase_ref: null, ...extra });
const CONECTADO = { conectado: true, contas: [{ id: 1, nome: 'Conta 1' }, { id: 2, nome: 'Conta 2' }] };
const LISTA = {
  projetos: [
    { ref: REF, nome: 'Sistema Ana', regiao: 'sa-east-1', estado: 'no_ar', link: `https://supabase.com/dashboard/project/${REF}`, conta: 'Conta 1', conta_id: 1 },
    { ref: 'zzzzzzzzzzzzzzzzzzzz', nome: 'Loja Bia', regiao: 'us-east-1', estado: 'pausado', link: 'https://supabase.com/dashboard/project/zzzzzzzzzzzzzzzzzzzz', conta: 'Conta 2', conta_id: 2 },
  ],
  erros: [],
};
const DETALHE = (estado) => ({ encontrado: true, nome: 'Sistema Ana', regiao: 'sa-east-1', estado, conta: 'Conta 1', link: `https://supabase.com/dashboard/project/${REF}` });

describe('CartaoSupabase', () => {
  it('não aparece em projeto que não é site/sistema', () => {
    mockApi({ 'GET /supabase': CONECTADO });
    const { container } = renderizar(<CartaoSupabase projeto={projeto({ servico: 'conteudo' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem conta chama para as Configurações', async () => {
    mockApi({ 'GET /supabase': { conectado: false, contas: [] } });
    renderizar(<CartaoSupabase projeto={projeto()} />);
    expect(await screen.findByRole('link', { name: 'Conectar o Supabase' })).toHaveAttribute('href', '/configuracoes');
  });

  it('sem projeto ligado, escolhe na lista com o nome da conta e salva (também em projeto fictício)', async () => {
    const { chamadas } = mockApi({
      'GET /supabase': CONECTADO,
      'GET /supabase/projetos': LISTA,
      'PUT /projetos/5': { id: 5, supabase_ref: REF },
      'GET /projetos/5/supabase': DETALHE('no_ar'),
    });
    renderizar(<CartaoSupabase projeto={projeto({ ficticio: 1 })} />);
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Sistema Ana (sa-east-1) · Conta 1' });
    expect(screen.getByRole('option', { name: 'Loja Bia (us-east-1) · Conta 2' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Projeto do Supabase'), REF);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Sistema Ana')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ supabase_ref: REF });
  });

  it('conta com erro aparece como aviso e não esconde os projetos das outras', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /supabase/projetos': { ...LISTA, erros: [{ conta_id: 2, conta: 'Conta 2', erro: 'Token do Supabase inválido ou sem permissão. Cole um novo em Configurações → Supabase.' }] } });
    renderizar(<CartaoSupabase projeto={projeto()} />);
    expect(await screen.findByText('Conta Conta 2: Token do Supabase inválido ou sem permissão. Cole um novo em Configurações → Supabase.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sistema Ana (sa-east-1) · Conta 1' })).toBeInTheDocument();
  });

  it('com projeto ligado mostra nome, região, conta, selo No ar e o botão Abrir no Supabase', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /projetos/5/supabase': DETALHE('no_ar') });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    expect(await screen.findByText('Sistema Ana')).toBeInTheDocument();
    expect(screen.getByText('sa-east-1 · Conta 1')).toBeInTheDocument();
    expect(screen.getByText('No ar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Supabase' })).toHaveAttribute('href', `https://supabase.com/dashboard/project/${REF}`);
  });

  it('projeto pausado mostra o selo Pausado', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /projetos/5/supabase': DETALHE('pausado') });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    expect(await screen.findByText('Pausado')).toHaveClass('etiqueta--atrasada');
  });

  it('Remover tira a ligação e volta à lista', async () => {
    const { chamadas } = mockApi({
      'GET /supabase': CONECTADO, 'GET /supabase/projetos': LISTA, 'GET /projetos/5/supabase': DETALHE('no_ar'), 'PUT /projetos/5': { id: 5, supabase_ref: null },
    });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover' }));
    expect(await screen.findByLabelText('Projeto do Supabase')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ supabase_ref: '' });
  });

  it('projeto que sumiu das contas avisa e o link para o painel continua', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /projetos/5/supabase': { encontrado: false } });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    expect(await screen.findByText('Projeto não encontrado nas suas contas do Supabase')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Supabase' })).toHaveAttribute('href', `https://supabase.com/dashboard/project/${REF}`);
  });

  it('Supabase fora do ar mostra o erro sem esconder o link', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /projetos/5/supabase': resposta(502, { erro: 'Conta Conta 2: Não foi possível falar com o Supabase. Verifique a internet.' }) });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    expect(await screen.findByText('Conta Conta 2: Não foi possível falar com o Supabase. Verifique a internet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Supabase' })).toBeInTheDocument();
  });
});
