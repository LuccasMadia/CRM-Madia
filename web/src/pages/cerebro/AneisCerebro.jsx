import { useMemo, useState } from 'react';
import { CENTRO, fatiaDaArea, noAnel, posicionarPontos } from './posicoes.js';
import { ligadosA, montarVizinhos } from './ligacoes.js';

const R = { centro: 22, skills: 70, memoriaDe: 95, memoriaAte: 200, rotulos: 216, rotinas: 235, apps: 275 };
const TUDO = '0 0 600 600';
const curto = (texto) => (texto.length > 24 ? `${texto.slice(0, 23)}…` : texto);
// atraso negativo diferente por ponto: cada um flutua no seu tempo, sem andarem todos juntos
const atraso = (x, y) => ({ animationDelay: `-${((x * 7 + y * 13) % 60) / 10}s` });
// raio do alvo de toque de cada ponto da memória, em unidades do viewBox (~5px de raio a 375px de largura, ~11px a 720px)
export const ALVO_TOQUE = 9;

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
// selecionado: id do ponto aberto no painel (mantém as ligações acesas no celular, onde não há mouse).
export function AneisCerebro({ dados, aproximada, aoAbrir, aoAproximar, selecionado = null }) {
  const [foco, setFoco] = useState(null);
  const { areas } = dados.memoria;
  const pontos = useMemo(() => {
    const porId = new Map(areas.flatMap((a) => a.pontos.map((p) => [p.id, p])));
    // destaques por último: no SVG quem vem depois fica por cima, então um vizinho nunca cobre um ponto que pede ação
    return posicionarPontos(areas, R.memoriaDe, R.memoriaAte)
      .map((pos) => ({ ...pos, ponto: porId.get(pos.id) }))
      .sort((a, b) => a.ponto.destaque - b.ponto.destaque);
  }, [areas]);
  const apps = useMemo(() => emVolta(dados.apps, R.apps), [dados.apps]);
  const vizinhos = useMemo(() => montarVizinhos(areas.flatMap((a) => a.pontos)), [areas]);
  const posicao = useMemo(() => new Map([
    ...pontos.map((p) => [p.id, { x: p.x, y: p.y, rotulo: p.ponto.rotulo }]),
    ...apps.map(({ item, x, y }) => [`app:${item.id}`, { x, y, rotulo: item.nome }]),
  ]), [pontos, apps]);
  const ativo = foco ?? selecionado;
  const { linhas, acesos } = useMemo(
    () => (ativo ? ligadosA(ativo, vizinhos) : { linhas: [], acesos: new Set() }),
    [ativo, vizinhos],
  );
  const estado = (id) => (id === ativo ? ' aneis__item--foco' : acesos.has(id) ? ' aneis__item--aceso' : '');
  const passar = (id) => ({ onMouseEnter: () => setFoco(id), onMouseLeave: () => setFoco(null), onFocus: () => setFoco(id), onBlur: () => setFoco(null) });
  const rotuloArea = Object.fromEntries(areas.map((a) => [a.id, a.rotulo]));
  const indice = areas.findIndex((a) => a.id === aproximada);
  const viewBox = indice >= 0 ? recorteDaFatia(indice, areas.length) : TUDO;

  return (
    <svg className={`aneis${ativo ? ' aneis--com-foco' : ''}`} viewBox={viewBox} role="group" aria-label="Mapa do cérebro">
      <circle className="aneis__fundo" cx={CENTRO} cy={CENTRO} r={R.memoriaAte + 8} />
      <circle className="aneis__linha aneis__linha--apps" cx={CENTRO} cy={CENTRO} r={R.apps} />
      <circle className="aneis__linha aneis__linha--rotinas" cx={CENTRO} cy={CENTRO} r={R.rotinas} />
      <circle className="aneis__linha aneis__linha--skills" cx={CENTRO} cy={CENTRO} r={R.skills} />
      <text className="aneis__nome aneis__nome--apps" x={CENTRO} y={CENTRO - R.apps + 4}>APPS</text>
      <text className="aneis__nome aneis__nome--rotinas" x={CENTRO} y={CENTRO - R.rotinas + 4}>ROTINAS</text>

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

      {apps.map(({ item, x, y }) => (
        <g key={item.id} className={`aneis__app${item.conectado ? ' aneis__app--conectado' : ''}${estado(`app:${item.id}`)}`} {...passar(`app:${item.id}`)} {...botao(item.nome, () => aoAbrir({ tipo: 'app', dados: item }))}>
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
      {areas.map((a, i) => {
        const { x, y } = noAnel(fatiaDaArea(i, areas.length).meio, R.rotulos);
        return (
          <text key={a.id} className={`aneis__area aneis__area--${a.id}`} x={x} y={y} {...botao(`Aproximar ${a.rotulo}`, () => aoAproximar(a.id))}>
            {a.rotulo}
          </text>
        );
      })}

      <g className="aneis__ligacoes" aria-hidden="true">
        {linhas.filter(([a, b]) => posicao.has(a) && posicao.has(b)).map(([a, b]) => (
          <line key={`${a}>${b}`} x1={posicao.get(a).x} y1={posicao.get(a).y} x2={posicao.get(b).x} y2={posicao.get(b).y} />
        ))}
      </g>

      {pontos.map(({ id, area, x, y, ponto }) => (
        <g key={id} className={`aneis__ponto aneis__ponto--${area}${ponto.destaque ? ' aneis__ponto--destaque' : ''}${estado(id)}`}>
          <g className="aneis__flutua" style={atraso(x, y)}>
            {ponto.destaque && <circle className="aneis__brilho" cx={x} cy={y} r={10} aria-hidden="true" />}
            <circle className="aneis__marca" cx={x} cy={y} r={ponto.destaque ? 5 : 2.5} aria-hidden="true" />
          </g>
          {/* alvo invisível maior que o ponto: dá para tocar no celular */}
          <circle className="aneis__alvo" cx={x} cy={y} r={ALVO_TOQUE} {...passar(id)} {...botao(ponto.rotulo, () => aoAbrir({ tipo: 'ponto', dados: { ...ponto, area: rotuloArea[area] } }))}>
            <title>{ponto.rotulo}</title>
          </circle>
        </g>
      ))}

      {/* nomes do que está ligado ao ponto em foco, por cima de tudo */}
      <g className="aneis__nomes-ligados" aria-hidden="true">
        {[...acesos].filter((id) => posicao.has(id)).map((id) => {
          const { x, y, rotulo } = posicao.get(id);
          return <text key={id} className={id === ativo ? 'aneis__nome-ligado--foco' : undefined} x={x} y={y - 9}>{curto(rotulo)}</text>;
        })}
      </g>
    </svg>
  );
}
