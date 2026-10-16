import { formatarData } from '../../lib/datas.js';
import { ROTULO_TIPO } from '../../lib/rotulos.js';

export function ListaRascunhos({ rascunhos, onEditar }) {
  return (
    <section className="cartao" aria-label="Rascunhos">
      <h2>Rascunhos</h2>
      {rascunhos.length ? (
        <ul className="lista-rascunhos">
          {rascunhos.map((r) => (
            <li key={r.id}>
              <button type="button" className="kanban__titulo" onClick={() => onEditar(r)}>{r.titulo}</button>
              <span className="kanban__meta">
                {ROTULO_TIPO[r.tipo]}{r.data_planejada ? ` · ${formatarData(r.data_planejada)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhum rascunho. Quando marcar um como Pronto, ele entra no grid.</p>}
    </section>
  );
}
