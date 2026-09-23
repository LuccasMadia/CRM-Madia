import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormConteudo } from '../../components/FormConteudo.jsx';
import { formatarData } from '../../lib/datas.js';
import { ROTULO_CANAL, ROTULO_STATUS_CONTEUDO, ROTULO_TIPO } from '../../lib/rotulos.js';

export function AbaConteudos({ projetoId }) {
  const { dados: conteudos, erro, recarregar } = useCarregar(() => api(`/conteudos?projeto_id=${projetoId}`), [projetoId]);
  const [editando, setEditando] = useState(null);

  async function salvar(dados) {
    if (editando.id) await api(`/conteudos/${editando.id}`, { method: 'PUT', body: dados });
    else await api('/conteudos', { method: 'POST', body: dados });
    setEditando(null);
    recarregar();
  }

  async function excluir() {
    await api(`/conteudos/${editando.id}`, { method: 'DELETE' });
    setEditando(null);
    recarregar();
  }

  return (
    <div className="cartao">
      <div className="pagina__topo">
        <h2>Conteúdos deste projeto</h2>
        <button type="button" className="btn btn--primario" onClick={() => setEditando({})}>+ Conteúdo</button>
      </div>
      <Aviso erro={erro} />
      {conteudos && (conteudos.length ? (
        <table className="tabela">
          <thead><tr><th>Título</th><th>Canal</th><th>Tipo</th><th>Status</th><th>Data</th></tr></thead>
          <tbody>
            {conteudos.map((c) => (
              <tr key={c.id}>
                <td><button type="button" className="kanban__titulo" onClick={() => setEditando(c)}>{c.titulo}</button></td>
                <td>{ROTULO_CANAL[c.canal]}</td>
                <td>{ROTULO_TIPO[c.tipo]}</td>
                <td><span className={`etiqueta etiqueta--${c.status}`}>{ROTULO_STATUS_CONTEUDO[c.status]}</span></td>
                <td>{formatarData(c.data_publicada ?? c.data_planejada)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum conteúdo ligado a este projeto.</p>)}
      {editando && (
        <Modal titulo={editando.id ? 'Editar conteúdo' : 'Novo conteúdo'} onFechar={() => setEditando(null)}>
          <FormConteudo inicial={editando} projetoFixo={projetoId} onSalvar={salvar} onExcluir={editando.id ? excluir : undefined} />
        </Modal>
      )}
    </div>
  );
}
