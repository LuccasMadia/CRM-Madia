import { diaLocal, formatarData } from '../../lib/datas.js';
import { ROTULO_TIPO } from '../../lib/rotulos.js';
import { Icone } from '../../components/Icone.jsx';

const ICONE_TIPO = { reels: 'reels', carrossel: 'carrossel' };

const dataHoraCurta = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function rotulo(item) {
  if (item.estado === 'publicando') return 'Publicando…';
  if (item.estado === 'agendado' && item.agendado_para) return `Agendado · ${dataHoraCurta(item.agendado_para)}`;
  return `${ROTULO_TIPO[item.tipo]}${item.data_planejada ? ` · ${formatarData(item.data_planejada)}` : ''}`;
}

function Pronto({ item, indice, total, onEditar, onMover }) {
  return (
    <li className="grid-ig__item grid-ig__item--pronto">
      <button type="button" className="grid-ig__abrir" aria-label={`Editar ${item.titulo}`} onClick={() => onEditar(item)}>
        {item.capa_url
          ? <img src={item.capa_url} alt={item.titulo} />
          : <span className="grid-ig__titulo">{item.titulo}</span>}
        <span className="grid-ig__rotulo">{rotulo(item)}</span>
      </button>
      {indice != null && (
        <span className="grid-ig__setas">
          {indice > 0 && (
            <button type="button" className="btn btn--fantasma" aria-label={`Mover ${item.titulo} para antes`} onClick={() => onMover(indice, -1)}><Icone nome="seta-esquerda" tamanho={16} /></button>
          )}
          {indice < total - 1 && (
            <button type="button" className="btn btn--fantasma" aria-label={`Mover ${item.titulo} para depois`} onClick={() => onMover(indice, 1)}><Icone nome="seta-direita" tamanho={16} /></button>
          )}
        </span>
      )}
    </li>
  );
}

function Publicado({ midia, selecionado, onSelecionar }) {
  const nome = midia.legenda?.trim() || `${ROTULO_TIPO[midia.tipo]} de ${formatarData(diaLocal(midia.publicado_em))}`;
  return (
    <li className={`grid-ig__item${selecionado ? ' grid-ig__item--selecionado' : ''}`}>
      <button type="button" className="grid-ig__abrir" aria-label={`Ver post ${nome}`} aria-pressed={selecionado} onClick={() => onSelecionar(midia.id)}>
        {midia.capa_url ? <img src={midia.capa_url} alt={nome} /> : <span className="grid-ig__titulo">{nome}</span>}
        {ICONE_TIPO[midia.tipo] && <span className="grid-ig__icone" aria-hidden="true"><Icone nome={ICONE_TIPO[midia.tipo]} tamanho={18} /></span>}
      </button>
    </li>
  );
}

// Só os prontos se reordenam: agendado/publicando já têm horário ou estão saindo.
// O índice das setas conta apenas entre os prontos, que é a fila que a API reordena.
export function GridInstagram({ prontos, midias, selecionada, onSelecionar, onEditar, onMover }) {
  const fila = prontos.filter((p) => p.estado === 'pronto');
  return (
    <ul className="grid-ig" aria-label="Grid do Instagram">
      {prontos.map((p) => (
        <Pronto
          key={`p${p.id}`}
          item={p}
          indice={p.estado === 'pronto' ? fila.indexOf(p) : null}
          total={fila.length}
          onEditar={onEditar}
          onMover={onMover}
        />
      ))}
      {midias.map((m) => <Publicado key={m.id} midia={m} selecionado={m.id === selecionada} onSelecionar={onSelecionar} />)}
    </ul>
  );
}
