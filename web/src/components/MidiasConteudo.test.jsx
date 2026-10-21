import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MidiasConteudo } from './MidiasConteudo.jsx';
import { mockApi, resposta } from '../test/mockApi.js';

const midia = (id, ordem, tipo = 'imagem') => ({ id, url: `/uploads/m${id}.${tipo === 'video' ? 'mp4' : 'jpg'}`, tipo, largura: 10, altura: 10, ordem });
const conteudo = (extra = {}) => ({ id: 3, tipo: 'carrossel', midias: [midia(1, 0), midia(2, 1)], ...extra });

afterEach(() => vi.unstubAllGlobals());

describe('MidiasConteudo', () => {
  it('reordena: → na primeira troca os ids e devolve o conteúdo atualizado', async () => {
    const atualizado = conteudo({ midias: [midia(2, 0), midia(1, 1)] });
    const { chamadas } = mockApi({ 'PUT /conteudos/3/midias/ordem': atualizado });
    const onMudou = vi.fn();
    render(<MidiasConteudo conteudo={conteudo()} onMudou={onMudou} />);
    await userEvent.setup().click(screen.getAllByRole('button', { name: /Mover para depois/ })[0]);
    expect(chamadas[0].corpo).toEqual({ ids: [2, 1] });
    expect(onMudou).toHaveBeenCalledWith(atualizado);
  });

  it('não oferece ← na primeira nem → na última', () => {
    render(<MidiasConteudo conteudo={conteudo()} onMudou={() => {}} />);
    expect(screen.getAllByRole('button', { name: /Mover para antes/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Mover para depois/ })).toHaveLength(1);
  });

  it('remove uma mídia', async () => {
    const atualizado = conteudo({ midias: [midia(1, 0)] });
    const { chamadas } = mockApi({ 'DELETE /conteudos/3/midias/2': atualizado });
    const onMudou = vi.fn();
    render(<MidiasConteudo conteudo={conteudo()} onMudou={onMudou} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /Remover mídia/ })[1]);
    expect(chamadas).toHaveLength(0); // pergunta antes de apagar
    await user.click(within(screen.getByRole('dialog', { name: 'Remover a mídia 2?' })).getByRole('button', { name: 'Remover' }));
    expect(chamadas[0].metodo).toBe('DELETE');
    expect(onMudou).toHaveBeenCalledWith(atualizado);
  });

  it('escolher arquivos envia POST multipart', async () => {
    const { chamadas } = mockApi({ 'POST /conteudos/3/midias': conteudo() });
    const onMudou = vi.fn();
    render(<MidiasConteudo conteudo={conteudo()} onMudou={onMudou} />);
    const input = screen.getByLabelText('Adicionar mídias');
    expect(input).toHaveAttribute('multiple');
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    await userEvent.setup().upload(input, new File(['x'], 'a.png', { type: 'image/png' }));
    expect(chamadas[0].corpo).toBeInstanceOf(FormData);
    expect(chamadas[0].corpo.getAll('midias')).toHaveLength(1);
    expect(onMudou).toHaveBeenCalled();
  });

  it('reels aceita só vídeo e mostra <video muted>', () => {
    const { container } = render(<MidiasConteudo conteudo={conteudo({ tipo: 'reels', midias: [midia(1, 0, 'video')] })} onMudou={() => {}} />);
    expect(screen.getByLabelText('Adicionar mídias')).toHaveAttribute('accept', 'video/mp4,video/quicktime');
    expect(container.querySelector('video').muted).toBe(true);
  });

  it('fora do PC não há input e aparece o aviso', () => {
    vi.stubGlobal('location', { ...window.location, hostname: 'crm.luccasmadia.com.br' });
    render(<MidiasConteudo conteudo={conteudo()} onMudou={() => {}} />);
    expect(screen.queryByLabelText('Adicionar mídias')).not.toBeInTheDocument();
    expect(screen.getByText('Suba a mídia pelo PC.')).toBeInTheDocument();
  });

  it.each(['publicando', 'publicado'])('em %s mostra as mídias sem botões de mover, remover nem envio', (estado) => {
    render(<MidiasConteudo conteudo={conteudo({ estado })} onMudou={() => {}} />);
    expect(screen.getByAltText('Mídia 1')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Adicionar mídias')).not.toBeInTheDocument();
    expect(screen.queryByText('Suba a mídia pelo PC.')).not.toBeInTheDocument();
  });

  it('mostra a mensagem do erro 400 do servidor', async () => {
    mockApi({ 'POST /conteudos/3/midias': resposta(400, { erros: [{ campo: 'midias', mensagem: 'Carrossel não aceita vídeo' }] }) });
    const onMudou = vi.fn();
    render(<MidiasConteudo conteudo={conteudo()} onMudou={onMudou} />);
    await userEvent.setup().upload(screen.getByLabelText('Adicionar mídias'), new File(['x'], 'a.png', { type: 'image/png' }));
    expect(await screen.findByText('Carrossel não aceita vídeo')).toBeInTheDocument();
    expect(onMudou).not.toHaveBeenCalled();
  });
});
