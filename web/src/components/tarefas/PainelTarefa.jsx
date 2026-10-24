import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { Aviso } from '../Aviso.jsx';
import { Carregando } from '../Carregando.jsx';
import { Icone } from '../Icone.jsx';
import { formatarData } from '../../lib/datas.js';
import { notificar } from '../../lib/notificacoes.js';
import { ETAPAS_TAREFA, ROTULO_ETAPA_TAREFA } from '../../lib/rotulos.js';
import { TIPOS, TIPOS_TAREFA, PRIORIDADES, ROTULO_PRIORIDADE, partesComLinks } from '../../lib/tarefas.js';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Painel lateral de uma tarefa (estilo Linear/Trello): tudo se edita no lugar e salva na hora.
// Fecha com Esc, com o × ou clicando fora. onMudou avisa o quadro para recarregar.
export function PainelTarefa({ id, onFechar, onMudou }) {
  const tarefa = useCarregar(() => api(`/tarefas/${id}`), [id]);
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const clienteId = tarefa.dados?.cliente_id ?? null;
  const { dados: projetos } = useCarregar(() => (clienteId ? api(`/projetos?cliente_id=${clienteId}`) : Promise.resolve([])), [clienteId]);
  const envio = useEnvio();
  const [confirmar, dialogo] = useConfirmacao();
  const caixa = useRef(null);

  // Esc fecha, a menos que haja um diálogo (confirmação) por cima: aí o Esc é dele.
  const aoEsc = useRef(null);
  aoEsc.current = () => { if (!dialogo) onFechar(); };
  useEffect(() => {
    const teclar = (e) => { if (e.key === 'Escape') aoEsc.current(); };
    window.addEventListener('keydown', teclar);
    caixa.current?.focus();
    return () => window.removeEventListener('keydown', teclar);
  }, []);

  const recarregarTudo = () => { tarefa.recarregar(); onMudou?.(); };
  const acao = (fn) => envio.executar(async () => { await fn(); recarregarTudo(); });
  const salvar = (corpo) => acao(() => api(`/tarefas/${id}`, { method: 'PUT', body: corpo }));

  function excluir() {
    confirmar({
      titulo: 'Excluir tarefa?',
      mensagem: `"${tarefa.dados.texto}" some do quadro, com o checklist e os comentários.`,
      onConfirmar: async () => {
        await api(`/tarefas/${id}`, { method: 'DELETE' });
        notificar('Tarefa excluída.');
        onMudou?.();
        onFechar();
      },
    });
  }

  const t = tarefa.dados;
  const abertos = (projetos ?? []).filter((p) => p.etapa !== 'perdido' || p.id === t?.projeto_id);

  return (
    <div className="painel-lateral__fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <aside ref={caixa} className="painel-lateral" role="dialog" aria-label={t ? `Tarefa: ${t.texto}` : 'Tarefa'} tabIndex={-1}>
        <header className="painel-lateral__topo">
          <span className="painel-tarefa__tipo">
            {t && <><Icone nome={TIPOS_TAREFA[t.tipo].icone} tamanho={16} /> {TIPOS_TAREFA[t.tipo].rotulo}</>}
          </span>
          <button type="button" className="btn btn--icone" aria-label="Fechar tarefa" onClick={onFechar}><Icone nome="fechar" /></button>
        </header>
        <Aviso erro={tarefa.erro ?? envio.erro} />
        {!t ? (!tarefa.erro && <Carregando />) : (
          <>
            <Titulo key={`${t.id}-${t.texto}`} texto={t.texto} onSalvar={(texto) => salvar({ texto })} />

            <dl className="painel-tarefa__props">
              <dt><label htmlFor="tarefa-etapa">Etapa</label></dt>
              <dd>
                <select id="tarefa-etapa" className="select-compacto" value={t.etapa} onChange={(e) => salvar({ etapa: e.target.value })}>
                  {ETAPAS_TAREFA.map((e) => <option key={e} value={e}>{ROTULO_ETAPA_TAREFA[e]}</option>)}
                </select>
              </dd>
              <dt><label htmlFor="tarefa-prioridade">Prioridade</label></dt>
              <dd>
                <select id="tarefa-prioridade" className={`select-compacto prioridade-select prioridade-select--${t.prioridade}`} value={t.prioridade}
                  onChange={(e) => salvar({ prioridade: e.target.value })}>
                  {PRIORIDADES.map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
                </select>
              </dd>
              <dt><label htmlFor="tarefa-tipo">Tipo</label></dt>
              <dd className="painel-tarefa__com-icone">
                <Icone nome={TIPOS_TAREFA[t.tipo].icone} tamanho={16} />
                <select id="tarefa-tipo" className="select-compacto" value={t.tipo} onChange={(e) => salvar({ tipo: e.target.value })}>
                  {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{TIPOS_TAREFA[tipo].rotulo}</option>)}
                </select>
              </dd>
              <dt><label htmlFor="tarefa-cliente">Empresa</label></dt>
              <dd>
                {/* Trocar a empresa tira a tarefa de um projeto que é de outra empresa (o servidor cuida). */}
                <select id="tarefa-cliente" className="select-compacto" value={t.cliente_id ?? ''}
                  onChange={(e) => salvar({ cliente_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Nenhuma (interna)</option>
                  {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </dd>
              <dt><label htmlFor="tarefa-projeto">Projeto</label></dt>
              <dd className="painel-tarefa__com-icone">
                <select id="tarefa-projeto" className="select-compacto" value={t.projeto_id ?? ''} disabled={!t.cliente_id}
                  onChange={(e) => salvar({ projeto_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{t.cliente_id ? 'Sem projeto' : 'Escolha a empresa antes'}</option>
                  {abertos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                </select>
                {t.projeto_id && <Link className="painel-tarefa__abrir" to={`/projetos/${t.projeto_id}?aba=tarefas`}>Abrir</Link>}
              </dd>
              <dt><label htmlFor="tarefa-prazo">Prazo</label></dt>
              <dd>
                <input id="tarefa-prazo" type="date" className="select-compacto" value={t.prazo ?? ''}
                  onChange={(e) => salvar({ prazo: e.target.value || null })} />
              </dd>
            </dl>

            <Descricao key={`d-${t.id}-${t.atualizado_em}`} texto={t.descricao} onSalvar={(descricao) => salvar({ descricao })} />
            <Checklist tarefa={t} acao={acao} />
            <Comentarios tarefa={t} acao={acao} confirmar={confirmar} />

            <footer className="painel-tarefa__rodape">
              <span>
                {`Criada em ${formatarData(t.criado_em)}`}
                {t.concluida_em && ` · Concluída em ${formatarData(t.concluida_em)}`}
              </span>
              <button type="button" className="btn--link-perigo" onClick={excluir}>Excluir tarefa</button>
            </footer>
          </>
        )}
      </aside>
      {dialogo}
    </div>
  );
}

// Título grande, editado no próprio lugar: salva ao sair do campo ou com Enter; Esc desfaz.
function Titulo({ texto, onSalvar }) {
  const [valor, setValor] = useState(texto);
  // A grade do painel encolhe o textarea: a altura vem das linhas que o título ocupa.
  const linhas = Math.max(1, Math.ceil(valor.length / 46));
  const salvar = () => {
    const limpo = valor.trim();
    if (!limpo) setValor(texto);
    else if (limpo !== texto) onSalvar(limpo);
  };
  return (
    <textarea
      className="painel-tarefa__titulo" aria-label="Título da tarefa" rows={linhas} value={valor}
      style={{ minHeight: `calc(${linhas} * 1.3em + 12px)` }}
      onChange={(e) => setValor(e.target.value.replace(/\n/g, ' '))}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { e.stopPropagation(); setValor(texto); }
      }}
    />
  );
}

function TextoComLinks({ texto }) {
  return partesComLinks(texto).map((p, i) => (p.link
    ? <a key={i} href={p.link} target="_blank" rel="noreferrer">{p.texto}</a>
    : <span key={i}>{p.texto}</span>));
}

function Descricao({ texto, onSalvar }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(texto ?? '');
  const tem = Boolean(texto?.trim());

  function salvar(e) {
    e.preventDefault();
    onSalvar(valor.trim() || null);
    setEditando(false);
  }

  return (
    <section className="painel-tarefa__secao" aria-label="Descrição">
      <h3 className="painel-tarefa__subtitulo"><Icone nome="descricao" tamanho={16} /> Descrição</h3>
      {editando ? (
        <form onSubmit={salvar} className="painel-tarefa__editor">
          <textarea aria-label="Descrição da tarefa" rows={5} value={valor} autoFocus onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditando(false); setValor(texto ?? ''); } }} />
          <div className="form--linha">
            <button className="btn btn--primario btn--pequeno">Salvar descrição</button>
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => { setEditando(false); setValor(texto ?? ''); }}>Cancelar</button>
          </div>
        </form>
      ) : tem ? (
        <div className="painel-tarefa__descricao">
          <p><TextoComLinks texto={texto} /></p>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(true)}>Editar descrição</button>
        </div>
      ) : (
        <button type="button" className="painel-tarefa__vazio" onClick={() => setEditando(true)}>Adicionar descrição…</button>
      )}
    </section>
  );
}

function Checklist({ tarefa, acao }) {
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState(null);
  const itens = tarefa.checklist;
  const feitos = itens.filter((i) => i.feito).length;

  function adicionar(e) {
    e.preventDefault();
    if (!novo.trim()) return;
    acao(async () => {
      await api(`/tarefas/${tarefa.id}/checklist`, { method: 'POST', body: { texto: novo } });
      setNovo('');
    });
  }
  const mudar = (item, corpo) => acao(() => api(`/tarefas/checklist/${item.id}`, { method: 'PUT', body: corpo }));
  function mover(i, j) {
    const ids = itens.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    acao(() => api(`/tarefas/${tarefa.id}/checklist/ordem`, { method: 'PUT', body: { ids } }));
  }

  return (
    <section className="painel-tarefa__secao" aria-label="Checklist">
      <h3 className="painel-tarefa__subtitulo">
        <Icone nome="check" tamanho={16} /> Checklist
        {itens.length > 0 && <span className="painel-tarefa__contagem">{`${feitos}/${itens.length}`}</span>}
      </h3>
      {itens.length > 0 && (
        <div className="progresso" role="progressbar" aria-label="Progresso do checklist" aria-valuemin={0} aria-valuemax={itens.length} aria-valuenow={feitos}>
          <span style={{ width: `${(feitos / itens.length) * 100}%` }} />
        </div>
      )}
      <ul className="checklist">
        {itens.map((item, i) => (
          <li key={item.id} className={item.feito ? 'checklist__item checklist__item--feito' : 'checklist__item'}>
            <input type="checkbox" aria-label={`Feito: ${item.texto}`} checked={Boolean(item.feito)} onChange={(e) => mudar(item, { feito: e.target.checked })} />
            {editando === item.id ? (
              <input className="checklist__editar" aria-label={`Renomear ${item.texto}`} defaultValue={item.texto} autoFocus
                onBlur={(e) => { setEditando(null); if (e.target.value.trim() && e.target.value.trim() !== item.texto) mudar(item, { texto: e.target.value }); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.value = item.texto; setEditando(null); }
                }} />
            ) : (
              <button type="button" className="checklist__texto" title="Clique para renomear" onClick={() => setEditando(item.id)}>{item.texto}</button>
            )}
            <span className="checklist__acoes">
              {i > 0 && <button type="button" className="btn btn--icone" aria-label={`Subir ${item.texto}`} onClick={() => mover(i, i - 1)}><Icone nome="seta-cima" tamanho={14} /></button>}
              {i < itens.length - 1 && <button type="button" className="btn btn--icone" aria-label={`Descer ${item.texto}`} onClick={() => mover(i, i + 1)}><Icone nome="seta-baixo" tamanho={14} /></button>}
              <button type="button" className="btn btn--icone btn--icone-perigo" aria-label={`Apagar ${item.texto}`}
                onClick={() => acao(() => api(`/tarefas/checklist/${item.id}`, { method: 'DELETE' }))}><Icone nome="fechar" tamanho={14} /></button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={adicionar} className="checklist__novo">
        <input aria-label="Novo item do checklist" placeholder="Adicionar item e Enter" value={novo} onChange={(e) => setNovo(e.target.value)} />
      </form>
    </section>
  );
}

function Comentarios({ tarefa, acao, confirmar }) {
  const [texto, setTexto] = useState('');

  function comentar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    acao(async () => {
      await api(`/tarefas/${tarefa.id}/comentarios`, { method: 'POST', body: { texto } });
      setTexto('');
    });
  }
  function apagar(c) {
    confirmar({
      titulo: 'Apagar comentário?',
      mensagem: `"${c.texto}"`,
      rotuloConfirmar: 'Apagar',
      onConfirmar: () => acao(() => api(`/tarefas/comentarios/${c.id}`, { method: 'DELETE' })),
    });
  }

  return (
    <section className="painel-tarefa__secao" aria-label="Comentários">
      <h3 className="painel-tarefa__subtitulo"><Icone nome="comentario" tamanho={16} /> Comentários</h3>
      {tarefa.comentarios.length > 0 && (
        <ol className="linha-tempo">
          {tarefa.comentarios.map((c) => (
            <li key={c.id} className="linha-tempo__item">
              <div className="linha-tempo__cabeca">
                <time dateTime={c.criado_em}>{dataHora(c.criado_em)}</time>
                <button type="button" className="btn btn--icone btn--icone-perigo" aria-label="Apagar comentário" onClick={() => apagar(c)}><Icone nome="fechar" tamanho={14} /></button>
              </div>
              <p><TextoComLinks texto={c.texto} /></p>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={comentar} className="painel-tarefa__editor">
        <textarea aria-label="Novo comentário" rows={2} placeholder="Escreva um comentário…" value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) comentar(e); }} />
        <div><button className="btn btn--pequeno" disabled={!texto.trim()}>Comentar</button></div>
      </form>
    </section>
  );
}
