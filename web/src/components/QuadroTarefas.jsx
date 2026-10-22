import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Kanban } from './Kanban.jsx';
import { Aviso } from './Aviso.jsx';
import { Icone } from './Icone.jsx';
import { formatarData, hojeISO } from '../lib/datas.js';
import { notificar } from '../lib/notificacoes.js';
import { corDaEmpresa } from '../lib/cores.js';
import { ETAPAS_TAREFA, ROTULO_ETAPA_TAREFA } from '../lib/rotulos.js';

const COLUNAS = ETAPAS_TAREFA.map((id) => ({ id, titulo: ROTULO_ETAPA_TAREFA[id] }));

// Quadro de tarefas em 4 colunas. Arrastar (ou o menu do cartão) muda a coluna;
// as setas mudam a ordem dentro da coluna. Excluir não pede confirmação de propósito.
export function QuadroTarefas({ tarefas, onMudou, mostrarProjeto = false, recolherConcluidas = false }) {
  const envio = useEnvio();
  const hoje = hojeISO();
  const acao = (fn) => envio.executar(async () => { await fn(); onMudou(); });

  const mover = (t, etapa) => acao(async () => {
    await api(`/tarefas/${t.id}`, { method: 'PUT', body: { etapa } });
    notificar(`"${t.texto}" foi para ${ROTULO_ETAPA_TAREFA[etapa]}.`);
  });
  const posicao = (t, direcao) => acao(() => api(`/tarefas/${t.id}/posicao`, { method: 'PUT', body: { direcao } }));
  const excluir = (t) => acao(async () => {
    await api(`/tarefas/${t.id}`, { method: 'DELETE' });
    notificar('Tarefa excluída.');
  });

  return (
    <>
      <Aviso erro={envio.erro} />
      <Kanban
        colunas={COLUNAS}
        itens={tarefas}
        colunaDe={(t) => t.etapa}
        tituloDe={(t) => t.texto}
        recolhidas={recolherConcluidas ? ['concluido'] : []}
        onMover={mover}
        renderItem={(t) => {
          const atrasada = t.etapa !== 'concluido' && t.prazo && t.prazo < hoje;
          return (
            <>
              <p className={`tarefa__texto${t.etapa === 'concluido' ? ' tarefa__texto--feita' : ''}`}>{t.texto}</p>
              {mostrarProjeto && (
                <p className="kanban__meta tarefa__origem">
                  {t.cliente_nome && <span className="etiqueta etiqueta--empresa" style={{ '--cor': corDaEmpresa(t.cliente_id) }} title={t.cliente_nome}>{t.cliente_nome}</span>}
                  <Link to={`/projetos/${t.projeto_id}?aba=tarefas`}>{t.projeto_titulo}</Link>
                </p>
              )}
              {t.prazo && (
                <p className={`kanban__meta${atrasada ? ' item-atrasado' : ''}`}>
                  {`Prazo ${formatarData(t.prazo)}`}{atrasada && ' · atrasada'}
                </p>
              )}
              <div className="tarefa__acoes">
                <button type="button" className="btn btn--icone" aria-label={`Mover ${t.texto} para cima`} onClick={() => posicao(t, 'cima')}><Icone nome="seta-cima" tamanho={18} /></button>
                <button type="button" className="btn btn--icone" aria-label={`Mover ${t.texto} para baixo`} onClick={() => posicao(t, 'baixo')}><Icone nome="seta-baixo" tamanho={18} /></button>
                <button type="button" className="btn btn--icone btn--icone-perigo" aria-label={`Excluir ${t.texto}`} onClick={() => excluir(t)}><Icone nome="fechar" tamanho={18} /></button>
              </div>
            </>
          );
        }}
      />
    </>
  );
}
