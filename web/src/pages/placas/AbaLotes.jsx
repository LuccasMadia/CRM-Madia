import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaLote } from '../../components/FormPlacaLote.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export function AbaLotes() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { dados: lotes, erro, recarregar } = useCarregar(() => api('/placas/lotes'), []);

  function nomeMaterial(materialId) {
    return (materiais ?? []).find((m) => m.id === materialId)?.nome ?? '—';
  }

  async function criar(dados) {
    await api('/placas/lotes', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/lotes/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(lote) {
    if (!window.confirm(`Excluir este lote de ${nomeMaterial(lote.material_id)}?`)) return;
    await api(`/placas/lotes/${lote.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Lotes de compra</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Lote</button>
      </header>
      <Aviso erro={erro} />
      {lotes && (lotes.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Material</th><th>Lote</th><th className="num">Quantidade</th><th className="num">Kit</th><th className="num">Frete</th><th>Data</th><th></th></tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id}>
                <td>{nomeMaterial(l.material_id)}</td>
                <td>{l.nome_lote || '—'}</td>
                <td className="num">{l.quantidade}</td>
                <td className="num">{formatarDinheiro(l.valor_kit_centavos)}</td>
                <td className="num">{formatarDinheiro(l.valor_frete_centavos)}</td>
                <td>{formatarData(l.data_compra)}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(l)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(l)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum lote lançado ainda.</p>)}
      {criando && (
        <Modal titulo="Novo lote" onFechar={() => setCriando(false)}>
          <FormPlacaLote rotuloBotao="Lançar lote" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar lote" onFechar={() => setEditando(null)}>
          <FormPlacaLote inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
    </section>
  );
}
