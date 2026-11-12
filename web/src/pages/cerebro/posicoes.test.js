import { describe, it, expect } from 'vitest';
import { CENTRO, fatiaDaArea, posicionarPontos } from './posicoes.js';

const pontos = (prefixo, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefixo}:${i + 1}` }));
const AREAS = [
  { id: 'clientes', pontos: pontos('cliente', 20) },
  { id: 'comercial', pontos: pontos('projeto', 15) },
  { id: 'projetos', pontos: pontos('projeto', 30).slice(15) },
  { id: 'processos', pontos: pontos('tarefa', 40) },
  { id: 'administrativo', pontos: pontos('parcela', 25) },
  { id: 'conteudo', pontos: pontos('conteudo', 10) },
];

describe('posicionarPontos', () => {
  it('mesma entrada dá a mesma saída', () => {
    expect(posicionarPontos(AREAS, 95, 200)).toEqual(posicionarPontos(AREAS, 95, 200));
  });

  it('ponto novo numa área não muda a posição dos outros da mesma área', () => {
    const antes = posicionarPontos(AREAS, 95, 200);
    const comNovo = AREAS.map((a) => (a.id === 'processos' ? { ...a, pontos: [{ id: 'tarefa:999' }, ...a.pontos] } : a));
    const depois = posicionarPontos(comNovo, 95, 200);
    for (const p of antes) expect(depois.find((d) => d.id === p.id)).toEqual(p);
    expect(depois).toHaveLength(antes.length + 1);
  });

  it('cada ponto fica na fatia da sua área e entre os raios', () => {
    const resultado = posicionarPontos(AREAS, 95, 200);
    expect(resultado).toHaveLength(125);
    for (const p of resultado) {
      const i = AREAS.findIndex((a) => a.id === p.area);
      const { inicio, fim } = fatiaDaArea(i, AREAS.length);
      const dx = p.x - CENTRO;
      const dy = p.y - CENTRO;
      const raio = Math.hypot(dx, dy);
      expect(raio).toBeGreaterThanOrEqual(95 - 1e-9);
      expect(raio).toBeLessThanOrEqual(200 + 1e-9);
      // ângulo normalizado para começar no início da fatia
      let angulo = Math.atan2(dy, dx);
      while (angulo < inicio) angulo += 2 * Math.PI;
      while (angulo >= inicio + 2 * Math.PI) angulo -= 2 * Math.PI;
      expect(angulo).toBeLessThanOrEqual(fim + 1e-9);
    }
  });

  it('500 pontos numa área em menos de 50 ms', () => {
    const muitos = [{ id: 'processos', pontos: pontos('tarefa', 500) }];
    const t0 = performance.now();
    expect(posicionarPontos(muitos, 95, 200)).toHaveLength(500);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
