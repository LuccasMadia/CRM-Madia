import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormConteudo } from '../../components/FormConteudo.jsx';
import { diaLocal, formatarData } from '../../lib/datas.js';
import { CLASSE_ESTADO_CONTEUDO, salvarConteudo } from '../../lib/conteudos.js';
import { ROTULO_ESTADO_CONTEUDO, ROTULO_TIPO } from '../../lib/rotulos.js';
import { notificar } from '../../lib/notificacoes.js';

export function AbaConteudos({ projetoId }) {
  const planejados = useCarregar(() => api(`/conteudos?projeto_id=${projetoId}`), [projetoId]);
  const publicados = useCarregar(() => api(`/instagram/midias?projeto_id=${projetoId}`), [projetoId]);
  const [editando, setEditando] = useState(null);

  async function salvar(dados) {
    const criando = !editando.id;
    const salvo = await salvarConteudo(editando.id, dados);
    setEditando(criando ? salvo : null);
    planejados.recarregar();
    notificar('Conteúdo salvo');
  }

  function midiasMudaram(atualizado) {
    setEditando(atualizado);
    planejados.recarregar();
  }

  async function excluir() {
    await api(`/conteudos/${editando.id}`, { method: 'DELETE' });
    setEditando(null);
    planejados.recarregar();
  }

  return (
    <div className="cartao">
      <div className="pagina__topo">
        <h2>Planejados</h2>
        <button type="button" className="btn btn--primario" onClick={() => setEditando({})}>+ Planejar</button>
      </div>
      <Aviso erro={planejados.erro ?? publicados.erro} />
      {planejados.dados && (planejados.dados.length ? (
        <table className="tabela">
          <thead><tr><th>Título</th><th>Tipo</th><th>Estado</th><th>Data</th></tr></thead>
          <tbody>
            {planejados.dados.map((c) => (
              <tr key={c.id}>
                <td><button type="button" className="kanban__titulo" onClick={() => setEditando(c)}>{c.titulo}</button></td>
                <td>{ROTULO_TIPO[c.tipo]}</td>
                <td><span className={`etiqueta etiqueta--${CLASSE_ESTADO_CONTEUDO[c.estado]}`}>{ROTULO_ESTADO_CONTEUDO[c.estado]}</span></td>
                <td>{formatarData(c.data_planejada)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum post planejado para este projeto.</p>)}

      <h2>Publicados no Instagram</h2>
      {publicados.dados && (publicados.dados.length ? (
        <ul className="lista-publicados">
          {publicados.dados.map((m) => (
            <li key={m.id}>
              {m.capa_url ? <img src={m.capa_url} alt="" /> : <span className="lista-publicados__sem-capa" />}
              <div>
                <p>{ROTULO_TIPO[m.tipo]} · {formatarData(diaLocal(m.publicado_em))}</p>
                <p className="kanban__meta">{m.curtidas ?? 0} curtidas</p>
                {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer">Abrir no Instagram</a>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhum post do Instagram ligado a este projeto.</p>)}

      {editando && (
        <Modal titulo={editando.id ? 'Editar planejado' : 'Novo planejado'} onFechar={() => setEditando(null)}>
          <FormConteudo key={editando.id ?? 'novo'} inicial={editando} projetoFixo={projetoId} onSalvar={salvar} onMidiasMudaram={midiasMudaram} onExcluir={editando.id ? excluir : undefined} />
        </Modal>
      )}
    </div>
  );
}
