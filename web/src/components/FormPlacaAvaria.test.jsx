import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormPlacaAvaria } from './FormPlacaAvaria.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('FormPlacaAvaria', () => {
  it('pré-carrega os itens com a receita do modelo selecionado, e troca a receita ao trocar de modelo', async () => {
    const modeloA = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, itens: [{ material_id: 1, quantidade: 1 }] };
    const modeloB = { id: 2, nome: 'Placa 10x15 Acrílico', ativo: 1, itens: [{ material_id: 2, quantidade: 1 }] };
    mockApi({
      'GET /placas/modelos': [modeloA, modeloB],
      'GET /placas/materiais': [
        { id: 1, nome: 'Placa 10x10 PVC', ativo: 1 },
        { id: 2, nome: 'Placa 10x15 Acrílico', ativo: 1 },
      ],
    });
    renderizar(<FormPlacaAvaria onSalvar={() => {}} />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Modelo'), '1');
    expect(await screen.findByLabelText('Material do item 1')).toHaveValue('1');

    await user.click(screen.getByRole('button', { name: '+ Item da receita' }));
    expect(screen.getByLabelText('Material do item 2')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Modelo'), '2');
    expect(await screen.findByLabelText('Material do item 1')).toHaveValue('2');
    expect(screen.queryByLabelText('Material do item 2')).not.toBeInTheDocument();
  });

  it('envia os itens editados e os campos do lançamento', async () => {
    const modelo = { id: 1, nome: 'Placa 10x10 PVC', ativo: 1, itens: [{ material_id: 1, quantidade: 1 }] };
    mockApi({
      'GET /placas/modelos': [modelo],
      'GET /placas/materiais': [{ id: 1, nome: 'Placa 10x10 PVC', ativo: 1 }],
    });
    const enviados = [];
    renderizar(<FormPlacaAvaria onSalvar={(dados) => enviados.push(dados)} rotuloBotao="Lançar avaria" />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Modelo'), '1');
    await user.clear(screen.getByLabelText('Quantidade avariada'));
    await user.type(screen.getByLabelText('Quantidade avariada'), '2');
    await user.type(screen.getByLabelText('Observação (opcional)'), 'Quebrou no transporte');
    await user.click(screen.getByRole('button', { name: 'Lançar avaria' }));

    expect(enviados).toEqual([{
      modelo_id: 1,
      quantidade: 2,
      observacao: 'Quebrou no transporte',
      data_avaria: expect.any(String),
      itens: [{ material_id: 1, quantidade: 1 }],
    }]);
  });
});
