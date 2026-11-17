import { describe, expect, it } from 'vitest';
import { aproximar, arrastar, camParaArea, camParaPonto, CAMERA_INICIAL, interpolar, limitar, paraMundo, paraTela } from './camera.js';

const T = { largura: 800, altura: 500 };
const cam = { x: 250, y: 320, zoom: 2 };

describe('câmera', () => {
  it('paraMundo é a inversa de paraTela', () => {
    const p = { x: 123, y: 456 };
    const q = paraMundo(cam, paraTela(cam, p, T), T);
    expect(q.x).toBeCloseTo(p.x);
    expect(q.y).toBeCloseTo(p.y);
  });

  it('aproximar mantém parado o ponto sob o foco', () => {
    const foco = { x: 600, y: 120 };
    const antes = paraMundo(cam, foco, T);
    const depois = paraMundo(aproximar(cam, 1.5, foco, T), foco, T);
    expect(depois.x).toBeCloseTo(antes.x);
    expect(depois.y).toBeCloseTo(antes.y);
  });

  it('o zoom fica preso em 0,6 e 8', () => {
    expect(aproximar(cam, 100, { x: 400, y: 250 }, T).zoom).toBe(8);
    expect(aproximar(cam, 0.001, { x: 400, y: 250 }, T).zoom).toBe(0.6);
  });

  it('limitar prende o centro', () => {
    expect(limitar({ x: -50, y: 900, zoom: 1 })).toEqual({ x: 0, y: 600, zoom: 1 });
    expect(arrastar(CAMERA_INICIAL, -1e6, 1e6, T)).toMatchObject({ x: 600, y: 0 });
  });

  it('interpolar: extremos e meio', () => {
    const a = { x: 0, y: 0, zoom: 1 };
    const b = { x: 100, y: 200, zoom: 5 };
    expect(interpolar(a, b, 0)).toEqual(a);
    expect(interpolar(a, b, 1)).toEqual(b);
    expect(interpolar(a, b, 0.5)).toEqual({ x: 50, y: 100, zoom: 3 });
    const q = interpolar(a, b, 0.25);
    expect(q.x).toBeGreaterThan(0);
    expect(q.x).toBeLessThan(50);
  });

  it('câmeras prontas de área e ponto', () => {
    expect(camParaArea(0, 7).zoom).toBe(2.4);
    expect(camParaPonto({ x: 10, y: 20 })).toEqual({ x: 10, y: 20, zoom: 4 });
  });
});
