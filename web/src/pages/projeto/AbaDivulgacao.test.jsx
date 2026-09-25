import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbaDivulgacao } from './AbaDivulgacao.jsx';
import { mockApi } from '../../test/mockApi.js';

const pf = {
  id: 1, projeto_id: 5, publicar: false, slug: null, titulo_publico: null, descricao_publica: null, stack: [],
  status_publico: null, live_url: null, code_url: null, ordem: 0, atualizado_em: 'T1',
  imagens: [], case_study: [],
};
const projeto = { id: 5, titulo: 'Canecas da Dri' };

describe('AbaDivulgacao', () => {
  it('mostra conteúdos e dados públicos do portfólio juntos', async () => {
    mockApi({
      'GET /conteudos?projeto_id=5': [],
      'GET /projetos/5/portfolio': pf,
    });
    render(<AbaDivulgacao projeto={projeto} />);
    expect(await screen.findByText('Conteúdos deste projeto')).toBeInTheDocument();
    expect(await screen.findByText('Dados públicos')).toBeInTheDocument();
  });
});
