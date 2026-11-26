import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartaoSupabase } from './CartaoSupabase.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const REF = 'abcdefghijklmnopqrst';
const projeto = (extra = {}) => ({ id: 5, servico: 'site_sistema', ficticio: 0, privado: 0, supabase_ref: null, ...extra });
const CONECTADO = { conectado: true };
const LISTA = [
  { ref: REF, nome: 'Sistema Ana', regiao: 'sa-east-1', estado: 'no_ar', link: `https://supabase.com/dashboard/project/${REF}` },
  { ref: 'zzzzzzzzzzzzzzzzzzzz', nome: 'Loja Bia', regiao: 'us-east-1', estado: 'pausado', link: 'https://supabase.com/dashboard/project/zzzzzzzzzzzzzzzzzzzz' },
];
const DETALHE = (estado) => ({ encontrado: true, nome: 'Sistema Ana', regiao: 'sa-east-1', estado, link: `https://supabase.com/dashboard/project/${REF}` });

describe('CartaoSupabase', () => {
  it('não aparece em projeto que não é site/sistema', () => {
    mockApi({ 'GET /supabase': CONECTADO });
    const { container } = renderizar(<CartaoSupabase projeto={projeto({ servico: 'conteudo' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem conexão chama para as Configurações', async () => {
    mockApi({ 'GET /supabase': { conectado: false } });
    renderizar(<CartaoSupabase projeto={projeto()} />);
    expect(await screen.findByRole('link', { name: 'Conectar o Supabase' })).toHaveAttribute('href', '/configuracoes');
  });

  it('sem projeto ligado, escolhe na lista e salva (também em projeto fictício)', async () => {
    const { chamadas } = mockApi({
      'GET /supabase': CONECTADO,
      'GET /supabase/projetos': LISTA,
      'PUT /projetos/5': { id: 5, supabase_ref: REF },
      'GET /projetos/5/supabase': DETALHE('no_ar'),
    });
    renderizar(<CartaoSupabase projeto={projeto({ ficticio: 1 })} />);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Projeto do Supabase'), REF);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Sistema Ana')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ supabase_ref: REF });
  });

  it('com projeto ligado mostra nome, região, selo No ar e o botão Abrir no Supabase', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /projetos/5/supabase': DETALHE('no_ar') });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    expect(await screen.findByText('Sistema Ana')).toBeInTheDocument();
    expect(screen.getByText('sa-east-1')).toBeInTheDocument();
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

  it('projeto que sumiu da conta avisa e o link para o painel continua', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /projetos/5/supabase': { encontrado: false } });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    expect(await screen.findByText('Projeto não encontrado na sua conta do Supabase')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Supabase' })).toHaveAttribute('href', `https://supabase.com/dashboard/project/${REF}`);
  });

  it('Supabase fora do ar mostra o erro sem esconder o link', async () => {
    mockApi({ 'GET /supabase': CONECTADO, 'GET /projetos/5/supabase': resposta(502, { erro: 'Não foi possível falar com o Supabase. Verifique a internet.' }) });
    renderizar(<CartaoSupabase projeto={projeto({ supabase_ref: REF })} />);
    expect(await screen.findByText('Não foi possível falar com o Supabase. Verifique a internet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Supabase' })).toBeInTheDocument();
  });
});
