import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { Kanban } from '../components/Kanban.jsx';
import { Calendario } from '../components/Calendario.jsx';
import { FormConteudo } from '../components/FormConteudo.jsx';
import { formatarData } from '../lib/datas.js';
import { ROTULO_CANAL, ROTULO_STATUS_CONTEUDO, ROTULO_TIPO, STATUS_CONTEUDO } from '../lib/rotulos.js';

const COLUNAS = STATUS_CONTEUDO.map((id) => ({ id, titulo: ROTULO_STATUS_CONTEUDO[id] }));

export function Conteudo() {
  const [canal, setCanal] = useState('');
  const [visao, setVisao] = useState('kanban');
  const [editando, setEditando] = useState(null); // null = fechado; {} = novo; objeto = edição
  const { dados: conteudos, erro, recarregar } = useCarregar(
    () => api(`/conteudos${canal ? `?canal=${canal}` : ''}`),
    [canal],
  );
  const mudanca = useEnvio();

  function mover(conteudo, status) {
    mudanca.executar(async () => {
      await api(`/conteudos/${conteudo.id}`, { method: 'PUT', body: { status } });
      recarregar();
    });
  }

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

  const abrirItem = (c) => (
    <button type="button" className="calendario__item" onClick={() => setEditando(c)}>{c.titulo}</button>
  );

  return (
    <section>
      <header className="pagina__topo">
        <h1>Conteúdo</h1>
        <div className="form--linha">
          <label className="campo">
            <span>Canal</span>
            <select aria-label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_CANAL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
          <button type="button" className="btn" aria-pressed={visao === 'kanban'} onClick={() => setVisao('kanban')}>Kanban</button>
          <button type="button" className="btn" aria-pressed={visao === 'calendario'} onClick={() => setVisao('calendario')}>Calendário</button>
          <button type="button" className="btn btn--primario" onClick={() => setEditando({})}>+ Conteúdo</button>
        </div>
      </header>
      <Aviso erro={erro ?? mudanca.erro} />

      {conteudos && visao === 'kanban' && (
        <Kanban
          colunas={COLUNAS}
          itens={conteudos}
          colunaDe={(c) => c.status}
          tituloDe={(c) => c.titulo}
          onMover={mover}
          renderItem={(c) => (
            <>
              <button type="button" className="kanban__titulo" onClick={() => setEditando(c)}>{c.titulo}</button>
              <p className="kanban__meta">{ROTULO_CANAL[c.canal]} · {ROTULO_TIPO[c.tipo]}</p>
              <p className="kanban__meta">{formatarData(c.data_planejada)}{c.projeto_titulo ? ` · ${c.projeto_titulo}` : ''}</p>
            </>
          )}
        />
      )}

      {conteudos && visao === 'calendario' && (
        <div className="conteudo-layout">
          <Calendario itens={conteudos.filter((c) => c.data_planejada)} dataDe={(c) => c.data_planejada} renderItem={abrirItem} />
          <aside className="cartao" aria-label="Sem data">
            <h2>Sem data</h2>
            {conteudos.filter((c) => !c.data_planejada).map((c) => <div key={c.id}>{abrirItem(c)}</div>)}
          </aside>
        </div>
      )}

      {editando && (
        <Modal titulo={editando.id ? 'Editar conteúdo' : 'Novo conteúdo'} onFechar={() => setEditando(null)}>
          <FormConteudo inicial={editando} onSalvar={salvar} onExcluir={editando.id ? excluir : undefined} />
        </Modal>
      )}
    </section>
  );
}
