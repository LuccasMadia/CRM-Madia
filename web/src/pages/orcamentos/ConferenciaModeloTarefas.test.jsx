import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Orcamento } from '../Orcamento.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const item = (o) => ({ servico_id: null, placa_modelo_id: null, frase: '', quantidade: 1, valor_unico_centavos: 0, valor_mensal_centavos: 0, tipo_servico: null, ...o });
const cardapioExistente = {
  id: 13, titulo: 'Cardápio digital p/ empresas', servico: 'site_sistema', etapa: 'prototipo', valor_total_centavos: 150000, mensalidade_ativa: 0, parcelas: [],
};
const filinto = {
  id: 7, numero: 7, cliente_id: 1, cliente_nome: 'Filinto Sorvetes', data: '2026-10-21', validade_dias: 15,
  pagamento: 'à vista', prazo: 'a combinar', observacao: null, situacao: 'enviado', desconto_pct: 0, titulo_pacote: null,
  itens: [
    item({ id: 32, servico_id: 2, nome: 'Configuração do Google Meu Negócio', valor_unico_centavos: 25000, tipo_servico: 'gmn_config' }),
    item({ id: 33, servico_id: 3, nome: 'Cardápio digital', valor_unico_centavos: 150000, tipo_servico: 'comum' }),
  ],
  totais: { servicos_combo: 2, subtotal_unico_centavos: 175000, desconto_centavos: 0, total_unico_centavos: 175000, mensalidades: [], total_mensal_centavos: 0 },
  sugerir_hospedagem: false,
  gerados: { projetos: [], vendas: [] },
  projetos_vinculaveis: [cardapioExistente],
};
const aceito = { ...filinto, situacao: 'aceito', gerados: { projetos: [{ id: 50, titulo: 'Cardápio digital', servico: 'site_sistema', cliente_id: 1, pode_apagar: true }], vendas: [] } };
const modelosTarefas = [
  { id: 2, nome: 'Google Meu Negócio', tipo: 'google_meu_negocio', itens: [{ id: 1 }, { id: 2 }] },
  { id: 1, nome: 'Site', tipo: 'site_sistema', itens: [{ id: 3 }, { id: 4 }, { id: 5 }] },
];

describe('Conferência do aceite: tarefas do modelo', () => {
  it('projeto novo vem marcado, vinculado vem desmarcado, e só o marcado manda o modelo', async () => {
    const { chamadas } = mockApi({
      'GET /orcamentos/7': filinto,
      'GET /tabela-precos': { servicos: [], pacotes: [], desconto_combo_pct: 10, contato_whatsapp: null },
      'GET /tarefas-modelos': modelosTarefas,
      'POST /orcamentos/7/aceitar': aceito,
    });
    renderizar(<Orcamento />, { rota: '/orcamentos/7', padrao: '/orcamentos/:id' });
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Situação' }), 'Aceito');
    const dialogo = within(screen.getByRole('dialog', { name: 'Aceitar o orçamento nº 007' }));
    const cardapio = within(dialogo.getByText('Cardápio digital').closest('li'));
    const gmn = within(dialogo.getByText('Configuração do Google Meu Negócio').closest('li'));

    // o cardápio já tem projeto aberto: vem vinculado e sem tarefas do modelo
    expect(await cardapio.findByLabelText('Criar tarefas do modelo Site (3)')).not.toBeChecked();
    expect(gmn.getByLabelText('Criar tarefas do modelo Google Meu Negócio (2)')).toBeChecked();
    // trocar para "Criar projeto novo" volta a marcar
    await user.selectOptions(cardapio.getByRole('combobox', { name: 'Projeto' }), 'Criar projeto novo');
    expect(cardapio.getByLabelText('Criar tarefas do modelo Site (3)')).toBeChecked();
    await user.click(gmn.getByLabelText('Criar tarefas do modelo Google Meu Negócio (2)'));

    await user.click(dialogo.getByRole('button', { name: 'Aceitar e criar' }));
    await screen.findByText('Criou:');
    const { escolhas } = chamadas.find((c) => c.caminho === '/orcamentos/7/aceitar').corpo;
    expect(escolhas.find((e) => e.item_id === 33)).toMatchObject({ destino: 'site', modelo_tarefas_id: 1 });
    expect(escolhas.find((e) => e.item_id === 33)).not.toHaveProperty('projeto_id');
    expect(escolhas.find((e) => e.item_id === 32)).not.toHaveProperty('modelo_tarefas_id');
  });
});
