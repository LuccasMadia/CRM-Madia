import { Link } from 'react-router';
import { ROTULO_ETAPA_TAREFA } from '../../lib/rotulos.js';

// "A fazer" não ganha etiqueta: só destaca o que já está andando ou parado no cliente.
const ETIQUETA_ETAPA = { fazendo: 'etiqueta--andamento', aguardando_cliente: 'etiqueta--aguardando' };

// Só visualização: criar, concluir e editar tarefas é na aba Tarefas.
export function TodoInicio({ tarefas }) {
  return (
    <section className="cartao">
      <div className="mission__cabeca">
        <h2>Para fazer</h2>
        <Link to="/tarefas" className="btn">Abrir Tarefas →</Link>
      </div>
      {tarefas.itens.length ? (
        <ul className="lista">
          {tarefas.itens.map((t) => (
            <li key={t.id}>
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
