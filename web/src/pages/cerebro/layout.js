import { fatiaDaArea, fnv, noAnel } from './posicoes.js';

export const R = { centro: 22, skills: 70, memoriaDe: 95, memoriaAte: 200, rotulos: 216, rotinas: 235, apps: 275 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const LARGURA_ESPIRAL = 0.5; // fração da fatia que cada faixa percorre (limite do plano: 0,6)
const MARGEM = 14;

export const emVolta = (lista, raio) => lista.map((item, i) => ({ item, ...noAnel(-Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / lista.length, raio) }));

export const quantasFaixas = (n) => clamp(3 + Math.floor(n / 150), 3, 5);

// Ponto do eixo da faixa `k` (de `nf`) na posição t∈[0,1], mais o vetor unitário perpendicular em coordenadas (radial, angular).
export function eixoDaFaixa(fatia, nf, k, t) {
  const w = fatia.fim - fatia.inicio;
  const raio = R.memoriaDe + t * (R.memoriaAte - R.memoriaDe);
  const sweep = LARGURA_ESPIRAL * w;
  const angulo = fatia.inicio + w * (0.2 + 0.2 * (nf > 1 ? k / (nf - 1) : 0)) + t * sweep;
  const tr = R.memoriaAte - R.memoriaDe; // d(raio)/dt
  const ta = raio * sweep; // comprimento angular por dt
  const norma = Math.hypot(tr, ta);
  return { raio, angulo, perpRadial: -ta / norma, perpAngular: tr / norma };
}

export function posicionarGrafo(areas) {
  const mapa = new Map();
  areas.forEach((area, i) => {
    const fatia = fatiaDaArea(i, areas.length);
    const nf = quantasFaixas(area.pontos.length);
    for (const { id, destaque, vivo, tipo } of area.pontos) {
      const k = Math.min(nf - 1, Math.floor(fnv(id) * nf));
      const e = eixoDaFaixa(fatia, nf, k, fnv(`${id}#t`));
      const d = (fnv(`${id}#d`) * 2 - 1) * (vivo ? 4 : 12); // ±, sinal e tamanho do mesmo sorteio
      const r = clamp(e.raio + d * e.perpRadial, R.memoriaDe - MARGEM, R.memoriaAte + MARGEM);
      const a = clamp(e.angulo + (d * e.perpAngular) / e.raio, fatia.inicio, fatia.fim);
      const raio = destaque ? 5 : tipo === 'arquivo' ? 3.5 : vivo ? 3 : 1.6;
      mapa.set(id, { ...noAnel(a, r), area: area.id, vivo, raio });
    }
  });
  return mapa;
}
