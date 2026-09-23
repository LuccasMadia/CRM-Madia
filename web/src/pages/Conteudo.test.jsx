import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Conteudo } from './Conteudo.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { formatarData, hojeISO } from '../lib/datas.js';

const hoje = hojeISO();
const conteudos = [
  { id: 1, titulo: 'Carrossel do case', canal: 'instagram', tipo: 'carrossel', status: 'ideia', data_planejada: hoje, projeto_id: null },
  { id: 2, titulo: 'Atualizar Popy', canal: 'portfolio', tipo: 'atualizacao', status: 'produzindo', data_planejada: null, projeto_id: null },
];
const abrir = () => renderizar(<Conteudo />, { rota: '/conteudo', padrao: '/conteudo' });

describe('Conteudo', () => {
  it('muda o status pelo kanban', async () => {
    const { chamadas } = mockApi({ 'GET /conteudos': conteudos, 'PUT /conteudos/1': {} });
    abrir();
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Carrossel do case'), 'agendado');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toMatchObject({ caminho: '/conteudos/1', corpo: { status: 'agendado' } });
  });

  it('filtra por canal', async () => {
    const { chamadas } = mockApi({ 'GET /conteudos': conteudos, 'GET /conteudos?canal=instagram': [conteudos[0]] });
    abrir();
    await userEvent.setup().selectOptions(await screen.findByLabelText('Canal'), 'instagram');
    await screen.findByText('Carrossel do case');
    expect(chamadas.at(-1).caminho).toBe('/conteudos?canal=instagram');
  });

  it('calendário mostra itens no dia e os sem data à parte', async () => {
    mockApi({ 'GET /conteudos': conteudos });
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Calendário' }));
    const dia = screen.getByLabelText(formatarData(hoje));
    expect(within(dia).getByRole('button', { name: 'Carrossel do case' })).toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: 'Sem data' })).getByText('Atualizar Popy')).toBeInTheDocument();
  });

  it('cria conteúdo solto', async () => {
    const { chamadas } = mockApi({ 'GET /conteudos': [], 'GET /projetos': [], 'POST /conteudos': { id: 3 } });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Conteúdo' }));
    await user.type(screen.getByLabelText('Título / ideia'), 'Reels bastidores');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'reels');
    await user.click(screen.getByRole('button', { name: 'Salvar conteúdo' }));
    await screen.findByRole('button', { name: '+ Conteúdo' });
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      titulo: 'Reels bastidores', canal: 'instagram', tipo: 'reels', status: 'ideia', projeto_id: null,
    });
  });
});
