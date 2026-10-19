import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicarConteudo } from './PublicarConteudo.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { localParaIso } from '../lib/datas.js';

const base = { id: 7, titulo: 'T', tipo: 'post', estado: 'rascunho', legenda: 'Oi mundo', capa_url: '/uploads/a.jpg', midias: [] };

afterEach(() => vi.useRealTimers());

describe('PublicarConteudo', () => {
  it('rascunho mostra prévia e publica agora', async () => {
    const publicando = { ...base, estado: 'publicando' };
    const { chamadas } = mockApi({ 'POST /conteudos/7/publicar': publicando });
    const onMudou = vi.fn();
    render(<PublicarConteudo conteudo={base} onMudou={onMudou} />);
    expect(screen.getByText('Oi mundo')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publicar agora no Instagram' }));
    expect(chamadas[0]).toMatchObject({ metodo: 'POST', caminho: '/conteudos/7/publicar' });
    expect(onMudou).toHaveBeenCalledWith(publicando);
  });

  it('agenda enviando o horário digitado em ISO', async () => {
    const agendado = { ...base, estado: 'agendado', agendado_para: localParaIso('2026-10-20T18:00') };
    const { chamadas } = mockApi({ 'POST /conteudos/7/agendar': agendado });
    const onMudou = vi.fn();
    render(<PublicarConteudo conteudo={base} onMudou={onMudou} />);
    fireEvent.change(screen.getByLabelText('Agendar para'), { target: { value: '2026-10-20T18:00' } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Agendar' }));
    expect(chamadas[0].corpo).toEqual({ agendado_para: localParaIso('2026-10-20T18:00') });
    expect(onMudou).toHaveBeenCalledWith(agendado);
  });

  it('sem horário não chama a API e pede a data', async () => {
    const { chamadas } = mockApi({});
    render(<PublicarConteudo conteudo={base} onMudou={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Agendar' }));
    expect(chamadas).toHaveLength(0);
    expect(await screen.findByText('Escolha data e hora.')).toBeInTheDocument();
  });

  it('400 em agendado_para aparece no campo', async () => {
    mockApi({ 'POST /conteudos/7/agendar': resposta(400, { erros: [{ campo: 'agendado_para', mensagem: 'Escolha um horário no futuro.' }] }) });
    render(<PublicarConteudo conteudo={base} onMudou={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Agendar para'), { target: { value: '2020-01-01T10:00' } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Agendar' }));
    expect(await screen.findByText('Escolha um horário no futuro.')).toBeInTheDocument();
  });

  it('erro de validação de publicação é mostrado', async () => {
    mockApi({ 'POST /conteudos/7/publicar': resposta(400, { erros: [{ campo: 'publicacao', mensagem: 'Adicione ao menos uma mídia.' }] }) });
    render(<PublicarConteudo conteudo={base} onMudou={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publicar agora no Instagram' }));
    expect(await screen.findByText('Adicione ao menos uma mídia.')).toBeInTheDocument();
  });

  it('falhou mostra o erro e Tentar de novo chama /publicar', async () => {
    const { chamadas } = mockApi({ 'POST /conteudos/7/publicar': { ...base, estado: 'publicando' } });
    render(<PublicarConteudo conteudo={{ ...base, estado: 'falhou', publicacao_erro: 'Token expirou' }} onMudou={vi.fn()} />);
    expect(screen.getByText('Token expirou')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(chamadas[0].caminho).toBe('/conteudos/7/publicar');
  });

  it('agendado mostra data e permite cancelar', async () => {
    const agendado = { ...base, estado: 'agendado', agendado_para: localParaIso('2026-10-20T18:00') };
    const { chamadas } = mockApi({ 'DELETE /conteudos/7/agendamento': base });
    const onMudou = vi.fn();
    render(<PublicarConteudo conteudo={agendado} onMudou={onMudou} />);
    expect(screen.getByText(/Agendado para 20\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar agendamento' }));
    expect(chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: '/conteudos/7/agendamento' });
    expect(onMudou).toHaveBeenCalledWith(base);
  });

  it('publicando consulta o conteúdo a cada 5 s até mudar', async () => {
    vi.useFakeTimers();
    const publicado = { ...base, estado: 'publicado' };
    const { chamadas } = mockApi({ 'GET /conteudos/7': publicado });
    const onMudou = vi.fn();
    render(<PublicarConteudo conteudo={{ ...base, estado: 'publicando' }} onMudou={onMudou} />);
    expect(screen.getByText('Publicando…')).toBeInTheDocument();
    expect(chamadas).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(chamadas[0]).toMatchObject({ metodo: 'GET', caminho: '/conteudos/7' });
    expect(onMudou).toHaveBeenCalledWith(publicado);
  });

  it('publicando que continua publicando não chama onMudou e para ao desmontar', async () => {
    vi.useFakeTimers();
    const { chamadas } = mockApi({ 'GET /conteudos/7': { ...base, estado: 'publicando' } });
    const onMudou = vi.fn();
    const { unmount } = render(<PublicarConteudo conteudo={{ ...base, estado: 'publicando' }} onMudou={onMudou} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(onMudou).not.toHaveBeenCalled();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(chamadas).toHaveLength(1);
  });

  it('publicado sem permalink avisa que aparece no grid', () => {
    render(<PublicarConteudo conteudo={{ ...base, estado: 'publicado' }} onMudou={vi.fn()} />);
    expect(screen.getByText(/aparece no grid após a próxima atualização/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publicar agora/ })).not.toBeInTheDocument();
  });

  it('publicado com permalink mostra o link', () => {
    render(<PublicarConteudo conteudo={{ ...base, estado: 'publicado', permalink: 'https://instagram.com/p/x' }} onMudou={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Abrir no Instagram' })).toHaveAttribute('href', 'https://instagram.com/p/x');
  });
});
