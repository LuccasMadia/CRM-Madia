import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { AvisosConexoes } from './AvisosConexoes.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('AvisosConexoes', () => {
  it('mostra cada alerta como link para as Configurações, perigo e atenção', async () => {
    mockApi({
      'GET /conexoes/atencao': { alertas: [
        { codigo: 'token_falhou', tom: 'perigo', texto: 'Token do GitHub parou de funcionar', para: '/configuracoes' },
        { codigo: 'token_vence', tom: 'atencao', texto: 'Token do Figma vence em 5 dias', para: '/configuracoes' },
      ] },
    });
    renderizar(<AvisosConexoes />);
    const perigo = await screen.findByRole('link', { name: 'Token do GitHub parou de funcionar' });
    expect(perigo).toHaveAttribute('href', '/configuracoes');
    expect(perigo).toHaveClass('pede-atencao__item--perigo');
    expect(screen.getByRole('link', { name: 'Token do Figma vence em 5 dias' })).toHaveClass('pede-atencao__item--atencao');
  });

  it('some quando não há alertas', async () => {
    mockApi({ 'GET /conexoes/atencao': { alertas: [] } });
    const { container } = renderizar(<AvisosConexoes />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('some se a chamada falhar, sem mostrar erro', async () => {
    mockApi({ 'GET /conexoes/atencao': resposta(500, { erro: 'falhou' }) });
    const { container } = renderizar(<AvisosConexoes />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
