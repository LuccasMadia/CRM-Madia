import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabelaPrecos } from './TabelaPrecos.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const tabela = {
  servicos: [
    { id: 1, nome: 'Landing page', frase: 'Uma página', tipo: 'comum', valor_unico_centavos: 60000, valor_mensal_centavos: 0, hospedagem: 'opcional', ordem: 0, ativo: 1 },
    { id: 2, nome: 'Configuração do Google Meu Negócio', frase: '', tipo: 'gmn_config', valor_unico_centavos: 20000, valor_mensal_centavos: 0, hospedagem: 'nao_se_aplica', ordem: 1, ativo: 1 },
    { id: 3, nome: 'Gestão mensal', frase: '', tipo: 'comum', valor_unico_centavos: 0, valor_mensal_centavos: 15000, hospedagem: 'nao_se_aplica', ordem: 2, ativo: 0 },
    { id: 4, nome: 'Placas NFC', frase: '', tipo: 'placa', valor_unico_centavos: 0, valor_mensal_centavos: 0, hospedagem: 'nao_se_aplica', ordem: 3, ativo: 1 },
  ],
  pacotes: [{ id: 9, nome: 'Presença completa', itens: [{ id: 1, servico_id: 1, opcional: 0, quantidade: 1, placa_modelo_id: null, ordem: 0 }, { id: 2, servico_id: 3, opcional: 1, quantidade: 1, placa_modelo_id: null, ordem: 1 }] }],
  desconto_combo_pct: 10,
  contato_whatsapp: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('TabelaPrecos', () => {
  it('mostra os serviços com valor único e mensal', async () => {
    mockApi({ 'GET /tabela-precos': tabela });
    renderizar(<TabelaPrecos />);
    const linha = (await screen.findByText('Landing page')).closest('li');
    expect(linha).toHaveTextContent('R$ 600,00');
    const gestao = screen.getByText('Gestão mensal').closest('li');
    expect(gestao).toHaveTextContent('R$ 150,00/mês');
    expect(within(gestao).getByText('inativo')).toBeInTheDocument();
    expect(screen.getByText('Placas NFC').closest('li')).toHaveTextContent('preço do modelo (em Placas)');
  });

  it('edita o valor do GMN e envia PUT com centavos', async () => {
    const { chamadas } = mockApi({ 'GET /tabela-precos': tabela, 'PUT /tabela-precos/servicos/2': {} });
    renderizar(<TabelaPrecos />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Configuração do Google Meu Negócio' }));
    const valor = screen.getByLabelText('Valor único (R$)');
    await user.clear(valor);
    await user.type(valor, '250');
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/tabela-precos/servicos/2')).toBeTruthy());
    const put = chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/tabela-precos/servicos/2');
    expect(put.corpo.valor_unico_centavos).toBe(25000);
  });

  it('apagar serviço em uso mostra a mensagem do servidor', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockApi({
      'GET /tabela-precos': tabela,
      'DELETE /tabela-precos/servicos/1': resposta(409, { erro: 'Este serviço já foi usado. Desative em vez de apagar.' }),
    });
    renderizar(<TabelaPrecos />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Apagar Landing page' }));
    expect(await screen.findByText('Este serviço já foi usado. Desative em vez de apagar.')).toBeInTheDocument();
  });

  it('salva desconto e WhatsApp', async () => {
    const { chamadas } = mockApi({ 'GET /tabela-precos': tabela, 'PUT /tabela-precos/config': { desconto_combo_pct: 15, contato_whatsapp: '(11) 99999-0000' } });
    renderizar(<TabelaPrecos />);
    const user = userEvent.setup();
    const desconto = await screen.findByLabelText('Desconto de combo (%)');
    await user.clear(desconto);
    await user.type(desconto, '15');
    await user.type(screen.getByLabelText('WhatsApp no PDF'), '(11) 99999-0000');
    await user.click(screen.getByRole('button', { name: 'Salvar combo' }));
    expect(await screen.findByText('Configuração salva.')).toBeInTheDocument();
    const put = chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/tabela-precos/config');
    expect(put.corpo).toEqual({ desconto_combo_pct: 15, contato_whatsapp: '(11) 99999-0000' });
  });

  it('desconto inválido mostra erro e não envia', async () => {
    const { chamadas } = mockApi({ 'GET /tabela-precos': tabela });
    renderizar(<TabelaPrecos />);
    const user = userEvent.setup();
    const desconto = await screen.findByLabelText('Desconto de combo (%)');
    for (const ruim of ['', 'abc', '150', '2,5']) {
      await user.clear(desconto);
      if (ruim) await user.type(desconto, ruim);
      await user.click(screen.getByRole('button', { name: 'Salvar combo' }));
      expect(await screen.findByText('Informe um número inteiro de 0 a 100')).toBeInTheDocument();
    }
    expect(screen.queryByText('Configuração salva.')).toBeNull();
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);
  });

  it('valor vazio vai como null', async () => {
    const { chamadas } = mockApi({ 'GET /tabela-precos': tabela, 'PUT /tabela-precos/servicos/1': {} });
    renderizar(<TabelaPrecos />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Landing page' }));
    await user.clear(screen.getByLabelText('Valor mensal (R$)'));
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    await vi.waitFor(() => expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(true));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo.valor_mensal_centavos).toBeNull();
  });

  it('valor nulo abre vazio e salvar mantém null', async () => {
    const comNulo = { ...tabela, servicos: [{ ...tabela.servicos[0], valor_mensal_centavos: null }, ...tabela.servicos.slice(1)] };
    const { chamadas } = mockApi({ 'GET /tabela-precos': comNulo, 'PUT /tabela-precos/servicos/1': {} });
    renderizar(<TabelaPrecos />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Landing page' }));
    expect(screen.getByLabelText('Valor mensal (R$)')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    await vi.waitFor(() => expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(true));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo.valor_mensal_centavos).toBeNull();
  });

  it('cria pacote marcando a gestão como opcional', async () => {
    const { chamadas } = mockApi({ 'GET /tabela-precos': tabela, 'POST /tabela-precos/pacotes': {} });
    renderizar(<TabelaPrecos />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Novo pacote' }));
    await user.type(screen.getByLabelText('Nome do pacote'), 'Básico');
    await user.click(screen.getByLabelText('Incluir Landing page'));
    await user.click(screen.getByLabelText('Incluir Gestão mensal'));
    await user.click(screen.getByLabelText('Opcional: Gestão mensal'));
    await user.click(screen.getByRole('button', { name: 'Salvar pacote' }));
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')).toBeTruthy());
    const post = chamadas.find((c) => c.metodo === 'POST');
    expect(post.corpo).toEqual({
      nome: 'Básico',
      itens: [
        { servico_id: 1, opcional: false, quantidade: 1, placa_modelo_id: null },
        { servico_id: 3, opcional: true, quantidade: 1, placa_modelo_id: null },
      ],
    });
  });
});
