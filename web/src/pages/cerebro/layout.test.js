import { describe, expect, it } from 'vitest';
import { eixoDaFaixa, posicionarGrafo, quantasFaixas, R } from './layout.js';
import { CENTRO, fatiaDaArea, fnv } from './posicoes.js';

const pt = (id, vivo = true, tipo = 'cliente') => ({ id, tipo, vivo, destaque: false });
const gerar = (n, prefixo = 'p') => Array.from({ length: n }, (_, i) => pt(`${prefixo}:${i}`, i % 2 === 0));
const areas = (n) => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ id, rotulo: id, pontos: gerar(n, id) }));

describe('posicionarGrafo', () => {
  it('é determinístico', () => {
    expect([...posicionarGrafo(areas(50))]).toEqual([...posicionarGrafo(areas(50))]);
  });

  it('adicionar um ponto não move os outros da mesma área', () => {
    const base = areas(40);
    const antes = posicionarGrafo(base);
    const mais = base.map((a, i) => (i === 2 ? { ...a, pontos: [...a.pontos, pt('novo')] } : a));
    const depois = posicionarGrafo(mais);
    for (const p of base[2].pontos) expect(depois.get(p.id)).toEqual(antes.get(p.id));
  });

  it('todo ponto fica na fatia da área e no anel da memória', () => {
    const lista = areas(300);
    const mapa = posicionarGrafo(lista);
    lista.forEach((a, i) => {
      const { inicio, fim } = fatiaDaArea(i, lista.length);
      for (const { id } of a.pontos) {
        const { x, y } = mapa.get(id);
        const r = Math.hypot(x - CENTRO, y - CENTRO);
        let ang = Math.atan2(y - CENTRO, x - CENTRO);
        if (ang < inicio - 1e-9) ang += 2 * Math.PI;
        expect(r).toBeGreaterThanOrEqual(R.memoriaDe - 14 - 1e-9);
        expect(r).toBeLessThanOrEqual(R.memoriaAte + 14 + 1e-9);
        expect(ang).toBeGreaterThanOrEqual(inicio - 1e-9);
        expect(ang).toBeLessThanOrEqual(fim + 1e-9);
      }
    });
  });

  it('vivo fica, em média, mais perto do eixo da faixa que o histórico', () => {
    const n = 600;
    const lista = [{ id: 'a', pontos: gerar(n) }];
    const mapa = posicionarGrafo(lista);
    const fatia = fatiaDaArea(0, 1);
    const nf = quantasFaixas(n);
    const dist = ({ id }) => {
      const k = Math.min(nf - 1, Math.floor(fnv(id) * nf));
      const e = eixoDaFaixa(fatia, nf, k, fnv(`${id}#t`));
      const p = mapa.get(id);
      return Math.hypot(p.x - (CENTRO + e.raio * Math.cos(e.angulo)), p.y - (CENTRO + e.raio * Math.sin(e.angulo)));
    };
    const media = (v) => v.reduce((s, p) => s + dist(p), 0) / v.length;
    const pontos = lista[0].pontos;
    expect(media(pontos.filter((p) => p.vivo))).toBeLessThan(media(pontos.filter((p) => !p.vivo)));
  });

  it('raio do ponto: destaque 5, vivo 3, histórico 1,6, arquivo 3,5', () => {
    const m = posicionarGrafo([{ id: 'a', pontos: [{ ...pt('d'), destaque: true }, pt('v'), pt('h', false), pt('f', false, 'arquivo')] }]);
    expect([m.get('d').raio, m.get('v').raio, m.get('h').raio, m.get('f').raio]).toEqual([5, 3, 1.6, 3.5]);
  });

  it('5.000 pontos em menos de 100 ms', () => {
    const lista = [{ id: 'a', pontos: gerar(2500, 'a') }, { id: 'b', pontos: gerar(2500, 'b') }];
    const t0 = performance.now();
    posicionarGrafo(lista);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
