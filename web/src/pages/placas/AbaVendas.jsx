import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaVenda } from '../../components/FormPlacaVenda.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export function SituacaoVenda({ venda }) {
  if (venda.via_projeto) return <span className="etiqueta">Pelo projeto</span>;
  if (venda.recebido_em) return <span className="etiqueta etiqueta--paga">{`Recebido em ${formatarData(venda.recebido_em)}`}</span>;
  return venda.estado === 'atrasada'
    ? <span className="etiqueta etiqueta--atrasada">Atrasada</span>
    : <span className="etiqueta etiqueta--proposta">A receber</span>;
}

export function AbaVendas({ novaVendaCliente = null }) {
  const [confirmar, dialogo] = useConfirmacao();
  const [criando, setCriando] = useState(Boolean(novaVendaCliente));
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const { dados: vendas, erro, recarregar } = useCarregar(() => api('/placas/vendas'), []);
  const envio = useEnvio();

  async function criar(dados) {
    const res = await api('/placas/vendas', { method: 'POST', body: dados });
    setCriando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    recarregar();
    notificar('Venda registrada');
  }

  function remover(venda) {
    confirmar({
      titulo: `Excluir esta venda de ${venda.modelo_nome}?`,
      mensagem: 'Essa ação não pode ser desfeita.',
      onConfirmar: async () => {
        await api(`/placas/vendas/${venda.id}`, { method: 'DELETE' });
        notificar('Venda excluída');
        recarregar();
      },
    });
  }

  function mudarRecebimento(venda) {
    envio.executar(async () => {
      await api(`/placas/vendas/${venda.id}/recebimento`, { method: venda.recebido_em ? 'DELETE' : 'POST' });
      recarregar();
    });
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Vendas</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Venda</button>
      </header>
      <Aviso erro={erro ?? envio.erro} />
      {avisosEstoque.length > 0 && (
        <p className="aviso aviso--erro" role="alert">
          Estoque negativo após esta venda: {avisosEstoque.map((a) => `${a.nome} (${a.estoque_atual})`).join(', ')}
        </p>
      )}
      {vendas && (vendas.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Modelo</th><th>Comprador</th><th className="num">Qtd.</th><th className="num">Vendido</th><th className="num">Lucro real</th><th>Situação</th><th></th></tr>
          </thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.id}>
                <td>{formatarData(v.data_venda)}</td>
                <td>{v.modelo_nome}</td>
                <td>{v.cliente_nome ?? v.comprador_nome}</td>
                <td className="num">{v.quantidade}</td>
                <td className="num">{formatarDinheiro(v.preco_vendido_centavos)}</td>
                <td className="num">{formatarDinheiro(v.lucro_real_centavos)}</td>
                <td><SituacaoVenda venda={v} /></td>
                <td className="num">
                  {!v.via_projeto && (v.recebido_em
                    ? <button type="button" className="btn btn--fantasma btn--pequeno" aria-label="Desfazer recebimento" onClick={() => mudarRecebimento(v)}>Desfazer</button>
                    : <button type="button" className="btn btn--pequeno" onClick={() => mudarRecebimento(v)}>Recebi</button>)}{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(v)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhuma venda lançada ainda.</p>)}
      {criando && (
        <Modal titulo="Nova venda" onFechar={() => setCriando(false)}>
          <FormPlacaVenda rotuloBotao="Lançar venda" inicial={novaVendaCliente ? { cliente_id: novaVendaCliente } : {}} onSalvar={criar} />
        </Modal>
      )}
      {dialogo}
    </section>
  );
}
