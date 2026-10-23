import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Orcamento } from '../Orcamento.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';

const item = (o) => ({ servico_id: null, placa_modelo_id: null, frase: '', quantidade: 1, valor_unico_centavos: 0, valor_mensal_centavos: 0, tipo_servico: null, ...o });

const SEM_GERADOS = { projetos: [], vendas: [] };
const filinto = {
  id: 7, numero: 7, cliente_id: 1, cliente_nome: 'Filinto Sorvetes', data: '2026-10-21', validade_dias: 15,
  pagamento: '50% + 50%', prazo: 'a combinar', observacao: null, situacao: 'enviado', desconto_pct: 10, titulo_pacote: null,
  itens: [
    item({ id: 31, servico_id: 1, placa_modelo_id: 2, nome: 'Placa NFC — Redonda', valor_unico_centavos: 8000, tipo_servico: 'placa' }),
    item({ id: 32, servico_id: 2, nome: 'Configuração do Google Meu Negócio', valor_unico_centavos: 25000, tipo_servico: 'gmn_config' }),
    item({ id: 33, servico_id: 3, nome: 'Cardápio digital', valor_unico_centavos: 150000, tipo_servico: 'comum' }),
    item({ id: 34, servico_id: 4, nome: 'Hospedagem e suporte', valor_mensal_centavos: 15000, tipo_servico: 'hospedagem' }),
    item({ id: 35, servico_id: 6, nome: 'Gestão do Google Meu Negócio', valor_mensal_centavos: 15000, tipo_servico: 'comum' }),
  ],
  totais: {
    servicos_combo: 3, subtotal_unico_centavos: 183000, desconto_centavos: 18300, total_unico_centavos: 164700,
    mensalidades: [{ nome: 'Hospedagem e suporte', valor_centavos: 15000 }, { nome: 'Gestão do Google Meu Negócio', valor_centavos: 15000 }],
    total_mensal_centavos: 30000,
  },
  sugerir_hospedagem: false,
  gerados: SEM_GERADOS,
};

const gerados = {
  projetos: [
    { id: 50, titulo: 'Cardápio digital', servico: 'site_sistema', cliente_id: 1, pode_apagar: true },
    { id: 51, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', cliente_id: 1, pode_apagar: false },
  ],
  vendas: [{ id: 60, modelo_nome: 'Redonda', quantidade: 1, pode_apagar: true }],
};
const aceito = { ...filinto, situacao: 'aceito', gerados };

const tabela = { servicos: [], pacotes: [], desconto_combo_pct: 10, contato_whatsapp: null };
const rotas = (extra = {}) => ({ 'GET /orcamentos/7': filinto, 'GET /tabela-precos': tabela, ...extra });
const abrir = () => renderizar(<Orcamento />, { rota: '/orcamentos/7', padrao: '/orcamentos/:id' });

async function abrirConferencia(user) {
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Situação' }), 'Aceito');
  return screen.getByRole('dialog', { name: 'Aceitar o orçamento nº 007' });
}
const blocoDe = (dialogo, nome) => within(dialogo).getByText(nome).closest('li');

afterEach(() => vi.unstubAllGlobals());

describe('Conferência do aceite', () => {
  it('escolher Aceito abre a conferência com cada item, valores com desconto e envia as escolhas', async () => {
    const { chamadas } = mockApi(rotas({ 'POST /orcamentos/7/aceitar': aceito }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);

    const cardapio = blocoDe(dialogo, 'Cardápio digital');
    expect(within(cardapio).getByRole('checkbox')).toBeChecked();
    expect(cardapio).toHaveTextContent(/R\$\s1\.350,00/);
    expect(cardapio).toHaveTextContent(/de R\$\s1\.500,00, com o desconto/);
    expect(cardapio).toHaveTextContent('Valor definido');
    // "50% + 50%" na forma de pagamento já escolhe o atalho
    expect(within(cardapio).getByRole('combobox', { name: 'Parcelas' })).toHaveValue('entrada_entrega');
    expect(blocoDe(dialogo, 'Placa NFC — Redonda')).toHaveTextContent(/Venda de 1 placa a R\$\s72,00 cada, a receber/);
    expect(blocoDe(dialogo, 'Hospedagem e suporte')).toHaveTextContent('Mensalidade em "Cardápio digital"');
    expect(blocoDe(dialogo, 'Gestão do Google Meu Negócio')).toHaveTextContent('Mensalidade no Google Meu Negócio acima');
    expect(within(dialogo).getByLabelText('Total que será criado')).toHaveTextContent(/R\$\s1\.647,00 pagos uma vez \+ R\$\s300,00\/mês/);

    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    expect(await screen.findByText('Criou:')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    const hoje = hojeISO();
    const dia = Number(hoje.slice(8, 10));
    expect(chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo).toEqual({
      escolhas: [
        { item_id: 31, destino: 'placa' },
        { item_id: 32, destino: 'gmn', parcelas: { modo: 'entrada_entrega', primeira: hoje } },
        { item_id: 33, destino: 'site', parcelas: { modo: 'entrada_entrega', primeira: hoje } },
        { item_id: 34, destino: 'mensal_site', dia_vencimento: dia, alvo_item_id: 33 },
        { item_id: 35, destino: 'mensal_gmn', dia_vencimento: dia, alvo_item_id: 32 },
      ],
    });
    expect(screen.getByRole('link', { name: 'Cardápio digital' })).toHaveAttribute('href', '/projetos/50');
    expect(screen.getByRole('link', { name: 'Google Meu Negócio' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(screen.getByRole('link', { name: 'Venda de 1 placa Redonda' })).toHaveAttribute('href', '/servicos?aba=placas&placas=vendas');
  });

  it('desmarcar e trocar as parcelas muda o que é enviado e o total', async () => {
    const { chamadas } = mockApi(rotas({ 'POST /orcamentos/7/aceitar': aceito }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    await user.click(within(blocoDe(dialogo, 'Placa NFC — Redonda')).getByRole('checkbox'));
    expect(blocoDe(dialogo, 'Placa NFC — Redonda')).toHaveTextContent('Não será criado.');
    const gmn = blocoDe(dialogo, 'Configuração do Google Meu Negócio');
    await user.selectOptions(within(gmn).getByRole('combobox', { name: 'Parcelas' }), 'Parcelas mensais');
    const quantas = within(gmn).getByLabelText('Quantas');
    await user.clear(quantas);
    await user.type(quantas, '3');
    const primeira = within(gmn).getByLabelText('1ª parcela em');
    await user.clear(primeira);
    await user.type(primeira, '2026-11-01');
    expect(gmn).toHaveTextContent(/01\/11\/2026: R\$\s75,00 · 01\/12\/2026: R\$\s75,00 · 01\/01\/2027: R\$\s75,00/);
    expect(within(dialogo).getByLabelText('Total que será criado')).toHaveTextContent(/R\$\s1\.575,00 pagos uma vez/);
    expect(dialogo).toHaveTextContent('o que ficou desmarcado não entra');
    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    await screen.findByText('Criou:');
    const { escolhas } = chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo;
    expect(escolhas[0]).toEqual({ item_id: 31, destino: 'nenhum' });
    expect(escolhas[1]).toEqual({ item_id: 32, destino: 'gmn', parcelas: { modo: 'mensais', quantidade: 3, primeira: '2026-11-01' } });
  });

  it('sem site, a hospedagem avisa e não é criada', async () => {
    const { chamadas } = mockApi(rotas({ 'POST /orcamentos/7/aceitar': aceito }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    await user.click(within(blocoDe(dialogo, 'Cardápio digital')).getByRole('checkbox'));
    expect(blocoDe(dialogo, 'Hospedagem e suporte')).toHaveTextContent('Nenhum site será criado neste aceite');
    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    await screen.findByText('Criou:');
    const { escolhas } = chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo;
    expect(escolhas.find((e) => e.item_id === 34)).toEqual({ item_id: 34, destino: 'nenhum' });
  });

  it('mostra o erro do servidor e mantém a conferência aberta', async () => {
    mockApi(rotas({ 'POST /orcamentos/7/aceitar': resposta(400, { erro: 'Placa NFC — Redonda: Modelo sem receita cadastrada' }) }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    expect(await within(dialogo).findByText('Placa NFC — Redonda: Modelo sem receita cadastrada')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Situação' })).toHaveValue('enviado');
  });

  it('cancelar não muda a situação', async () => {
    const { chamadas } = mockApi(rotas());
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Situação' })).toHaveValue('enviado');
    expect(chamadas.filter((c) => c.metodo !== 'GET')).toEqual([]);
  });
});

describe('Sair de aceito', () => {
  it('pergunta se apaga o que foi gerado, diz o que fica e apaga', async () => {
    const depois = { ...filinto, situacao: 'enviado', gerados: { projetos: [gerados.projetos[1]], vendas: [] } };
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': aceito, 'POST /orcamentos/7/desfazer': depois }));
    abrir();
    const user = userEvent.setup();
    expect(await screen.findByText('Criou:')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'Enviado');
    const dialogo = screen.getByRole('dialog', { name: 'Voltar para "Enviado"?' });
    expect(dialogo).toHaveTextContent('Quer apagar o que ele gerou?');
    expect(within(dialogo).getByText('Pode ser apagado').nextSibling).toHaveTextContent(/Cardápio digital.*Venda de 1 placa Redonda/);
    const fica = within(dialogo).getByText('Já andou e fica').nextSibling;
    expect(within(fica).getByRole('link', { name: 'Google Meu Negócio' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(fica).toHaveTextContent('(tem parcela paga)');
    await user.click(within(dialogo).getByRole('button', { name: 'Apagar o que foi gerado' }));
    expect(chamadas.find((c) => c.caminho === '/orcamentos/7/desfazer').corpo).toEqual({ situacao: 'enviado', apagar: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Situação' })).toHaveValue('enviado');
    // o que ficou continua aparecendo
    expect(screen.getByText('Criou:').parentElement).toHaveTextContent('Google Meu Negócio');
  });

  it('manter só muda a situação', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': aceito, 'POST /orcamentos/7/desfazer': { ...aceito, situacao: 'recusado' } }));
    abrir();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Situação' }), 'Recusado');
    await user.click(screen.getByRole('button', { name: 'Manter e só mudar a situação' }));
    expect(chamadas.find((c) => c.caminho === '/orcamentos/7/desfazer').corpo).toEqual({ situacao: 'recusado', apagar: false });
    expect(screen.getByRole('combobox', { name: 'Situação' })).toHaveValue('recusado');
  });

  it('com algo já gerado, voltar para aceito não abre a conferência', async () => {
    const mantido = { ...filinto, situacao: 'enviado', gerados };
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': mantido, 'PUT /orcamentos/7': aceito }));
    abrir();
    await userEvent.setup().selectOptions(await screen.findByRole('combobox', { name: 'Situação' }), 'Aceito');
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toEqual({ situacao: 'aceito' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Conferência com projeto existente', () => {
  const cardapioExistente = {
    id: 13, titulo: 'Cardápio digital p/ empresas', servico: 'site_sistema', etapa: 'prototipo', valor_total_centavos: 150000,
    mensalidade_ativa: 1, mensalidade_valor_centavos: 15000, mensalidade_dia_vencimento: 5,
    parcelas: [
      { id: 90, descricao: 'Sinal', valor_centavos: 20000, vencimento: '2026-10-01', pago_em: '2026-10-01' },
      { id: 91, descricao: 'Resto', valor_centavos: 30000, vencimento: '2026-12-01', pago_em: null },
    ],
  };
  const comExistente = (...projetos) => ({ ...filinto, projetos_vinculaveis: projetos });
  const vinculou = {
    ...aceito,
    gerados: {
      projetos: [
        { id: 13, titulo: 'Cardápio digital p/ empresas', servico: 'site_sistema', cliente_id: 1, vinculado: true, pode_apagar: false, parcelas_abertas: 0 },
        gerados.projetos[1],
      ],
      vendas: gerados.vendas,
    },
  };

  it('com um só projeto aberto, já sugere usar ele e mostra o que muda', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': comExistente(cardapioExistente), 'POST /orcamentos/7/aceitar': vinculou }));
    abrir();
    const user = userEvent.setup();
    // antes de aceitar, a tela do orçamento já avisa
    expect(await screen.findByText('Filinto Sorvetes já tem "Cardápio digital p/ empresas" em Protótipo — ao aceitar você pode usar esse projeto.')).toBeInTheDocument();
    const dialogo = await abrirConferencia(user);
    const cardapio = blocoDe(dialogo, 'Cardápio digital');
    expect(cardapio).toHaveTextContent('Já existe "Cardápio digital p/ empresas" em Protótipo — usar esse?');
    expect(within(cardapio).getByRole('combobox', { name: 'Projeto' })).toHaveValue('13');
    const previa = within(cardapio).getByLabelText('O que muda no projeto');
    expect(previa).toHaveTextContent('Etapa: Protótipo → Valor definido');
    expect(previa).toHaveTextContent(/Valor: de R\$\s1\.500,00 para R\$\s1\.350,00/);
    expect(previa).toHaveTextContent(/Já tem 2 parcelas \(1 paga\).*01\/10\/2026: R\$\s200,00 paga · 01\/12\/2026: R\$\s300,00/);
    expect(cardapio).not.toHaveTextContent('Vira um projeto em Sites');
    // já tem parcelas: o atalho começa sem parcelas, mesmo com "50% + 50%" escrito
    expect(within(cardapio).getByRole('combobox', { name: 'Parcelas' })).toHaveValue('nenhuma');
    // já cobra mensalidade: fica a atual e não soma no total
    const hospedagem = blocoDe(dialogo, 'Hospedagem e suporte');
    expect(hospedagem).toHaveTextContent(/"Cardápio digital p\/ empresas" já cobra R\$\s150,00\/mês: fica a atual\./);
    expect(within(hospedagem).queryByLabelText(/Dia do vencimento/)).toBeNull();
    expect(within(dialogo).getByLabelText('Total que será criado')).toHaveTextContent(/R\$\s1\.647,00 pagos uma vez \+ R\$\s150,00\/mês/);

    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    expect(await screen.findByText('Vinculou:')).toBeInTheDocument();
    const { escolhas } = chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo;
    expect(escolhas.find((e) => e.item_id === 33)).toEqual({ item_id: 33, destino: 'site', parcelas: { modo: 'nenhuma' }, projeto_id: 13 });
    expect(escolhas.find((e) => e.item_id === 34)).not.toHaveProperty('substituir_mensalidade');
    expect(screen.getByText('Vinculou:').parentElement).toHaveTextContent('Cardápio digital p/ empresas');
    expect(screen.getByText('Criou:').parentElement).toHaveTextContent(/Google Meu Negócio.*Venda de 1 placa Redonda/);
  });

  it('substituir a mensalidade manda o pedido e começa pelo dia que o projeto já usa', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': comExistente(cardapioExistente), 'POST /orcamentos/7/aceitar': aceito }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    const hospedagem = blocoDe(dialogo, 'Hospedagem e suporte');
    await user.click(within(hospedagem).getByRole('checkbox', { name: /Substituir pelo valor do orçamento \(R\$\s150,00\/mês\)/ }));
    expect(within(hospedagem).getByLabelText(/Dia do vencimento/)).toHaveValue(5);
    expect(within(dialogo).getByLabelText('Total que será criado')).toHaveTextContent(/R\$\s300,00\/mês/);
    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    await screen.findByText('Criou:');
    const { escolhas } = chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo;
    expect(escolhas.find((e) => e.item_id === 34)).toMatchObject({ dia_vencimento: 5, substituir_mensalidade: true });
  });

  it('pode criar um projeto novo em vez de usar o existente', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': comExistente(cardapioExistente), 'POST /orcamentos/7/aceitar': aceito }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    const cardapio = blocoDe(dialogo, 'Cardápio digital');
    await user.selectOptions(within(cardapio).getByRole('combobox', { name: 'Projeto' }), 'Criar projeto novo');
    expect(cardapio).toHaveTextContent('Vira um projeto em Sites, na etapa Valor definido.');
    expect(within(cardapio).queryByLabelText('O que muda no projeto')).toBeNull();
    expect(within(cardapio).getByRole('combobox', { name: 'Parcelas' })).toHaveValue('entrada_entrega');
    expect(blocoDe(dialogo, 'Hospedagem e suporte')).toHaveTextContent('Mensalidade em "Cardápio digital"');
    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    await screen.findByText('Criou:');
    const { escolhas } = chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo;
    expect(escolhas.find((e) => e.item_id === 33)).not.toHaveProperty('projeto_id');
  });

  it('com mais de um projeto não sugere; escolhido um em versão final, a etapa continua', async () => {
    const versaoFinal = { ...cardapioExistente, id: 14, titulo: 'Site institucional', etapa: 'andamento', parcelas: [], mensalidade_ativa: 0, valor_total_centavos: 135000 };
    const gmnConfigurado = { ...cardapioExistente, id: 15, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', etapa: 'entregue', parcelas: [], mensalidade_ativa: 0 };
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': comExistente(cardapioExistente, versaoFinal, gmnConfigurado), 'POST /orcamentos/7/aceitar': aceito }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    const cardapio = blocoDe(dialogo, 'Cardápio digital');
    const projeto = within(cardapio).getByRole('combobox', { name: 'Projeto' });
    expect(projeto).toHaveValue('');
    expect(cardapio).not.toHaveTextContent('usar esse?');
    // o GMN só oferece GMN, e um configurado não é sugerido
    const gmn = blocoDe(dialogo, 'Configuração do Google Meu Negócio');
    const projetoGmn = within(gmn).getByRole('combobox', { name: 'Projeto' });
    expect(within(projetoGmn).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Criar projeto novo', 'Usar projeto existente: Google Meu Negócio (Configurado)']);
    await user.selectOptions(projetoGmn, '15');
    expect(within(gmn).getByLabelText('O que muda no projeto')).toHaveTextContent('Etapa: continua Configurado');

    await user.selectOptions(projeto, '14');
    const previa = within(cardapio).getByLabelText('O que muda no projeto');
    expect(previa).toHaveTextContent('Etapa: continua em Versão final');
    expect(previa).toHaveTextContent(/Valor: continua R\$\s1\.350,00/);
    // o mesmo projeto não pode ser escolhido em dois itens
    expect(within(projetoGmn).getByRole('option', { name: /Google Meu Negócio/ })).not.toBeDisabled();
    await user.click(within(dialogo).getByRole('button', { name: 'Aceitar e criar' }));
    await screen.findByText('Criou:');
    const { escolhas } = chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo;
    expect(escolhas.find((e) => e.item_id === 33)).toMatchObject({ projeto_id: 14 });
    expect(escolhas.find((e) => e.item_id === 32)).toMatchObject({ projeto_id: 15 });
  });

  it('dois sites não podem usar o mesmo projeto', async () => {
    const doisSites = {
      ...comExistente(cardapioExistente),
      itens: [...filinto.itens, item({ id: 36, nome: 'Landing page', valor_unico_centavos: 60000 })],
    };
    mockApi(rotas({ 'GET /orcamentos/7': doisSites }));
    abrir();
    const user = userEvent.setup();
    const dialogo = await abrirConferencia(user);
    // a sugestão vai só para o primeiro; no segundo, o projeto aparece travado
    expect(within(blocoDe(dialogo, 'Cardápio digital')).getByRole('combobox', { name: 'Projeto' })).toHaveValue('13');
    const landing = within(within(dialogo).getByText('Landing page', { selector: 'strong' }).closest('li')).getByRole('combobox', { name: 'Projeto' });
    expect(landing).toHaveValue('');
    expect(within(landing).getByRole('option', { name: /Cardápio digital p\/ empresas/ })).toBeDisabled();
  });

  it('desfazer explica que o vinculado só é desvinculado', async () => {
    const comVinculo = { ...vinculou, gerados: { projetos: [{ ...vinculou.gerados.projetos[0], parcelas_abertas: 2 }], vendas: [] } };
    const { chamadas } = mockApi(rotas({ 'GET /orcamentos/7': comVinculo, 'POST /orcamentos/7/desfazer': { ...filinto, situacao: 'enviado' } }));
    abrir();
    const user = userEvent.setup();
    expect(await screen.findByText('Vinculou:')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'Enviado');
    const dialogo = screen.getByRole('dialog', { name: 'Voltar para "Enviado"?' });
    expect(dialogo).toHaveTextContent('Quer desfazer essa ligação?');
    expect(dialogo).toHaveTextContent('Cardápio digital p/ empresas foi vinculado: continua existindo, só é desvinculado; 2 parcelas abertas do orçamento são apagadas. Etapa, valor e mensalidade ficam como estão.');
    expect(within(dialogo).getByRole('link', { name: 'Cardápio digital p/ empresas' })).toHaveAttribute('href', '/projetos/13');
    await user.click(within(dialogo).getByRole('button', { name: 'Desfazer o que foi gerado' }));
    expect(chamadas.find((c) => c.caminho === '/orcamentos/7/desfazer').corpo).toEqual({ situacao: 'enviado', apagar: true });
  });
});
