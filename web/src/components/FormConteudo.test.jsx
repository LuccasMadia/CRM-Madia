import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormConteudo } from './FormConteudo.jsx';
import { mockApi } from '../test/mockApi.js';

describe('FormConteudo', () => {
  it('envia estado, sem canal, status nem link, e sem segundo argumento de arte', async () => {
    mockApi({ 'GET /projetos': [] });
    const onSalvar = vi.fn();
    render(<FormConteudo onSalvar={onSalvar} />);
    const user = userEvent.setup();
    expect(screen.queryByLabelText('Canal')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Link do post')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Arte')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Story' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Título'), 'Reels sexta');
    await user.selectOptions(screen.getByLabelText('Estado'), 'pronto');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledTimes(1);
    expect(onSalvar.mock.calls[0]).toHaveLength(1);
    expect(onSalvar.mock.calls[0][0]).toEqual(
      expect.objectContaining({ titulo: 'Reels sexta', tipo: 'post', estado: 'pronto', projeto_id: null }),
    );
  });

  it('conteúdo novo pede para salvar antes de adicionar mídias', () => {
    mockApi({ 'GET /projetos': [] });
    render(<FormConteudo onSalvar={vi.fn()} />);
    expect(screen.getByText('Salve o rascunho para adicionar mídias.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Adicionar mídias')).not.toBeInTheDocument();
  });

  it('conteúdo salvo lista as mídias e atualiza a lista após adicionar', async () => {
    const inicial = { id: 1, titulo: 'A', tipo: 'carrossel', estado: 'rascunho', midias: [{ id: 1, url: '/uploads/a.jpg', tipo: 'imagem', ordem: 0 }] };
    const atualizado = { ...inicial, midias: [...inicial.midias, { id: 2, url: '/uploads/b.jpg', tipo: 'imagem', ordem: 1 }] };
    mockApi({ 'POST /conteudos/1/midias': atualizado });
    render(<FormConteudo projetoFixo={5} inicial={inicial} onSalvar={vi.fn()} />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    await userEvent.setup().upload(screen.getByLabelText('Adicionar mídias'), new File(['x'], 'b.png', { type: 'image/png' }));
    expect(await screen.findAllByRole('img')).toHaveLength(2);
  });
});
