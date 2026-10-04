import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { FormPlacaLote } from './FormPlacaLote.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('FormPlacaLote', () => {
  it('sugere nomes de lote já usados via datalist, sem travar texto livre', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    renderizar(<FormPlacaLote onSalvar={() => {}} sugestoesNomeLote={['Compra Agosto', 'Compra Outubro']} />);
    const campo = await screen.findByLabelText('Nome do lote (opcional)');
    expect(campo).toHaveAttribute('list', 'lista-nomes-lote');
    const opcoes = [...document.querySelectorAll('#lista-nomes-lote option')].map((o) => o.value);
    expect(opcoes).toEqual(['Compra Agosto', 'Compra Outubro']);
  });
});
