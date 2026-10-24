import { useState } from 'react';
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../Aviso.jsx';
import { OrigemTarefa, MarcaPrioridade, IconeTipo } from '../QuadroTarefas.jsx';
import { hojeISO } from '../../lib/datas.js';
import { notificar } from '../../lib/notificacoes.js';
import { GRUPOS_PRAZO, agruparPorPrazo, prazoCurto, TIPOS_TAREFA } from '../../lib/tarefas.js';

// Visão Lista: tarefas agrupadas pelo prazo, do que está vencendo ao que não tem data.
// O checkbox conclui (ou reabre) na hora; o título abre o painel.
export function ListaTarefas({ tarefas, onMudou, onAbrir }) {
  const [verConcluidas, setVerConcluidas] = useState(false);
  const envio = useEnvio();
  const hoje = hojeISO();
  const grupos = agruparPorPrazo(tarefas, hoje);

  const concluir = (t, feita) => envio.executar(async () => {
    await api(`/tarefas/${t.id}`, { method: 'PUT', body: { concluida: feita } });
    notificar(feita ? `"${t.texto}" concluída.` : `"${t.texto}" reaberta.`);
    onMudou();
  });

  return (
    <div className="lista-tarefas">
      <Aviso erro={envio.erro} />
      {GRUPOS_PRAZO.map(([chave, rotulo]) => {
        const doGrupo = grupos[chave];
        if (!doGrupo.length) return null;
        const recolhido = chave === 'concluidas' && !verConcluidas;
        return (
          <section key={chave} className={`lista-tarefas__grupo lista-tarefas__grupo--${chave}`} aria-label={rotulo}>
            <header className="lista-tarefas__topo">
              <h2>{rotulo} <span className="kanban__contagem">{doGrupo.length}</span></h2>
              {chave === 'concluidas' && (
                <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setVerConcluidas((v) => !v)}>
                  {recolhido ? 'Mostrar' : 'Recolher'}
                </button>
              )}
            </header>
            {!recolhido && (
              <ul className="lista-tarefas__itens">
                {doGrupo.map((t) => (
                  <li key={t.id} className="lista-tarefas__linha">
                    <input type="checkbox" aria-label={`Concluir ${t.texto}`} checked={t.etapa === 'concluido'} onChange={(e) => concluir(t, e.target.checked)} />
                    <button type="button" className={`lista-tarefas__titulo${t.etapa === 'concluido' ? ' tarefa__texto--feita' : ''}`} onClick={() => onAbrir(t)}>
                      {t.texto}
                    </button>
                    <span className="lista-tarefas__origem"><OrigemTarefa tarefa={t} /></span>
                    <span className="lista-tarefas__tipo"><IconeTipo tipo={t.tipo} /><span>{TIPOS_TAREFA[t.tipo]?.rotulo}</span></span>
                    <span className="lista-tarefas__prioridade"><MarcaPrioridade prioridade={t.prioridade} /></span>
                    <span className={`lista-tarefas__prazo${chave === 'atrasadas' ? ' item-atrasado' : ''}`}>{t.prazo ? prazoCurto(t.prazo, hoje) : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
