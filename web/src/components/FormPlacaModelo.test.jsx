import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormPlacaModelo } from './FormPlacaModelo.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const INICIAL = {
  nome: 'Placa 10x15', preco_venda_centavos: 10000, itens: [],
  packs: [{ quantidade: 2, preco_total_centavos: 18000 }, { quantidade: 3, preco_total_centavos: 25000 }],
};

describe('FormPlacaModelo packs', () => {
  it('mostra os packs existentes e a prévia dos degraus', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    renderizar(<FormPlacaModelo inicial={INICIAL} onSalvar={() => {}} />);
    expect(await screen.findByLabelText('Quantidade do pack 1')).toHaveValue(2);
    expect(screen.getByLabelText('Preço do pack 2')).toHaveValue('250,00');
    expect(screen.getByText('1ª: R$ 100,00 · 2ª: R$ 80,00 · 3ª em diante: R$ 70,00')).toBeInTheDocument();
  });

  it('adiciona, remove e envia packs', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    const enviados = [];
    renderizar(<FormPlacaModelo inicial={INICIAL} onSalvar={(d) => enviados.push(d)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Pack' }));
    await user.clear(screen.getByLabelText('Quantidade do pack 3'));
    await user.type(screen.getByLabelText('Quantidade do pack 3'), '5');
    await user.type(screen.getByLabelText('Preço do pack 3'), '380');
    await user.click(screen.getAllByRole('button', { name: 'Remover pack' })[1]);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados[0].packs).toEqual([
      { quantidade: 2, preco_total_centavos: 18000 },
      { quantidade: 5, preco_total_centavos: 38000 },
    ]);
  });

  it('avisa quando um pack sai mais caro por placa que o anterior', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    renderizar(<FormPlacaModelo inicial={{ ...INICIAL, packs: [{ quantidade: 2, preco_total_centavos: 21000 }] }} onSalvar={() => {}} />);
    expect(await screen.findByText('O pack de 2 sai mais caro por placa que o pack de 1.')).toBeInTheDocument();
  });

  it('valor de pack inválido bloqueia o envio', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    const enviados = [];
    renderizar(<FormPlacaModelo inicial={{ ...INICIAL, packs: [] }} onSalvar={(d) => enviados.push(d)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Pack' }));
    await user.type(screen.getByLabelText('Preço do pack 1'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados).toEqual([]);
  });
});
