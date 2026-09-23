import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarData, hojeISO } from '../../lib/datas.js';

export function AbaTarefas({ projetoId }) {
  const { dados: tarefas, erro, recarregar } = useCarregar(() => api(`/projetos/${projetoId}/tarefas`), [projetoId]);
  const { valores, campo, setValores } = useFormulario({ texto: '', prazo: '' });
  const envio = useEnvio();

  const acao = (fn) => envio.executar(async () => { await fn(); recarregar(); });

  function adicionar(e) {
    e.preventDefault();
    acao(async () => {
      await api(`/projetos/${projetoId}/tarefas`, { method: 'POST', body: valores });
      setValores({ texto: '', prazo: '' });
    });
  }

  function mover(indice, delta) {
    const ids = tarefas.map((t) => t.id);
    const alvo = indice + delta;
    if (alvo < 0 || alvo >= ids.length) return;
    [ids[indice], ids[alvo]] = [ids[alvo], ids[indice]];
    acao(() => api(`/projetos/${projetoId}/tarefas/ordem`, { method: 'PUT', body: { ids } }));
  }

  if (erro) return <Aviso erro={erro} />;
  if (!tarefas) return <p>Carregando…</p>;
  const hoje = hojeISO();

  return (
    <div className="cartao">
      {tarefas.length ? (
        <ul className="lista">
          {tarefas.map((t, i) => (
            <li key={t.id}>
              <input
                type="checkbox"
                id={`tarefa-${t.id}`}
                checked={Boolean(t.concluida)}
                onChange={() => acao(() => api(`/tarefas/${t.id}`, { method: 'PUT', body: { concluida: !t.concluida } }))}
              />
              <label htmlFor={`tarefa-${t.id}`} style={t.concluida ? { textDecoration: 'line-through' } : undefined}>{t.texto}</label>
              {t.prazo && (
                <span className={!t.concluida && t.prazo < hoje ? 'item-atrasado' : 'vazio'}>{formatarData(t.prazo)}</span>
              )}
              <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Mover ${t.texto} para cima`} onClick={() => mover(i, -1)}>↑</button>
              <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Mover ${t.texto} para baixo`} onClick={() => mover(i, 1)}>↓</button>
              <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Excluir ${t.texto}`} onClick={() => acao(() => api(`/tarefas/${t.id}`, { method: 'DELETE' }))}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhuma tarefa ainda.</p>}

      <form onSubmit={adicionar} className="form form--linha" noValidate>
        <Campo rotulo="Nova tarefa" nome="texto" erros={envio.erros} {...campo('texto')} />
        <Campo rotulo="Prazo" nome="prazo" erros={envio.erros} type="date" {...campo('prazo')} />
        <button className="btn btn--primario" disabled={envio.enviando}>Adicionar</button>
      </form>
      <Aviso erro={envio.erro} />
    </div>
  );
}
