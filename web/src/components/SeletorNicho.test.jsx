import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeletorNicho } from './SeletorNicho.jsx';
import { mockApi, resposta } from '../test/mockApi.js';

function Teste() {
  const [valor, setValor] = useState('');
  return <><SeletorNicho valor={valor} onChange={setValor} /><output>{valor}</output></>;
}

describe('SeletorNicho', () => {
  it('lista os nichos e cria um novo já selecionado', async () => {
    const { rotas, chamadas } = mockApi({ 'GET /nichos': [{ id: 1, nome: 'Barbearia' }], 'POST /nichos': { id: 2, nome: 'Sorveteria' } });
    render(<Teste />);
    const select = await screen.findByLabelText('Nicho');
    expect(await screen.findByRole('option', { name: 'Barbearia' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(select, 'novo');
    rotas['GET /nichos'] = [{ id: 1, nome: 'Barbearia' }, { id: 2, nome: 'Sorveteria' }];
    await user.type(screen.getByLabelText('Nome do novo nicho'), 'Sorveteria');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('2');
    expect(screen.queryByLabelText('Nome do novo nicho')).toBeNull();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ nome: 'Sorveteria' });
  });

  it('nome repetido mostra o erro e mantém o texto', async () => {
    mockApi({ 'GET /nichos': [{ id: 1, nome: 'Barbearia' }], 'POST /nichos': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Já existe' }] }) });
    render(<Teste />);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Nicho'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo nicho'), 'barbearia');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Já existe')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do novo nicho')).toHaveValue('barbearia');
  });

  it('"+ novo nicho…" limpa o nicho escolhido antes e não traz de volta o erro antigo', async () => {
    mockApi({ 'GET /nichos': [{ id: 1, nome: 'Barbearia' }], 'POST /nichos': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Já existe' }] }) });
    render(<Teste />);
    const user = userEvent.setup();
    const select = await screen.findByLabelText('Nicho');
    await screen.findByRole('option', { name: 'Barbearia' });
    await user.selectOptions(select, '1');
    expect(screen.getByRole('status')).toHaveTextContent('1');
    await user.selectOptions(select, 'novo');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText('Nome do novo nicho'), 'barbearia');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Já existe')).toBeInTheDocument();
    await user.selectOptions(select, '1');
    await user.selectOptions(select, 'novo');
    expect(screen.queryByText('Já existe')).toBeNull();
  });
});
