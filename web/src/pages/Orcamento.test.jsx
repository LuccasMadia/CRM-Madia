import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Orcamento } from './Orcamento.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { definirValoresOcultos } from '../lib/privacidade.js';

const tabela = {
  servicos: [
    { id: 1, nome: 'Placas NFC', frase: '', tipo: 'placa', valor_unico_centavos: 0, valor_mensal_centavos: 0, hospedagem: 'nao_se_aplica', ativo: 1 },
    { id: 2, nome: 'Configuração do Google Meu Negócio', frase: '', tipo: 'gmn_config', valor_unico_centavos: 25000, valor_mensal_centavos: 0, hospedagem: 'nao_se_aplica', ativo: 1 },
    { id: 3, nome: 'Cardápio digital B2B', frase: '', tipo: 'comum', valor_unico_centavos: 150000, valor_mensal_centavos: 0, hospedagem: 'opcional', ativo: 1 },
    { id: 4, nome: 'Hospedagem e suporte', frase: '', tipo: 'hospedagem', valor_unico_centavos: 0, valor_mensal_centavos: 15000, hospedagem: 'nao_se_aplica', ativo: 1 },
    { id: 5, nome: 'Serviço antigo', frase: '', tipo: 'comum', valor_unico_centavos: 1000, valor_mensal_centavos: 0, hospedagem: 'nao_se_aplica', ativo: 0 },
    { id: 6, nome: 'Gestão mensal', frase: '', tipo: 'comum', valor_unico_centavos: 0, valor_mensal_centavos: 20000, hospedagem: 'nao_se_aplica', ativo: 1 },
  ],
  pacotes: [{
    id: 9, nome: 'Presença no Google',
    itens: [
      { id: 21, servico_id: 1, opcional: 0, quantidade: 1, placa_modelo_id: null },
      { id: 22, servico_id: 2, opcional: 0, quantidade: 1, placa_modelo_id: null },
      { id: 23, servico_id: 6, opcional: 1, quantidade: 1, placa_modelo_id: null },
    ],
  }],
  desconto_combo_pct: 10,
  contato_whatsapp: null,
};

const modelos = [
  { id: 2, nome: 'Redonda', ativo: 1 },
  { id: 3, nome: 'Quadrada antiga', ativo: 0 },
];

const item = (o) => ({ servico_id: null, placa_modelo_id: null, frase: '', quantidade: 1, valor_unico_centavos: 0, valor_mensal_centavos: 0, tipo_servico: null, ...o });

const filinto = {
  id: 7, numero: 7, cliente_id: 1, cliente_nome: 'Filinto Sorvetes', data: '2026-10-21', validade_dias: 15,
  pagamento: 'a combinar', prazo: 'a combinar', observacao: null, situacao: 'rascunho', desconto_pct: 10, titulo_pacote: null,
  itens: [
    item({ id: 31, servico_id: 1, placa_modelo_id: 2, nome: 'Placa NFC — Redonda', frase: 'Encosta o celular e abre a avaliação', valor_unico_centavos: 8000, ordem: 0, tipo_servico: 'placa' }),
    item({ id: 32, servico_id: 2, nome: 'Configuração do Google Meu Negócio', valor_unico_centavos: 25000, ordem: 1, tipo_servico: 'gmn_config' }),
    item({ id: 33, servico_id: 3, nome: 'Cardápio digital B2B', valor_unico_centavos: 150000, ordem: 2, tipo_servico: 'comum' }),
    item({ id: 34, servico_id: 4, nome: 'Hospedagem e suporte', valor_mensal_centavos: 15000, ordem: 3, tipo_servico: 'hospedagem' }),
  ],
  totais: {
    servicos_combo: 3, subtotal_unico_centavos: 183000, desconto_combo_centavos: 18300, desconto_valor_centavos: 0, desconto_centavos: 18300, total_unico_centavos: 164700,
    mensalidades: [{ nome: 'Hospedagem e suporte', valor_centavos: 15000 }], total_mensal_centavos: 15000,
  },
  sugerir_hospedagem: false,
};

const vazio = {
  ...filinto, itens: [],
  totais: { servicos_combo: 0, subtotal_unico_centavos: 0, desconto_combo_centavos: 0, desconto_valor_centavos: 0, desconto_centavos: 0, total_unico_centavos: 0, mensalidades: [], total_mensal_centavos: 0 },
};

const rotas = (extra = {}) => ({ 'GET /orcamentos/7': filinto, 'GET /tabela-precos': tabela, 'GET /placas/modelos': modelos, ...extra });
const abrir = () => renderizar(<Orcamento />, { rota: '/orcamentos/7', padrao: '/orcamentos/:id' });
const totais = () => screen.getByRole('region', { name: 'Totais' });

// Segura as escritas (tudo que não é GET) até o teste soltar cada uma, na ordem que quiser.
function segurarEscritas() {
  const real = globalThis.fetch;
  const pendentes = [];
  vi.stubGlobal('fetch', vi.fn((url, opcoes = {}) => {
    if ((opcoes.method ?? 'GET') === 'GET') return real(url, opcoes);
    return new Promise((resolver) => pendentes.push({ url, soltar: () => resolver(real(url, opcoes)) }));
  }));
  return pendentes;
}

afterEach(() => definirValoresOcultos(false));

describe('Orcamento', () => {
  it('mostra itens e totais do servidor', async () => {
    mockApi(rotas());
    abrir();
    expect(await screen.findByRole('heading', { name: 'Orçamento nº 007 — Filinto Sorvetes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Filinto Sorvetes' })).toHaveAttribute('href', '/clientes/1?aba=orcamentos');
    expect(screen.getByLabelText('Nome de Cardápio digital B2B')).toHaveValue('Cardápio digital B2B');
    expect(screen.getByLabelText('Valor único de Cardápio digital B2B')).toHaveValue('1500,00');
    const t = totais();
    expect(t).toHaveTextContent('Desconto combo (10%)');
    expect(t).toHaveTextContent(/R\$\s183,00/);
    expect(within(t).getByText('Total pago uma vez').closest('div')).toHaveTextContent(/R\$\s1\.647,00/);
    expect(t).toHaveTextContent(/Hospedagem e suporte\s*R\$\s150,00\/mês/);
    expect(within(t).getByText('Total por mês').closest('div')).toHaveTextContent(/R\$\s150,00\/mês/);
  });

  it('adiciona serviço da tabela e re-renderiza com a resposta', async () => {
    const depois = { ...vazio, itens: [item({ id: 40, servico_id: 3, nome: 'Cardápio digital B2B', valor_unico_centavos: 150000 })],
      totais: { ...vazio.totais, subtotal_unico_centavos: 150000, total_unico_centavos: 150000 } };
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': vazio, 'POST /orcamentos/7/itens': depois }));
    abrir();
    const seletor = await screen.findByRole('combobox', { name: 'Adicionar' });
    expect(within(seletor).queryByRole('option', { name: 'Serviço antigo' })).toBeNull();
    expect(within(seletor).getByRole('option', { name: 'Hospedagem e suporte' })).toBeInTheDocument();
    expect(within(seletor).getByRole('option', { name: 'Presença no Google' })).toBeInTheDocument();
    await userEvent.setup().selectOptions(seletor, 'Cardápio digital B2B');
    expect(await screen.findByLabelText('Nome de Cardápio digital B2B')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ servico_id: 3 });
    expect(within(totais()).getByText('Total pago uma vez').closest('div')).toHaveTextContent(/R\$\s1\.500,00/);
  });

  it('adiciona placa escolhendo modelo e quantidade', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': vazio, 'POST /orcamentos/7/itens': filinto }));
    abrir();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Adicionar' }), 'Placas NFC');
    const modelo = await screen.findByRole('combobox', { name: 'Modelo da placa' });
    expect(within(modelo).queryByRole('option', { name: 'Quadrada antiga' })).toBeNull();
    await user.selectOptions(modelo, 'Redonda');
    const qtd = screen.getByLabelText('Quantidade de placas');
    await user.clear(qtd);
    await user.type(qtd, '3');
    await user.click(screen.getByRole('button', { name: 'Adicionar placa' }));
    expect(await screen.findByLabelText('Nome de Cardápio digital B2B')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ servico_id: 1, placa_modelo_id: 2, quantidade: 3 });
  });

  it('aplica pacote com a gestão opcional desmarcada por padrão', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': vazio, 'POST /orcamentos/7/pacote': filinto }));
    abrir();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Adicionar' }), 'Presença no Google');
    expect(await screen.findByRole('checkbox', { name: 'Gestão mensal' })).not.toBeChecked();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Modelo da placa' }), 'Redonda');
    await user.click(screen.getByRole('button', { name: 'Aplicar pacote' }));
    expect(await screen.findByLabelText('Nome de Cardápio digital B2B')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ pacote_id: 9, opcionais: [], placa_modelo_id: 2 });
  });

  it('edita valor do item ao sair do campo', async () => {
    const { chamadas } = mockApi(rotas({ 'PUT /orcamentos/7/itens/33': filinto }));
    abrir();
    const user = userEvent.setup();
    const valor = await screen.findByLabelText('Valor único de Cardápio digital B2B');
    await user.click(valor);
    await user.tab();
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);
    await user.clear(valor);
    await user.type(valor, '1.600,00');
    await user.tab();
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')).toBeTruthy());
    expect(chamadas.find((c) => c.metodo === 'PUT')).toMatchObject({ caminho: '/orcamentos/7/itens/33', corpo: { valor_unico_centavos: 160000 } });
  });

  it('valor inválido no item não envia e mostra o erro', async () => {
    const { chamadas } = mockApi(rotas());
    abrir();
    const user = userEvent.setup();
    const valor = await screen.findByLabelText('Valor único de Cardápio digital B2B');
    await user.clear(valor);
    await user.type(valor, 'abc');
    await user.tab();
    expect(await screen.findByText('Valor inválido')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);
  });

  it('desconto em reais: salva o valor e mostra o total cheio riscado acima do final', async () => {
    const site = { ...vazio, itens: [item({ id: 40, servico_id: 3, nome: 'Site', valor_unico_centavos: 120000 })],
      totais: { ...vazio.totais, servicos_combo: 1, subtotal_unico_centavos: 120000, total_unico_centavos: 120000 } };
    const comDesconto = { ...site, desconto_valor_centavos: 20000,
      totais: { ...site.totais, desconto_valor_centavos: 20000, desconto_centavos: 20000, total_unico_centavos: 100000 } };
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': site, 'PUT /orcamentos/7': comDesconto }));
    abrir();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Desconto (R$)'), '200');
    await user.tab();
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ desconto_valor_centavos: 20000 }));
    const total = within(totais()).getByText('Total pago uma vez').closest('div');
    await vi.waitFor(() => expect(within(total).getByLabelText(/Sem desconto: R\$\s1\.200,00/).tagName).toBe('S'));
    expect(within(total).getByText(/R\$\s1\.000,00/).tagName).toBe('STRONG');
    expect(totais()).toHaveTextContent(/Desconto\s*− R\$\s200,00/);
  });

  it('tira o desconto', async () => {
    const semDesconto = { ...filinto, desconto_pct: null, totais: { ...filinto.totais, desconto_combo_centavos: 0, desconto_centavos: 0, total_unico_centavos: 183000 } };
    const { chamadas } = mockApi(rotas({ 'PUT /orcamentos/7': semDesconto }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tirar desconto' }));
    expect(await screen.findByRole('button', { name: 'Aplicar desconto de combo' })).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ desconto_pct: null });
    expect(within(totais()).getByText('Total pago uma vez').closest('div')).toHaveTextContent(/R\$\s1\.830,00/);
  });

  it('sem combo não mostra a linha de desconto, mas deixa tirar o desconto', async () => {
    const semCombo = {
      ...vazio,
      itens: [item({ id: 40, servico_id: 3, nome: 'Cardápio digital B2B', valor_unico_centavos: 150000 })],
      totais: { ...vazio.totais, servicos_combo: 1, subtotal_unico_centavos: 150000, total_unico_centavos: 150000 },
    };
    mockApi(rotas({ 'GET /orcamentos/7': semCombo }));
    abrir();
    await screen.findByLabelText('Nome de Cardápio digital B2B');
    expect(totais()).not.toHaveTextContent('Desconto combo');
    expect(totais()).not.toHaveTextContent('Subtotal');
    expect(screen.getByRole('button', { name: 'Tirar desconto' })).toBeInTheDocument();
    expect(screen.getByText('O desconto de combo entra com 2 ou mais serviços pagos uma vez.')).toBeInTheDocument();
  });

  it('respostas fora de ordem: vale a do último pedido', async () => {
    const respostaA = { ...filinto, itens: filinto.itens.map((i) => (i.id === 33 ? { ...i, valor_unico_centavos: 160000 } : i)),
      totais: { ...filinto.totais, total_unico_centavos: 173700 } };
    const respostaB = { ...filinto, itens: filinto.itens.map((i) => (i.id === 32 ? { ...i, valor_unico_centavos: 30000 } : i)),
      totais: { ...filinto.totais, total_unico_centavos: 169200 } };
    mockApi(rotas({ 'PUT /orcamentos/7/itens/33': respostaA, 'PUT /orcamentos/7/itens/32': respostaB }));
    const pendentes = segurarEscritas();
    abrir();
    const user = userEvent.setup();
    const valorA = await screen.findByLabelText('Valor único de Cardápio digital B2B');
    await user.clear(valorA);
    await user.type(valorA, '1600');
    const valorB = screen.getByLabelText('Valor único de Configuração do Google Meu Negócio');
    await user.clear(valorB);
    await user.type(valorB, '300');
    await user.tab();
    await vi.waitFor(() => expect(pendentes).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Remover Cardápio digital B2B' })).toBeDisabled();

    pendentes[1].soltar();
    await vi.waitFor(() => expect(within(totais()).getByText('Total pago uma vez').closest('div')).toHaveTextContent(/R\$\s1\.692,00/));
    pendentes[0].soltar();
    // deixa a resposta atrasada de A chegar e ser processada antes de conferir
    await act(() => new Promise((r) => { setTimeout(r, 20); }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Remover Cardápio digital B2B' })).toBeEnabled());
    expect(within(totais()).getByText('Total pago uma vez').closest('div')).toHaveTextContent(/R\$\s1\.692,00/);
    expect(screen.getByLabelText('Valor único de Configuração do Google Meu Negócio')).toHaveValue('300,00');
  });

  it('botão de hospedagem fica travado enquanto o pedido está em andamento', async () => {
    mockApi(rotas({ 'GET /orcamentos/7': { ...filinto, sugerir_hospedagem: true }, 'POST /orcamentos/7/itens': filinto }));
    const pendentes = segurarEscritas();
    abrir();
    const faixa = (await screen.findByText(/Este site pode ter hospedagem e suporte\./)).closest('div');
    const botao = within(faixa).getByRole('button', { name: 'Adicionar' });
    const user = userEvent.setup();
    await user.click(botao);
    expect(botao).toBeDisabled();
    await user.click(botao);
    expect(pendentes).toHaveLength(1);
    pendentes[0].soltar();
    await vi.waitFor(() => expect(screen.queryByText(/Este site pode ter hospedagem/)).toBeNull());
  });

  it('mostra a sugestão de hospedagem e adiciona', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': { ...filinto, sugerir_hospedagem: true }, 'POST /orcamentos/7/itens': filinto }));
    abrir();
    const faixa = (await screen.findByText(/Este site pode ter hospedagem e suporte\./)).closest('div');
    await userEvent.setup().click(within(faixa).getByRole('button', { name: 'Adicionar' }));
    await vi.waitFor(() => expect(screen.queryByText(/Este site pode ter hospedagem/)).toBeNull());
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ servico_id: 4 });
  });

  it('hospedagem pode ser adicionada pelo seletor', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': vazio, 'POST /orcamentos/7/itens': filinto }));
    abrir();
    await userEvent.setup().selectOptions(await screen.findByRole('combobox', { name: 'Adicionar' }), 'Hospedagem e suporte');
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({ servico_id: 4 }));
  });

  it('só a placa tem campo de quantidade, sem aviso de ajustar o valor', async () => {
    mockApi(rotas());
    abrir();
    expect(await screen.findByLabelText('Quantidade de Placa NFC — Redonda')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantidade de Cardápio digital B2B')).toBeNull();
    expect(screen.queryByLabelText('Quantidade de Configuração do Google Meu Negócio')).toBeNull();
    expect(screen.queryByText(/ajuste o valor/)).toBeNull();
  });

  it('link do PDF fica travado enquanto há pedido em andamento', async () => {
    mockApi(rotas({ 'GET /orcamentos/7': { ...filinto, sugerir_hospedagem: true }, 'POST /orcamentos/7/itens': filinto }));
    const pendentes = segurarEscritas();
    abrir();
    const user = userEvent.setup();
    const link = await screen.findByRole('link', { name: 'Baixar PDF' });
    expect(link).not.toHaveAttribute('aria-disabled');
    const faixa = screen.getByText(/Este site pode ter hospedagem e suporte./).closest('div');
    await user.click(within(faixa).getByRole('button', { name: 'Adicionar' }));
    expect(link).toHaveAttribute('aria-disabled', 'true');
    const clique = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(clique);
    expect(clique.defaultPrevented).toBe(true);
    pendentes[0].soltar();
    await vi.waitFor(() => expect(link).not.toHaveAttribute('aria-disabled'));
  });

  it('muda a situação na hora', async () => {
    const { chamadas } = mockApi(rotas({ 'PUT /orcamentos/7': { ...filinto, situacao: 'enviado' } }));
    abrir();
    await userEvent.setup().selectOptions(await screen.findByRole('combobox', { name: 'Situação' }), 'Enviado');
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toEqual({ situacao: 'enviado' }));
  });

  it('link do PDF aponta para a rota', async () => {
    mockApi(rotas());
    abrir();
    const link = await screen.findByRole('link', { name: 'Baixar PDF' });
    expect(link).toHaveAttribute('href', '/api/orcamentos/7/pdf');
    expect(link).toHaveAttribute('download');
  });

  it('valores ocultos escondem R$ na tela', async () => {
    definirValoresOcultos(true);
    mockApi(rotas());
    abrir();
    await screen.findByRole('heading', { name: 'Orçamento nº 007 — Filinto Sorvetes' });
    expect(document.body).not.toHaveTextContent('1.647,00');
    expect(document.body).not.toHaveTextContent('150,00');
    expect(screen.queryByDisplayValue('1500,00')).toBeNull();
  });
});
