import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormPlacaMontagem } from './FormPlacaMontagem.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const rotas = {
  'GET /placas/modelos': [
    { id: 1, nome: 'Placa 10x10', ativo: 1, itens: [{ material_id: 10, quantidade: 1 }, { material_id: 11, quantidade: 1 }] },
    { id: 2, nome: 'Sem receita', ativo: 1, itens: [] },
  ],
  'GET /placas/materiais': [
    { id: 10, nome: 'Placa PVC', ativo: 1 },
    { id: 11, nome: 'Tag NFC', ativo: 1 },
    { id: 12, nome: 'Adesivo', ativo: 1 },
  ],
};

function abrir() {
  mockApi(rotas);
  const enviados = [];
  renderizar(<FormPlacaMontagem onSalvar={(d) => enviados.push(d)} />);
  return { enviados, user: userEvent.setup() };
}

describe('FormPlacaMontagem — materiais usados', () => {
  it('traz os materiais da receita do modelo', async () => {
    abrir();
    await waitFor(() => expect(screen.getByLabelText('Material 1')).toHaveValue('10'));
    expect(screen.getByLabelText('Material 2')).toHaveValue('11');
    expect(screen.getByLabelText('Quantidade por placa 1')).toHaveValue(1);
  });

  it('sem mudança nos materiais, registra direto sem perguntar', async () => {
    const { enviados, user } = abrir();
    await waitFor(() => expect(screen.getByLabelText('Material 1')).toHaveValue('10'));
    await user.click(screen.getByRole('button', { name: 'Registrar montagem' }));
    expect(enviados[0]).toMatchObject({ modelo_id: 1, quantidade: 1 });
    expect(enviados[0].itens).toBeUndefined();
  });

  it('mudou os materiais: pergunta e "Só nesta montagem" não mexe na receita', async () => {
    const { enviados, user } = abrir();
    await waitFor(() => expect(screen.getByLabelText('Material 1')).toHaveValue('10'));
    await user.click(screen.getByRole('button', { name: '+ Material' }));
    await user.selectOptions(screen.getByLabelText('Material 3'), '12');
    await user.click(screen.getByRole('button', { name: 'Registrar montagem' }));
    expect(enviados).toHaveLength(0);
    expect(screen.getByText(/Você mudou os materiais/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Só nesta montagem' }));
    expect(enviados[0].itens).toEqual([
      { material_id: 10, quantidade: 1 }, { material_id: 11, quantidade: 1 }, { material_id: 12, quantidade: 1 },
    ]);
    expect(enviados[0].atualizar_receita).toBe(false);
  });

  it('"Mudar a receita do modelo" envia atualizar_receita', async () => {
    const { enviados, user } = abrir();
    await waitFor(() => expect(screen.getByLabelText('Material 1')).toHaveValue('10'));
    await user.click(screen.getAllByRole('button', { name: 'Remover' })[1]);
    await user.click(screen.getByRole('button', { name: 'Registrar montagem' }));
    await user.click(screen.getByRole('button', { name: 'Mudar a receita do modelo' }));
    expect(enviados[0]).toMatchObject({ itens: [{ material_id: 10, quantidade: 1 }], atualizar_receita: true });
  });

  it('trocar de modelo recarrega os materiais da receita dele', async () => {
    const { user } = abrir();
    await waitFor(() => expect(screen.getByLabelText('Material 1')).toHaveValue('10'));
    await user.selectOptions(screen.getByLabelText('Modelo'), '2');
    expect(screen.queryByLabelText('Material 1')).toBeNull();
    expect(screen.getByText('Este modelo ainda não tem receita. Adicione os materiais usados.')).toBeInTheDocument();
  });
});
