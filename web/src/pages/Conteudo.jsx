import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { Calendario } from '../components/Calendario.jsx';
import { FormConteudo } from '../components/FormConteudo.jsx';
import { salvarConteudo } from '../lib/conteudos.js';
import { diaLocal } from '../lib/datas.js';
import { ResumoCrescimento } from './conteudo/ResumoCrescimento.jsx';
import { GridInstagram } from './conteudo/GridInstagram.jsx';
import { PainelMidia } from './conteudo/PainelMidia.jsx';
import { ListaRascunhos } from './conteudo/ListaRascunhos.jsx';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function Conteudo() {
  const [visao, setVisao] = useState('grid');
  const [selecionada, setSelecionada] = useState(null);
  const [editando, setEditando] = useState(null); // null = fechado; {} = novo; objeto = edição
  const estado = useCarregar(() => api('/instagram/estado'), []);
  const grid = useCarregar(() => api('/instagram/grid'), []);
  const seguidores = useCarregar(() => api('/instagram/seguidores'), []);
  const rascunhos = useCarregar(() => api('/conteudos?estado=rascunho'), []);
  const acao = useEnvio();

  const recarregarPlanejados = () => {
    grid.recarregar();
    rascunhos.recarregar();
  };

  function atualizarAgora() {
    acao.executar(async () => {
      try {
        await api('/instagram/sincronizar', { method: 'POST' });
      } finally {
        estado.recarregar();
        grid.recarregar();
        seguidores.recarregar();
      }
    });
  }

  function mover(indice, delta) {
    const ids = grid.dados.prontos.map((p) => p.id);
    [ids[indice], ids[indice + delta]] = [ids[indice + delta], ids[indice]];
    acao.executar(async () => {
      await api('/conteudos/ordem', { method: 'PUT', body: { ids } });
      grid.recarregar();
    });
  }

  async function salvar(dados) {
    await salvarConteudo(editando.id, dados);
    setEditando(null);
    recarregarPlanejados();
  }

  async function excluir() {
    await api(`/conteudos/${editando.id}`, { method: 'DELETE' });
    setEditando(null);
    recarregarPlanejados();
  }

  const conectado = estado.dados?.conectado;
  const midias = grid.dados?.midias ?? [];
  const prontos = grid.dados?.prontos ?? [];
  const midiaSelecionada = midias.find((m) => m.id === selecionada) ?? null;

  const itensCalendario = [
    ...[...prontos, ...(rascunhos.dados ?? [])].filter((c) => c.data_planejada)
      .map((c) => ({ id: `c${c.id}`, titulo: c.titulo, dia: c.data_planejada, abrir: () => setEditando(c) })),
    ...midias.map((m) => ({
      id: m.id, titulo: m.legenda?.trim() || m.tipo, dia: diaLocal(m.publicado_em),
      abrir: () => { setSelecionada(m.id); setVisao('grid'); },
    })),
  ];

  return (
    <section>
      <header className="pagina__topo">
        <h1>Conteúdo</h1>
        <div className="form--linha">
          <button type="button" className="btn" aria-pressed={visao === 'grid'} onClick={() => setVisao('grid')}>Grid</button>
          <button type="button" className="btn" aria-pressed={visao === 'calendario'} onClick={() => setVisao('calendario')}>Calendário</button>
          {conectado && (
            <button type="button" className="btn" disabled={acao.enviando} onClick={atualizarAgora}>
              {acao.enviando ? 'Atualizando…' : 'Atualizar agora'}
            </button>
          )}
          <button type="button" className="btn btn--primario" onClick={() => setEditando({})}>+ Planejar</button>
        </div>
      </header>
      <Aviso erro={estado.erro ?? grid.erro ?? acao.erro} />
      {estado.dados?.ultimo_erro && (
        <p className="aviso aviso--erro" role="alert">
          {estado.dados.ultimo_erro} <Link to="/config">Abrir Configurações</Link>
        </p>
      )}
      {estado.dados && !conectado && (
        <p className="aviso">
          <Link to="/config">Conecte seu Instagram</Link> em Configurações para ver o grid real e os números.
        </p>
      )}

      {conectado && <ResumoCrescimento serie={seguidores.dados} />}

      {grid.dados && visao === 'grid' && (
        <div className="conteudo-ig">
          <div className="conteudo-ig__principal">
            <GridInstagram
              prontos={prontos}
              midias={midias}
              selecionada={selecionada}
              onSelecionar={setSelecionada}
              onEditar={setEditando}
              onMover={mover}
            />
            {rascunhos.dados && <ListaRascunhos rascunhos={rascunhos.dados} onEditar={setEditando} />}
          </div>
          {(conectado || midias.length > 0) && <PainelMidia midia={midiaSelecionada} onMudou={recarregarPlanejados} />}
        </div>
      )}

      {grid.dados && visao === 'calendario' && (
        <Calendario
          itens={itensCalendario}
          dataDe={(i) => i.dia}
          renderItem={(i) => <button type="button" className="calendario__item" onClick={i.abrir}>{i.titulo}</button>}
        />
      )}

      {estado.dados?.ultima_sync && <p className="kanban__meta">Última atualização: {dataHora(estado.dados.ultima_sync)}</p>}

      {editando && (
        <Modal titulo={editando.id ? 'Editar planejado' : 'Novo planejado'} onFechar={() => setEditando(null)}>
          <FormConteudo inicial={editando} onSalvar={salvar} onExcluir={editando.id ? excluir : undefined} />
        </Modal>
      )}
    </section>
  );
}
