import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Kanban } from './Kanban.jsx';
import { Aviso } from './Aviso.jsx';
import { Icone } from './Icone.jsx';
import { hojeISO } from '../lib/datas.js';
import { notificar } from '../lib/notificacoes.js';
import { corDaEmpresa } from '../lib/cores.js';
import { ETAPAS_TAREFA, ROTULO_ETAPA_TAREFA } from '../lib/rotulos.js';
import { TIPOS_TAREFA, ROTULO_PRIORIDADE, diasNaEtapa, estaAtrasada, plural, prazoCurto } from '../lib/tarefas.js';

const COLUNAS = ETAPAS_TAREFA.map((id) => ({ id, titulo: ROTULO_ETAPA_TAREFA[id] }));
const INTERATIVOS = 'button, a, select, input, textarea';

// Empresa e projeto do cartão; sem empresa, a tarefa é interna.
export function OrigemTarefa({ tarefa: t, comProjeto = true }) {
  if (!t.cliente_id) return <span className="etiqueta etiqueta--voce">Interna</span>;
  return (
    <>
      <span className="etiqueta etiqueta--empresa" style={{ '--cor': corDaEmpresa(t.cliente_id) }} title={t.cliente_nome}>{t.cliente_nome}</span>
      {comProjeto && t.projeto_id && <Link className="tarefa__projeto" to={`/projetos/${t.projeto_id}?aba=tarefas`}>{t.projeto_titulo}</Link>}
    </>
  );
}

// Só urgente e alta chamam atenção; baixa fica discreta e normal não aparece.
export function MarcaPrioridade({ prioridade }) {
  if (prioridade === 'normal' || !prioridade) return null;
  return <span className={`prioridade prioridade--${prioridade}`}>{ROTULO_PRIORIDADE[prioridade]}</span>;
}

export function IconeTipo({ tipo }) {
  const { icone, rotulo } = TIPOS_TAREFA[tipo] ?? TIPOS_TAREFA.interno;
  return <span className="tarefa__tipo" role="img" aria-label={rotulo} title={rotulo}><Icone nome={icone} tamanho={15} /></span>;
}

// Quadro de tarefas em 4 colunas. Arrastar (ou o menu do cartão) muda a coluna; clicar abre o painel.
// As setas (discretas) mudam a ordem dentro da coluna; excluir fica no painel, com confirmação.
export function QuadroTarefas({ tarefas, onMudou, onAbrir, mostrarProjeto = false, recolherConcluidas = false }) {
  const envio = useEnvio();
  const hoje = hojeISO();
  const acao = (fn) => envio.executar(async () => { await fn(); onMudou(); });

  const mover = (t, etapa) => acao(async () => {
    await api(`/tarefas/${t.id}`, { method: 'PUT', body: { etapa } });
    notificar(`"${t.texto}" foi para ${ROTULO_ETAPA_TAREFA[etapa]}.`);
  });
  const posicao = (t, direcao) => acao(() => api(`/tarefas/${t.id}/posicao`, { method: 'PUT', body: { direcao } }));

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
          const atrasada = estaAtrasada(t, hoje);
          const dias = t.etapa === 'aguardando_cliente' ? diasNaEtapa(t, hoje) : null;
          return (
            // O cartão todo abre o painel; botões, links e o menu "Mover" seguem o próprio clique.
            <div className="tarefa" onClick={(e) => { if (!e.target.closest(INTERATIVOS)) onAbrir?.(t); }}>
              {t.prioridade && t.prioridade !== 'normal' && <div className="tarefa__topo"><MarcaPrioridade prioridade={t.prioridade} /></div>}
              <button type="button" className={`tarefa__texto${t.etapa === 'concluido' ? ' tarefa__texto--feita' : ''}`} onClick={() => onAbrir?.(t)}>
                {t.texto}
              </button>
              {mostrarProjeto && <p className="kanban__meta tarefa__origem"><OrigemTarefa tarefa={t} /></p>}
              <div className="tarefa__rodape">
                <IconeTipo tipo={t.tipo} />
                {t.prazo && (
                  <span className={`tarefa__info${atrasada ? ' item-atrasado' : ''}`} title={`Prazo ${prazoCurto(t.prazo, hoje)}`}>
                    <Icone nome="calendario" tamanho={14} />{`${prazoCurto(t.prazo, hoje)}${atrasada ? ' · atrasada' : ''}`}
                  </span>
                )}
                {dias !== null && (
                  <span className={`tarefa__info${dias > 5 ? ' tarefa__info--atencao' : ''}`} title="Aguardando o cliente">
                    <Icone nome="relogio" tamanho={14} />{dias ? `há ${plural(dias, 'dia', 'dias')}` : 'desde hoje'}
                  </span>
                )}
                {t.checklist_total > 0 && (
                  <span className={`tarefa__info${t.checklist_feitos === t.checklist_total ? ' tarefa__info--ok' : ''}`} aria-label={`Checklist ${t.checklist_feitos} de ${t.checklist_total}`}>
                    <Icone nome="check" tamanho={14} />{`${t.checklist_feitos}/${t.checklist_total}`}
                  </span>
                )}
                {Boolean(t.tem_descricao) && <span className="tarefa__info" role="img" aria-label="Tem descrição" title="Tem descrição"><Icone nome="descricao" tamanho={14} /></span>}
                {t.comentarios_total > 0 && (
                  <span className="tarefa__info" aria-label={plural(t.comentarios_total, 'comentário', 'comentários')}>
                    <Icone nome="comentario" tamanho={14} />{t.comentarios_total}
                  </span>
                )}
                <span className="tarefa__setas">
                  <button type="button" className="btn btn--icone" aria-label={`Mover ${t.texto} para cima`} onClick={() => posicao(t, 'cima')}><Icone nome="seta-cima" tamanho={14} /></button>
                  <button type="button" className="btn btn--icone" aria-label={`Mover ${t.texto} para baixo`} onClick={() => posicao(t, 'baixo')}><Icone nome="seta-baixo" tamanho={14} /></button>
                </span>
              </div>
            </div>
          );
        }}
      />
    </>
  );
}
