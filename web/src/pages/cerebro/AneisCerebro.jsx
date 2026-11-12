import { useMemo } from 'react';
import { CENTRO, fatiaDaArea, noAnel, posicionarPontos } from './posicoes.js';

const R = { centro: 22, skills: 70, memoriaDe: 95, memoriaAte: 200, rotulos: 216, rotinas: 235, apps: 275 };
const TUDO = '0 0 600 600';

// Itens distribuídos por igual num anel, deslocados meio passo para deixar o topo livre para o nome do anel.
const emVolta = (lista, raio) => lista.map((item, i) => ({ item, ...noAnel(-Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / lista.length, raio) }));

const hexagono = (x, y, r) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 6 + (i * Math.PI) / 3;
  return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

// Recorte do viewBox que mostra só a fatia de uma área (com uma margem).
function recorteDaFatia(i, n) {
  const { inicio, fim } = fatiaDaArea(i, n);
  const pts = [];
  for (let k = 0; k <= 8; k++) {
    const a = inicio + ((fim - inicio) * k) / 8;
    pts.push(noAnel(a, R.memoriaDe), noAnel(a, R.rotinas));
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const margem = 16;
  const x = Math.min(...xs) - margem;
  const y = Math.min(...ys) - margem;
  const lado = Math.max(Math.max(...xs) - x, Math.max(...ys) - y) + margem;
  return `${x.toFixed(1)} ${y.toFixed(1)} ${lado.toFixed(1)} ${lado.toFixed(1)}`;
}

// Props de um elemento SVG que age como botão: clique, Enter ou espaço.
function botao(rotulo, aoAbrir) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': rotulo,
    onClick: aoAbrir,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        aoAbrir();
      }
    },
  };
}

// Anéis do cérebro: centro (CLAUDE.md), skills, memória (nuvens por área), rotinas e apps.
// aoAbrir({ tipo, dados }) abre o painel; aoAproximar(idArea | null) muda o recorte.
export function AneisCerebro({ dados, aproximada, aoAbrir, aoAproximar }) {
  const { areas } = dados.memoria;
  const pontos = useMemo(() => {
    const porId = new Map(areas.flatMap((a) => a.pontos.map((p) => [p.id, p])));
    return posicionarPontos(areas, R.memoriaDe, R.memoriaAte).map((pos) => ({ ...pos, ponto: porId.get(pos.id) }));
  }, [areas]);
  const rotuloArea = Object.fromEntries(areas.map((a) => [a.id, a.rotulo]));
  const indice = areas.findIndex((a) => a.id === aproximada);
  const viewBox = indice >= 0 ? recorteDaFatia(indice, areas.length) : TUDO;

  return (
    <svg className="aneis" viewBox={viewBox} role="group" aria-label="Mapa do cérebro">
      <circle className="aneis__fundo" cx={CENTRO} cy={CENTRO} r={R.memoriaAte + 8} />
      <circle className="aneis__linha aneis__linha--apps" cx={CENTRO} cy={CENTRO} r={R.apps} />
      <circle className="aneis__linha aneis__linha--rotinas" cx={CENTRO} cy={CENTRO} r={R.rotinas} />
      <circle className="aneis__linha aneis__linha--skills" cx={CENTRO} cy={CENTRO} r={R.skills} />
      <text className="aneis__nome aneis__nome--apps" x={CENTRO} y={CENTRO - R.apps + 4}>APPS</text>
      <text className="aneis__nome aneis__nome--rotinas" x={CENTRO} y={CENTRO - R.rotinas + 4}>ROTINAS</text>

      {areas.map((a, i) => {
        const { x, y } = noAnel(fatiaDaArea(i, areas.length).meio, R.rotulos);
        return (
          <text key={a.id} className={`aneis__area aneis__area--${a.id}`} x={x} y={y} {...botao(`Aproximar ${a.rotulo}`, () => aoAproximar(a.id))}>
            {a.rotulo}
          </text>
        );
      })}

      {pontos.map(({ id, area, x, y, ponto }) => (
        <g key={id} className={`aneis__ponto aneis__ponto--${area}${ponto.destaque ? ' aneis__ponto--destaque' : ''}`}>
          {ponto.destaque && <circle className="aneis__brilho" cx={x} cy={y} r={7} aria-hidden="true" />}
          <circle cx={x} cy={y} r={ponto.destaque ? 3.5 : 2.5} {...botao(ponto.rotulo, () => aoAbrir({ tipo: 'ponto', dados: { ...ponto, area: rotuloArea[area] } }))}>
            <title>{ponto.rotulo}</title>
          </circle>
        </g>
      ))}

      {emVolta(dados.skills, R.skills).map(({ item, x, y }) => (
        <circle key={item.id} className="aneis__skill" cx={x} cy={y} r={5} {...botao(item.nome, () => aoAbrir({ tipo: 'skill', dados: item }))}>
          <title>{item.nome}</title>
        </circle>
      ))}

      {emVolta(dados.rotinas, R.rotinas).map(({ item, x, y }) => (
        <circle key={item.id} className={`aneis__rotina aneis__rotina--${item.estado}`} cx={x} cy={y} r={5} {...botao(item.nome, () => aoAbrir({ tipo: 'rotina', dados: item }))}>
          <title>{item.nome}</title>
        </circle>
      ))}

      {emVolta(dados.apps, R.apps).map(({ item, x, y }) => (
        <g key={item.id} className={`aneis__app${item.conectado ? ' aneis__app--conectado' : ''}`} {...botao(item.nome, () => aoAbrir({ tipo: 'app', dados: item }))}>
          <title>{item.nome}</title>
          <polygon points={hexagono(x, y, 12)} />
          <text x={x} y={y} aria-hidden="true">{item.nome.slice(0, 1).toUpperCase()}</text>
        </g>
      ))}

      {dados.centro && (
        <g className="aneis__centro" {...botao('CLAUDE.md', () => aoAbrir({ tipo: 'centro', dados: dados.centro }))}>
          <circle cx={CENTRO} cy={CENTRO} r={R.centro} />
          <text x={CENTRO} y={CENTRO} aria-hidden="true">CLAUDE.md</text>
        </g>
      )}
    </svg>
  );
}
