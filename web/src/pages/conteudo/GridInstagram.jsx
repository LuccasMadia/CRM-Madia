import { formatarData } from '../../lib/datas.js';
import { ROTULO_TIPO } from '../../lib/rotulos.js';

const ICONE_TIPO = { reels: '▶', carrossel: '❐' };

function Pronto({ item, indice, total, onEditar, onMover }) {
  return (
    <li className="grid-ig__item grid-ig__item--pronto">
      <button type="button" className="grid-ig__abrir" aria-label={`Editar ${item.titulo}`} onClick={() => onEditar(item)}>
        {item.arte
          ? <img src={`/uploads/${item.arte}`} alt={item.titulo} />
          : <span className="grid-ig__titulo">{item.titulo}</span>}
        <span className="grid-ig__rotulo">
          {ROTULO_TIPO[item.tipo]}{item.data_planejada ? ` · ${formatarData(item.data_planejada)}` : ''}
        </span>
      </button>
      <span className="grid-ig__setas">
        {indice > 0 && (
          <button type="button" className="btn btn--fantasma" aria-label={`Mover ${item.titulo} para antes`} onClick={() => onMover(indice, -1)}>←</button>
        )}
        {indice < total - 1 && (
          <button type="button" className="btn btn--fantasma" aria-label={`Mover ${item.titulo} para depois`} onClick={() => onMover(indice, 1)}>→</button>
        )}
      </span>
    </li>
  );
}

function Publicado({ midia, selecionado, onSelecionar }) {
  const nome = midia.legenda?.trim() || `${ROTULO_TIPO[midia.tipo]} de ${formatarData(midia.publicado_em.slice(0, 10))}`;
  return (
    <li className={`grid-ig__item${selecionado ? ' grid-ig__item--selecionado' : ''}`}>
      <button type="button" className="grid-ig__abrir" aria-label={`Ver post ${nome}`} aria-pressed={selecionado} onClick={() => onSelecionar(midia.id)}>
        {midia.capa_url ? <img src={midia.capa_url} alt={nome} /> : <span className="grid-ig__titulo">{nome}</span>}
        {ICONE_TIPO[midia.tipo] && <span className="grid-ig__icone" aria-hidden="true">{ICONE_TIPO[midia.tipo]}</span>}
      </button>
    </li>
  );
}

export function GridInstagram({ prontos, midias, selecionada, onSelecionar, onEditar, onMover }) {
  return (
    <ul className="grid-ig" aria-label="Grid do Instagram">
      {prontos.map((p, i) => <Pronto key={`p${p.id}`} item={p} indice={i} total={prontos.length} onEditar={onEditar} onMover={onMover} />)}
      {midias.map((m) => <Publicado key={m.id} midia={m} selecionado={m.id === selecionada} onSelecionar={onSelecionar} />)}
    </ul>
  );
}
