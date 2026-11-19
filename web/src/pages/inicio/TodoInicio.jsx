import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { Aviso } from '../../components/Aviso.jsx';
import { ROTULO_ETAPA_TAREFA } from '../../lib/rotulos.js';

// "A fazer" não ganha etiqueta: só destaca o que já está andando ou parado no cliente.
const ETIQUETA_ETAPA = { fazendo: 'etiqueta--andamento', aguardando_cliente: 'etiqueta--aguardando' };

export function TodoInicio({ tarefas, aoMudar }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState(null);

  const emAndamento = useRef(false);
  const [ocupado, setOcupado] = useState(false);

  // guarda síncrona: dois Enter/cliques seguidos não disparam duas chamadas
  async function executar(chamada) {
    if (emAndamento.current) return false;
    emAndamento.current = true;
    setOcupado(true);
    setErro(null);
    try {
      await chamada();
    } catch (e) {
      setErro(e);
      return false;
    } finally {
      emAndamento.current = false;
      setOcupado(false);
    }
    aoMudar();
    return true;
  }

  async function adicionar(e) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo) return;
    if (await executar(() => api('/tarefas', { method: 'POST', body: { texto: limpo } }))) setTexto((t) => (t.trim() === limpo ? '' : t));
  }

  const concluir = (t) => executar(() => api(`/tarefas/${t.id}`, { method: 'PUT', body: { concluida: true } }));

  return (
    <section className="cartao">
      <div className="mission__cabeca">
        <h2>Para fazer</h2>
        <Link to="/tarefas" className="btn">Abrir Tarefas →</Link>
      </div>
      <form className="mission__nova" onSubmit={adicionar}>
        <input aria-label="Nova tarefa" placeholder="Nova tarefa" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button type="submit" className="btn btn--primario" disabled={ocupado}>Adicionar</button>
      </form>
      <Aviso erro={erro} />
      {tarefas.itens.length ? (
        <ul className="lista">
          {tarefas.itens.map((t) => (
            <li key={t.id}>
              <input type="checkbox" aria-label={`Concluir: ${t.texto}`} checked={false} disabled={ocupado} onChange={() => concluir(t)} />
              {t.link && t.link !== '/tarefas' ? <Link to={t.link}>{t.texto}</Link> : <span>{t.texto}</span>}
              {(t.projeto_titulo || t.cliente_nome) && <small className="vazio">{t.projeto_titulo || t.cliente_nome}</small>}
              {t.dias_atraso > 0 && <span className="item-atrasado">atrasada {t.dias_atraso}d</span>}
              {ETIQUETA_ETAPA[t.etapa] && <span className={`etiqueta ${ETIQUETA_ETAPA[t.etapa]}`}>{ROTULO_ETAPA_TAREFA[t.etapa]}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhuma tarefa aberta.</p>}
      {tarefas.total > tarefas.itens.length && <Link to="/tarefas">Ver todas ({tarefas.total})</Link>}
    </section>
  );
}
