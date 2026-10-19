import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvisosPublicacao } from './AvisosPublicacao.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ATRASADO = { id: 4, titulo: 'Reels de sexta', estado: 'atrasado', agendado_para: '2026-10-19T12:00:00.000Z' };
const FALHA = { id: 5, titulo: 'Post da promo', estado: 'falhou', publicacao_erro: 'O token não tem permissão para publicar.' };

describe('AvisosPublicacao', () => {
  it('sem avisos não renderiza nada', async () => {
    const { chamadas } = mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [] } });
    const { container } = renderizar(<AvisosPublicacao />);
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });

  it('falha ao carregar os avisos mostra o erro', async () => {
    mockApi({ 'GET /conteudos/avisos': resposta(500, { erro: 'Falhou' }) });
    renderizar(<AvisosPublicacao />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
  });

  it('atrasado mostra título e ações; voltar para rascunho chama DELETE e recarrega', async () => {
    let avisos = { atrasados: [ATRASADO], falhas: [] };
    const { chamadas } = mockApi({
      'GET /conteudos/avisos': () => avisos,
      'DELETE /conteudos/4/agendamento': () => {
        avisos = { atrasados: [], falhas: [] };
        return { id: 4, estado: 'rascunho' };
      },
    });
    const onMudou = vi.fn();
    renderizar(<AvisosPublicacao onMudou={onMudou} />);
    expect(await screen.findByText('1 post agendado não saiu no horário')).toBeInTheDocument();
    expect(screen.getByText('Reels de sexta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar agora' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reagendar' })).toHaveAttribute('href', '/conteudo?abrir=4');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voltar para rascunho' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/conteudos/4/agendamento')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Reels de sexta')).not.toBeInTheDocument());
    expect(onMudou).toHaveBeenCalled();
  });

  it('plural nos atrasados e Reagendar chama onAbrir', async () => {
    mockApi({ 'GET /conteudos/avisos': { atrasados: [ATRASADO, { ...ATRASADO, id: 6, titulo: 'Outro' }], falhas: [] } });
    const onAbrir = vi.fn();
    renderizar(<AvisosPublicacao onAbrir={onAbrir} />);
    expect(await screen.findByText('2 posts agendados não saíram no horário')).toBeInTheDocument();
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
  });

  it('Publicar agora mostra o erro da API', async () => {
    mockApi({
      'GET /conteudos/avisos': { atrasados: [ATRASADO], falhas: [] },
      'POST /conteudos/4/publicar': resposta(400, { erros: [{ campo: 'publicacao', mensagem: 'Falta a mídia.' }] }),
    });
    renderizar(<AvisosPublicacao />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publicar agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta a mídia.');
  });

  it('falha mostra o erro e Tentar de novo publica', async () => {
    const { chamadas } = mockApi({
      'GET /conteudos/avisos': { atrasados: [], falhas: [FALHA] },
      'POST /conteudos/5/publicar': resposta(202, { id: 5, estado: 'publicando' }),
    });
    renderizar(<AvisosPublicacao />);
    expect(await screen.findByText('1 publicação falhou')).toBeInTheDocument();
    expect(screen.getByText('Post da promo')).toBeInTheDocument();
    expect(screen.getByText('O token não tem permissão para publicar.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/conteudos/5/publicar')).toBe(true));
  });

  it('falha tem Abrir: chama onAbrir quando existe, senão é link para o Conteúdo', async () => {
    mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [FALHA] } });
    const onAbrir = vi.fn();
    const { unmount } = renderizar(<AvisosPublicacao onAbrir={onAbrir} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Abrir' }));
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
    unmount();

    renderizar(<AvisosPublicacao />);
    expect(await screen.findByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/conteudo?abrir=5');
  });
});
