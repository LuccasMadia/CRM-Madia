import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaHospedagem } from './AbaHospedagem.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const projeto = { id: 5, titulo: 'Site Ana', servico: 'site_sistema', ficticio: 0 };
const vazio = { hospedagem: null, pausas: [], cobranca: null };
const noAr = {
  tipo: 'vercel', url: 'https://ana.com.br', vercel_projeto_id: 'prj_1', vercel_projeto_nome: 'ana', status: 'no_ar',
  status_desde: '2026-11-10T10:00:00.000Z', ultimo_motivo: null, ultima_checagem: '2026-11-20T10:00:00.000Z', cliente_avisado_em: null,
};
const projetosVercel = [{ id: 'prj_1', nome: 'rango-do-bicho-site' }];
const estado = { conectado: true, prazo_dias: 7 };

describe('AbaHospedagem', () => {
  it('salva o cadastro com a Vercel', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5/hospedagem': vazio,
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
      'PUT /projetos/5/hospedagem': { ...vazio, hospedagem: noAr },
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Endereço do site'), 'rangodobicho.com.br');
    await user.selectOptions(await screen.findByLabelText('Projeto da Vercel'), 'prj_1');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('No ar');
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put.caminho).toBe('/projetos/5/hospedagem');
    expect(put.corpo).toEqual({ tipo: 'vercel', url: 'rangodobicho.com.br', vercel_projeto_id: 'prj_1', vercel_projeto_nome: 'rango-do-bicho-site' });
  });

  it('erro da lista de projetos que nao e 409 mostra a mensagem do erro', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': vazio,
      'GET /vercel/projetos': resposta(502, { erro: 'Token da Vercel inválido ou sem permissão.' }),
      'GET /vercel/estado': estado,
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    expect(await screen.findByText('Token da Vercel inválido ou sem permissão.')).toBeInTheDocument();
    expect(screen.queryByText(/Conecte a Vercel/)).toBeNull();
  });

  it('pausa feita direto na Vercel aparece como "Pausado na Vercel"', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': { ...vazio, hospedagem: { ...noAr, status: 'pausado', pausado_por_crm: false } },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    expect(await screen.findByText(/^Pausado na Vercel desde/)).toBeInTheDocument();
  });

  it('sem Vercel conectada avisa e deixa salvar só com o endereço', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5/hospedagem': vazio,
      'GET /vercel/projetos': resposta(409, { erro: 'Conecte a Vercel em Configurações.' }),
      'GET /vercel/estado': { conectado: false, prazo_dias: 7 },
      'PUT /projetos/5/hospedagem': { ...vazio, hospedagem: noAr },
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    const user = userEvent.setup();
    expect(await screen.findByText('Conecte a Vercel em Configurações para escolher o projeto.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Endereço do site'), 'ana.com.br');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('No ar');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ tipo: 'vercel', url: 'ana.com.br', vercel_projeto_id: null, vercel_projeto_nome: null });
  });

  it('mostra erro do endereço no campo', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': vazio,
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
      'PUT /projetos/5/hospedagem': resposta(400, { erros: [{ campo: 'url', mensagem: 'Endereço inválido' }] }),
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Endereço do site'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Endereço inválido')).toBeInTheDocument();
  });

  it('Tirar do ar confirma e pausa; mostra o histórico', async () => {
    const pausado = { ...noAr, status: 'pausado', status_desde: '2026-11-20T17:05:00.000Z' };
    const { chamadas } = mockApi({
      'GET /projetos/5/hospedagem': { hospedagem: noAr, pausas: [], cobranca: null },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
      'POST /projetos/5/hospedagem/pausar': { hospedagem: pausado, pausas: [{ acao: 'pausou', em: '2026-11-20T17:05:00.000Z' }], cobranca: null },
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tirar do ar' }));
    expect(screen.getByText('Tirar Site Ana do ar?')).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/ana\.com\.br/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Tirar do ar' }).at(-1));
    expect(await screen.findByText(/Tirado do ar em/)).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/projetos/5/hospedagem/pausar')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Tirar do ar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeInTheDocument();
  });

  it('erro da Vercel aparece no diálogo e o diálogo continua aberto', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': { hospedagem: noAr, pausas: [], cobranca: null },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
      'POST /projetos/5/hospedagem/pausar': resposta(502, { erro: 'Token da Vercel inválido ou sem permissão. Cole um novo em Configurações → Vercel.' }),
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tirar do ar' }));
    await user.click(screen.getAllByRole('button', { name: 'Tirar do ar' }).at(-1));
    expect(await screen.findByText(/Token da Vercel inválido/)).toBeInTheDocument();
    expect(screen.getByText('Tirar Site Ana do ar?')).toBeInTheDocument();
  });

  it('Avisei o cliente manda o POST e mostra a data do aviso', async () => {
    const atrasada = { fase: 'atrasada', atrasada_desde: '2026-11-10', valor_centavos: 20000, avisado_em: null, prazo_ate: null };
    const avisada = { ...atrasada, fase: 'avisado', avisado_em: '2026-11-20', prazo_ate: '2026-11-27' };
    const { chamadas } = mockApi({
      'GET /projetos/5/hospedagem': { hospedagem: noAr, pausas: [], cobranca: atrasada },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
      'POST /projetos/5/hospedagem/avisei': { hospedagem: { ...noAr, cliente_avisado_em: '2026-11-20' }, pausas: [], cobranca: avisada },
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    const user = userEvent.setup();
    expect(await screen.findByText(/Mensalidade de .*200,00 atrasada desde 10\/11\/2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Avisei o cliente' }));
    expect(await screen.findByText(/Cliente avisado em 20\/11\/2026 — prazo até 27\/11\/2026/)).toBeInTheDocument();
    expect(chamadas.some((c) => c.caminho === '/projetos/5/hospedagem/avisei' && c.metodo === 'POST')).toBe(true);
  });

  it('prazo vencido mostra a frase com os dias do prazo', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': { hospedagem: noAr, pausas: [], cobranca: { fase: 'prazo_vencido', atrasada_desde: '2026-11-01', valor_centavos: 100, avisado_em: '2026-11-10', prazo_ate: '2026-11-17' } },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    expect(await screen.findByText('Prazo de 7 dias venceu — tirar do ar?')).toBeInTheDocument();
  });

  it('pago_pausado pergunta se coloca no ar', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': { hospedagem: { ...noAr, status: 'pausado' }, pausas: [], cobranca: { fase: 'pago_pausado', atrasada_desde: null, valor_centavos: 0, avisado_em: null, prazo_ate: null } },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    expect(await screen.findByText('Pago — colocar no ar?')).toBeInTheDocument();
  });

  it('fictício não mostra Tirar do ar', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': { hospedagem: noAr, pausas: [], cobranca: null },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
    });
    renderizar(<AbaHospedagem projeto={{ ...projeto, ficticio: 1 }} />);
    await screen.findByText('No ar');
    expect(screen.queryByRole('button', { name: 'Tirar do ar' })).toBeNull();
  });

  it('fora do ar mostra o motivo', async () => {
    mockApi({
      'GET /projetos/5/hospedagem': { hospedagem: { ...noAr, status: 'fora_do_ar', ultimo_motivo: 'Erro 503' }, pausas: [], cobranca: null },
      'GET /vercel/projetos': projetosVercel,
      'GET /vercel/estado': estado,
    });
    renderizar(<AbaHospedagem projeto={projeto} />);
    expect(await screen.findByText('Erro 503')).toBeInTheDocument();
    expect(screen.getByText(/Última checagem:/)).toBeInTheDocument();
  });
});
