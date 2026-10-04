import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaVenda } from '../../components/FormPlacaVenda.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export function AbaVendas() {
  const [criando, setCriando] = useState(false);
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const { dados: vendas, erro, recarregar } = useCarregar(() => api('/placas/vendas'), []);

  async function criar(dados) {
    const res = await api('/placas/vendas', { method: 'POST', body: dados });
    setCriando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    recarregar();
  }

  async function remover(venda) {
    if (!window.confirm(`Excluir esta venda de ${venda.modelo_nome}?`)) return;
    await api(`/placas/vendas/${venda.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Vendas</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Venda</button>
      </header>
      <Aviso erro={erro} />
      {avisosEstoque.length > 0 && (
        <p className="aviso aviso--erro" role="alert">
          Estoque negativo após esta venda: {avisosEstoque.map((a) => `${a.nome} (${a.estoque_atual})`).join(', ')}
        </p>
      )}
      {vendas && (vendas.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Modelo</th><th>Comprador</th><th className="num">Qtd.</th><th className="num">Vendido</th><th className="num">Lucro real</th><th></th></tr>
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
                <td><button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(v)}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhuma venda lançada ainda.</p>)}
      {criando && (
        <Modal titulo="Nova venda" onFechar={() => setCriando(false)}>
          <FormPlacaVenda rotuloBotao="Lançar venda" onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
