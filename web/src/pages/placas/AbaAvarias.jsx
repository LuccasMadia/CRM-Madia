import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaAvaria } from '../../components/FormPlacaAvaria.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export function AbaAvarias() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const { dados: avarias, erro, recarregar } = useCarregar(() => api('/placas/avarias'), []);

  async function criar(dados) {
    const res = await api('/placas/avarias', { method: 'POST', body: dados });
    setCriando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/avarias/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(avaria) {
    if (!window.confirm(`Excluir esta avaria de ${avaria.modelo_nome}?`)) return;
    await api(`/placas/avarias/${avaria.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Avarias</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Avaria</button>
      </header>
      <Aviso erro={erro} />
      {avisosEstoque.length > 0 && (
        <p className="aviso aviso--erro" role="alert">
          Estoque negativo após esta avaria: {avisosEstoque.map((a) => `${a.nome} (${a.estoque_atual})`).join(', ')}
        </p>
      )}
      {avarias && (avarias.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Modelo</th><th className="num">Qtd.</th><th className="num">Custo perdido</th><th>Observação</th><th></th></tr>
          </thead>
          <tbody>
            {avarias.map((a) => (
              <tr key={a.id}>
                <td>{formatarData(a.data_avaria)}</td>
                <td>{a.modelo_nome}</td>
                <td className="num">{a.quantidade}</td>
                <td className="num">{formatarDinheiro(a.custo_total_centavos)}</td>
                <td>{a.observacao ?? '—'}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(a)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(a)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhuma avaria lançada ainda.</p>)}
      {criando && (
        <Modal titulo="Nova avaria" onFechar={() => setCriando(false)}>
          <FormPlacaAvaria rotuloBotao="Lançar avaria" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar avaria" onFechar={() => setEditando(null)}>
          <FormPlacaAvaria inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
    </section>
  );
}
