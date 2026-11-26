import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartaoFigma } from './CartaoFigma.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const projeto = (extra = {}) => ({ id: 5, servico: 'site_sistema', ficticio: 0, privado: 0, figma_arquivo: null, ...extra });
const CONECTADO = { conectado: true, usuario: 'lucas' };
const DADOS = { encontrado: true, nome: 'Site Ana', editado_em: '2026-11-20T10:00:00Z', url: 'https://www.figma.com/design/AbC123' };

describe('CartaoFigma', () => {
  it('não aparece em projeto que não é site/sistema', () => {
    mockApi({ 'GET /figma': CONECTADO });
    const { container } = renderizar(<CartaoFigma projeto={projeto({ servico: 'conteudo' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem conexão e sem arquivo chama para as Configurações', async () => {
    mockApi({ 'GET /figma': { conectado: false, usuario: null } });
    renderizar(<CartaoFigma projeto={projeto()} />);
    expect(await screen.findByRole('link', { name: 'Conectar o Figma' })).toHaveAttribute('href', '/configuracoes');
  });

  it('sem arquivo, salva o link colado', async () => {
    const { chamadas } = mockApi({
      'GET /figma': CONECTADO,
      'PUT /projetos/5': { id: 5, figma_arquivo: 'AbC123' },
      'GET /projetos/5/figma': DADOS,
    });
    renderizar(<CartaoFigma projeto={projeto({ ficticio: 1 })} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Link do arquivo do Figma'), 'https://www.figma.com/design/AbC123/Site');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Site Ana')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ figma_url: 'https://www.figma.com/design/AbC123/Site' });
  });

  it('mostra o erro do link inválido no campo', async () => {
    mockApi({
      'GET /figma': CONECTADO,
      'PUT /projetos/5': resposta(400, { erros: [{ campo: 'figma_url', mensagem: 'Cole o link de um arquivo do Figma' }] }),
    });
    renderizar(<CartaoFigma projeto={projeto()} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Link do arquivo do Figma'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Cole o link de um arquivo do Figma')).toBeInTheDocument();
  });

  it('com arquivo, mostra nome, data da última edição e o botão Abrir no Figma', async () => {
    mockApi({ 'GET /figma': CONECTADO, 'GET /projetos/5/figma': DADOS });
    renderizar(<CartaoFigma projeto={projeto({ figma_arquivo: 'AbC123' })} />);
    expect(await screen.findByText('Site Ana')).toBeInTheDocument();
    expect(screen.getByText('Editado em 20/11/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Figma' })).toHaveAttribute('href', 'https://www.figma.com/design/AbC123');
  });

  it('Remover tira a ligação e volta ao campo do link', async () => {
    const { chamadas } = mockApi({ 'GET /figma': CONECTADO, 'GET /projetos/5/figma': DADOS, 'PUT /projetos/5': { id: 5, figma_arquivo: null } });
    renderizar(<CartaoFigma projeto={projeto({ figma_arquivo: 'AbC123' })} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover' }));
    expect(await screen.findByLabelText('Link do arquivo do Figma')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ figma_url: '' });
  });

  it('arquivo não encontrado avisa e o link para abrir continua', async () => {
    mockApi({ 'GET /figma': CONECTADO, 'GET /projetos/5/figma': { encontrado: false } });
    renderizar(<CartaoFigma projeto={projeto({ figma_arquivo: 'AbC123' })} />);
    expect(await screen.findByText('Arquivo não encontrado ou sem acesso')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Figma' })).toHaveAttribute('href', 'https://www.figma.com/design/AbC123');
  });

  it('Figma fora do ar mostra o erro sem esconder o link', async () => {
    mockApi({ 'GET /figma': CONECTADO, 'GET /projetos/5/figma': resposta(502, { erro: 'Não foi possível falar com o Figma. Verifique a internet.' }) });
    renderizar(<CartaoFigma projeto={projeto({ figma_arquivo: 'AbC123' })} />);
    expect(await screen.findByText('Não foi possível falar com o Figma. Verifique a internet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Figma' })).toBeInTheDocument();
  });
});
