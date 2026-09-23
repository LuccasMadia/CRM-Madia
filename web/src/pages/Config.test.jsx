import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Config } from './Config.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('Config', () => {
  it('mostra o erro de caminho inválido ao lado do campo', async () => {
    mockApi({
      'GET /config': { portfolio_repo_path: null },
      'PUT /config': resposta(400, { erros: [{ campo: 'portfolio_repo_path', mensagem: 'Pasta não encontrada: X' }] }),
    });
    renderizar(<Config />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Caminho da pasta (clone local)'), 'X');
    await user.click(screen.getByRole('button', { name: 'Salvar caminho' }));
    expect(await screen.findByText('Pasta não encontrada: X')).toBeInTheDocument();
  });

  it('prévia com erros lista o que corrigir e não oferece publicar', async () => {
    mockApi({
      'GET /config': { portfolio_repo_path: 'C:/pf' },
      'POST /portfolio/previa': {
        erros: [{ projeto_id: 3, projeto: 'Site', campo: 'imagens', mensagem: 'Adicione ao menos uma imagem' }],
        diff: null,
      },
    });
    renderizar(<Config />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gerar prévia' }));
    expect(await screen.findByText(/Adicione ao menos uma imagem/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('href', '/projetos/3');
    expect(screen.queryByRole('button', { name: 'Confirmar publicação' })).not.toBeInTheDocument();
  });

  it('prévia → confirmar publicação → commitar e enviar', async () => {
    const { chamadas } = mockApi({
      'GET /config': { portfolio_repo_path: 'C:/pf' },
      'POST /portfolio/previa': {
        erros: [],
        diff: {
          adicionados: ['Popy'], removidos: [], alterados: [{ id: 'rango', title: 'Rango', campos: ['description'], imagensAlteradas: 2 }],
          ordemAlterada: false, projectsDelivered: { antes: 3, depois: 4 }, semMudancas: false,
        },
      },
      'POST /portfolio/publicar': { gravado: true, diff: {} },
      'POST /portfolio/git': { commitado: true, saida: '1 file changed' },
    });
    renderizar(<Config />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gerar prévia' }));
    expect(await screen.findByText('Popy')).toBeInTheDocument();
    expect(screen.getByText(/campos description; 2 imagem\(ns\) alterada\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Projetos entregues: 3 → 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar publicação' }));
    expect(await screen.findByText('Arquivos gravados no repositório do portfólio.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Commitar e enviar' }));
    expect(await screen.findByText('1 file changed')).toBeInTheDocument();
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toContain('POST /portfolio/git');
  });

  it('importar mostra o resultado', async () => {
    mockApi({
      'GET /config': { portfolio_repo_path: 'C:/pf' },
      'POST /portfolio/importar': { importados: ['Canecas da Dri'], ignorados: ['Popy'] },
    });
    renderizar(<Config />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Importar do portfólio' }));
    expect(await screen.findByText('Importados: Canecas da Dri. Ignorados: Popy.')).toBeInTheDocument();
  });
});
