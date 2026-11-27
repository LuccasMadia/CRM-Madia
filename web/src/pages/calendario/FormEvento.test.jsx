import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { FormEvento } from './FormEvento.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const CLIENTES = [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bia' }];
const PROJETOS = [{ id: 10, titulo: 'Site Ana', cliente_id: 1 }, { id: 20, titulo: 'Site Bia', cliente_id: 2 }];
const EVENTO = { id: 5, titulo: 'Reunião', inicio: '2026-10-05T14:00', fim: '2026-10-05T15:00', dia_inteiro: 0, local: 'Sala 2', notas: 'Levar proposta', cliente_id: 1, projeto_id: null, recorrente: 0, pendente: 0, origem: 'crm' };

function abrir(props = {}) {
  const aoSalvar = vi.fn();
  const aoExcluir = vi.fn();
  render(<MemoryRouter><FormEvento diaInicial="2026-10-15" clientes={CLIENTES} projetos={PROJETOS} onSalvo={aoSalvar} onExcluido={aoExcluir} {...props} /></MemoryRouter>);
  return { aoSalvar, aoExcluir };
}
const mudar = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe('FormEvento', () => {
  it('cria um evento no dia escolhido com horário padrão', async () => {
    const { chamadas } = mockApi({ 'POST /eventos': { ...EVENTO, id: 9 } });
    const { aoSalvar } = abrir();
    expect(screen.getByLabelText('Início')).toHaveValue('2026-10-15T09:00');
    expect(screen.getByLabelText('Fim')).toHaveValue('2026-10-15T10:00');
    await userEvent.setup().type(screen.getByLabelText('Título'), 'Reunião');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Reunião', dia_inteiro: false, inicio: '2026-10-15T09:00', fim: '2026-10-15T10:00', local: null, notas: null, cliente_id: null, projeto_id: null,
    });
  });

  it('dia inteiro troca os campos para datas e envia sem hora', async () => {
    const { chamadas } = mockApi({ 'POST /eventos': EVENTO });
    abrir();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Título'), 'Feriado');
    await user.click(screen.getByLabelText('Dia inteiro'));
    expect(screen.getByLabelText('Início')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Início')).toHaveValue('2026-10-15');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST')).toBe(true));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({ dia_inteiro: true, inicio: '2026-10-15', fim: '2026-10-15' });
  });

  it('fim antes do início é recusado na tela, sem chamar a API', async () => {
    const { chamadas } = mockApi({});
    abrir();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Título'), 'x');
    mudar('Fim', '2026-10-15T08:00');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('O fim não pode ser antes do início')).toBeInTheDocument();
    expect(chamadas).toHaveLength(0);
  });

  it('mostra o erro de validação que vem do servidor', async () => {
    mockApi({ 'POST /eventos': resposta(400, { erros: [{ campo: 'titulo', mensagem: 'Obrigatório' }] }) });
    abrir();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Obrigatório')).toBeInTheDocument();
  });

  it('edita um evento: vem preenchido e salva com PUT', async () => {
    const { chamadas } = mockApi({ 'PUT /eventos/5': { ...EVENTO, titulo: 'Reunião com Ana' } });
    const { aoSalvar } = abrir({ evento: EVENTO });
    expect(screen.getByLabelText('Título')).toHaveValue('Reunião');
    expect(screen.getByLabelText('Local')).toHaveValue('Sala 2');
    expect(screen.getByLabelText('Cliente')).toHaveValue('1');
    const titulo = screen.getByLabelText('Título');
    await userEvent.setup().clear(titulo);
    await userEvent.setup().type(titulo, 'Reunião com Ana');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(aoSalvar).toHaveBeenCalled());
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ titulo: 'Reunião com Ana', cliente_id: 1, local: 'Sala 2' });
  });

  it('o projeto só oferece os do cliente escolhido', async () => {
    abrir();
    const user = userEvent.setup();
    expect(screen.getAllByRole('option', { name: /Site/ })).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Cliente'), '2');
    expect(screen.getAllByRole('option', { name: /Site/ }).map((o) => o.textContent)).toEqual(['Site Bia']);
  });

  it('excluir pede confirmação e apaga', async () => {
    const { chamadas } = mockApi({ 'DELETE /eventos/5': resposta(204) });
    const { aoExcluir } = abrir({ evento: EVENTO });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(chamadas).toHaveLength(0);
    await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: 'Excluir' })[1]);
    await vi.waitFor(() => expect(aoExcluir).toHaveBeenCalled());
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(true);
  });

  it('evento recorrente é somente leitura', () => {
    abrir({ evento: { ...EVENTO, recorrente: 1 } });
    expect(screen.getByText(/somente leitura/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.queryByLabelText('Título')).toBeNull();
    expect(screen.getByText('Reunião')).toBeInTheDocument();
  });

  it('avisa quando o evento ainda não foi enviado ao iCloud', () => {
    abrir({ evento: { ...EVENTO, pendente: 1 } });
    expect(screen.getByText(/ainda não foi enviado ao iCloud/i)).toBeInTheDocument();
  });
});
