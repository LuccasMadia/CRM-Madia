import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormConteudo } from './FormConteudo.jsx';
import { mockApi } from '../test/mockApi.js';

describe('FormConteudo', () => {
  it('envia estado e arte, sem canal, status nem link', async () => {
    mockApi({ 'GET /projetos': [] });
    const onSalvar = vi.fn();
    render(<FormConteudo onSalvar={onSalvar} />);
    const user = userEvent.setup();
    expect(screen.queryByLabelText('Canal')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Link do post')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Story' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Título'), 'Reels sexta');
    await user.selectOptions(screen.getByLabelText('Estado'), 'pronto');
    const arquivo = new File(['png'], 'arte.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Arte'), arquivo);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Reels sexta', tipo: 'post', estado: 'pronto', projeto_id: null }),
      { arte: arquivo, removerArte: false },
    );
  });

  it('permite remover a arte existente', async () => {
    const onSalvar = vi.fn();
    render(<FormConteudo projetoFixo={5} inicial={{ id: 1, titulo: 'A', tipo: 'post', estado: 'rascunho', arte: 'x.png' }} onSalvar={onSalvar} />);
    const user = userEvent.setup();
    expect(screen.getByRole('img', { name: 'Arte atual' })).toHaveAttribute('src', '/uploads/x.png');
    await user.click(screen.getByRole('button', { name: 'Remover arte' }));
    expect(screen.queryByRole('img', { name: 'Arte atual' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar.mock.calls[0][1]).toEqual({ arte: null, removerArte: true });
  });
});
