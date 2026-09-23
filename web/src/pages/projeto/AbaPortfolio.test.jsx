import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaPortfolio } from './AbaPortfolio.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const pf = {
  id: 1, projeto_id: 5, publicar: false, slug: null, titulo_publico: null, descricao_publica: null, stack: [],
  status_publico: null, live_url: null, code_url: null, ordem: 0, atualizado_em: 'T1',
  imagens: [{ id: 11, arquivo: 'a.png', url: '/uploads/a.png', ordem: 0 }],
  case_study: [{ id: 21, titulo: 'Home', descricao: null, imagem_id: 11, ordem: 0, atualizado_em: 'T1' }],
};
const projeto = { id: 5, titulo: 'Canecas da Dri' };

describe('AbaPortfolio', () => {
  it('sugere slug e salva stack como lista', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/portfolio': pf, 'PUT /projetos/5/portfolio': { ...pf, atualizado_em: 'T2' } });
    render(<AbaPortfolio projeto={projeto} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Publicar no portfólio'));
    await user.click(screen.getByRole('button', { name: 'Gerar slug' }));
    expect(screen.getByLabelText('Slug')).toHaveValue('canecas-da-dri');
    await user.type(screen.getByLabelText('Tecnologias (separadas por vírgula)'), 'Python, Tkinter , ');
    await user.click(screen.getByRole('button', { name: 'Salvar dados públicos' }));
    await screen.findByLabelText('Slug');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({
      publicar: true, slug: 'canecas-da-dri', stack: ['Python', 'Tkinter'], ordem: 0,
    });
  });

  it('mostra o motivo quando a imagem não pode ser removida', async () => {
    mockApi({
      'GET /projetos/5/portfolio': pf,
      'DELETE /portfolio/imagens/11': resposta(409, { erro: 'Esta imagem é usada no case study.' }),
    });
    render(<AbaPortfolio projeto={projeto} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover imagem 1' }));
    expect(await screen.findByText('Esta imagem é usada no case study.')).toBeInTheDocument();
    expect(screen.getByAltText('Imagem 1')).toBeInTheDocument();
  });

  it('envia imagens como multipart no campo "imagens"', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/portfolio': pf, 'POST /projetos/5/portfolio/imagens': pf });
    render(<AbaPortfolio projeto={projeto} />);
    const arquivo = new File(['x'], 'nova.png', { type: 'image/png' });
    // fireEvent em vez de userEvent.upload: o input fica escondido dentro do botão-label.
    fireEvent.change(await screen.findByLabelText('Adicionar imagens'), { target: { files: [arquivo] } });
    await screen.findByAltText('Imagem 1');
    const envio = chamadas.find((c) => c.metodo === 'POST');
    expect(envio.corpo).toBeInstanceOf(FormData);
    expect(envio.corpo.getAll('imagens')).toHaveLength(1);
  });

  it('salva o slide com imagem_id numérico', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/portfolio': pf, 'PUT /portfolio/case-study/21': pf });
    render(<AbaPortfolio projeto={projeto} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Descrição do slide 1'), 'Tela inicial');
    await user.click(screen.getByRole('button', { name: 'Salvar slide 1' }));
    await screen.findByLabelText('Descrição do slide 1');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ titulo: 'Home', descricao: 'Tela inicial', imagem_id: 11 });
  });
});
