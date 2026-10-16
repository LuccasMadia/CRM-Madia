import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { ESCALA } from './tema.js';

const LARGURA = 340;
const AREA = 200; // largura máxima das faixas; o resto é para nome e percentual
const MINIMO = 64; // faixa mais estreita, para o número caber
const ALTURA = 38;
const ESPACO = 6;

export function Funil({ etapas, perdidos }) {
  const topo = Math.max(etapas[0]?.quantidade ?? 0, 1);
  const largura = (q) => MINIMO + (AREA - MINIMO) * (q / topo);
  const centro = AREA / 2;
  const alturaTotal = etapas.length * (ALTURA + ESPACO) - ESPACO;

  return (
    <div className="funil">
      <svg viewBox={`0 0 ${LARGURA} ${alturaTotal}`} width="100%" role="img" aria-label="Funil de oportunidades">
        {etapas.map((e, i) => {
          const y = i * (ALTURA + ESPACO);
          const cima = largura(e.quantidade);
          const baixo = i + 1 < etapas.length ? largura(etapas[i + 1].quantidade) : cima * 0.85;
          const d = `M${centro - cima / 2} ${y} H${centro + cima / 2} L${centro + baixo / 2} ${y + ALTURA} H${centro - baixo / 2} Z`;
          return (
            <g key={e.etapa}>
              <title>{`${ROTULO_ETAPA[e.etapa]}: ${e.quantidade}`}</title>
              <path d={d} fill={ESCALA[i]} />
              <text x={centro} y={y + ALTURA / 2 + 5} textAnchor="middle" className="funil__quantidade">{e.quantidade}</text>
              <text x={AREA + 16} y={y + 16} className="funil__nome">{ROTULO_ETAPA[e.etapa]}</text>
              <text x={AREA + 16} y={y + 32} className="funil__percentual">{`${e.percentual}%`}</text>
            </g>
          );
        })}
      </svg>
      {perdidos > 0 && <p className="funil__perdidos">{`${perdidos} ${perdidos === 1 ? 'perdido' : 'perdidos'}`}</p>}
    </div>
  );
}
