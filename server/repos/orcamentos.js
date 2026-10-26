import { criarRepo, emTransacao, linha } from './crud.js';
import { proximaOrdem } from './ordem.js';

export function repoTabelaServicos(db) {
  const base = criarRepo(db, 'tabela_servicos', [
    'nome', 'frase', 'tipo', 'valor_unico_centavos', 'valor_mensal_centavos', 'hospedagem', 'ordem', 'ativo',
  ]);
  return {
    ...base,
    listarAtivos() {
      return base.listar({ ativo: 1 }, 'ordem, id');
    },
    // Serviço que já entrou em orçamento ou pacote não pode ser apagado, só desativado.
    emUso(id) {
      return !!db.prepare(
        'SELECT 1 FROM orcamento_itens WHERE servico_id = ?1 UNION ALL SELECT 1 FROM tabela_pacotes_itens WHERE servico_id = ?1 LIMIT 1',
      ).get(id);
    },
  };
}

export function repoTabelaPacotes(db) {
  const base = criarRepo(db, 'tabela_pacotes', ['nome']);
  function trocarItens(pacoteId, itens) {
    db.prepare('DELETE FROM tabela_pacotes_itens WHERE pacote_id = ?').run(pacoteId);
    const inserir = db.prepare(
      `INSERT INTO tabela_pacotes_itens (pacote_id, servico_id, opcional, quantidade, placa_modelo_id, ordem)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    itens.forEach((i, ordem) =>
      inserir.run(pacoteId, i.servico_id, i.opcional ? 1 : 0, i.quantidade ?? 1, i.placa_modelo_id ?? null, ordem));
  }
  return {
    ...base,
    listarComItens() {
      const itens = db.prepare('SELECT * FROM tabela_pacotes_itens ORDER BY ordem, id').all().map(linha);
      return base.listar({}, 'id').map((p) => ({ ...p, itens: itens.filter((i) => i.pacote_id === p.id) }));
    },
    substituirItens(pacoteId, itens) {
      emTransacao(db, () => trocarItens(pacoteId, itens));
    },
    // Grava o pacote e os itens numa transação só: se algo falhar, nada fica pela metade.
    // id null cria; itens null mantém os atuais.
    salvar(id, dados, itens) {
      return emTransacao(db, () => {
        const pacote = id === null ? base.criar(dados) : base.atualizar(id, dados);
        if (itens) trocarItens(pacote.id, itens);
        return pacote;
      });
    },
  };
}

export function repoOrcamentos(db) {
  const base = criarRepo(db, 'orcamentos', [
    'cliente_id', 'data', 'validade_dias', 'pagamento', 'prazo', 'observacao', 'situacao', 'desconto_pct', 'desconto_valor_centavos', 'titulo_pacote',
  ]);
  return {
    ...base,
    listarDoCliente(clienteId) {
      return base.listar({ cliente_id: clienteId }, 'id DESC');
    },
  };
}

export function repoOrcamentoItens(db) {
  const base = criarRepo(db, 'orcamento_itens', [
    'orcamento_id', 'servico_id', 'placa_modelo_id', 'nome', 'frase', 'quantidade',
    'valor_unico_centavos', 'valor_mensal_centavos', 'ordem',
  ]);
  return {
    ...base,
    listarDo(orcamentoId) {
      return base.listar({ orcamento_id: orcamentoId }, 'ordem, id');
    },
    proximaOrdem(orcamentoId) {
      return proximaOrdem(db, 'orcamento_itens', 'orcamento_id', orcamentoId);
    },
  };
}
