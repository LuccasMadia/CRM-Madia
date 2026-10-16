import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaConteudos } from './AbaConteudos.jsx';
import { mockApi } from '../../test/mockApi.js';

const PUBLICADO = {
  id: 'm1', tipo: 'reels', publicado_em: '2026-10-10T15:00:00.000Z', curtidas: 134, capa_url: '/uploads/instagram/m1.jpg',
  permalink: 'https://www.instagram.com/p/abc/', legenda: 'Reels Popy',
};

describe('AbaConteudos', () => {
  it('mostra planejados e publicados do projeto', async () => {
    mockApi({
      'GET /conteudos?projeto_id=5': [{ id: 1, titulo: 'Reels bastidores', tipo: 'reels', estado: 'pronto', data_planejada: null }],
      'GET /instagram/midias?projeto_id=5': [PUBLICADO],
    });
    render(<AbaConteudos projetoId={5} />);
    expect(await screen.findByRole('button', { name: 'Reels bastidores' })).toBeInTheDocument();
    expect(screen.getByText('Pronto')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Abrir no Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/p/abc/');
    expect(screen.getByText('134 curtidas')).toBeInTheDocument();
  });

  it('cria planejado já ligado ao projeto e envia a arte', async () => {
    const { chamadas } = mockApi({
      'GET /conteudos?projeto_id=5': [],
      'GET /instagram/midias?projeto_id=5': [],
      'POST /conteudos': { id: 1 },
      'POST /conteudos/1/arte': { id: 1 },
    });
    render(<AbaConteudos projetoId={5} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Planejar' }));
    expect(screen.queryByLabelText('Projeto (opcional)')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Título'), 'Case no Insta');
    await user.upload(screen.getByLabelText('Arte'), new File(['png'], 'a.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: '+ Planejar' });
    expect(chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/conteudos').corpo).toMatchObject({ titulo: 'Case no Insta', projeto_id: 5 });
    expect(chamadas.find((c) => c.caminho === '/conteudos/1/arte').corpo).toBeInstanceOf(FormData);
  });
});
