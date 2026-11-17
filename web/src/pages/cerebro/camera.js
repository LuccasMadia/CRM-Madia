import { fatiaDaArea, noAnel } from './posicoes.js';
import { R } from './layout.js';

export const CAMERA_INICIAL = { x: 300, y: 300, zoom: 1 };
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 8;
export const DURACAO_VOO = 600;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const escala = (cam, t) => (Math.min(t.largura, t.altura) / 600) * cam.zoom;

export const paraTela = (cam, { x, y }, t) => {
  const s = escala(cam, t);
  return { x: t.largura / 2 + (x - cam.x) * s, y: t.altura / 2 + (y - cam.y) * s };
};

export const paraMundo = (cam, { x, y }, t) => {
  const s = escala(cam, t);
  return { x: cam.x + (x - t.largura / 2) / s, y: cam.y + (y - t.altura / 2) / s };
};

export const limitar = (cam) => ({ x: clamp(cam.x, 0, 600), y: clamp(cam.y, 0, 600), zoom: clamp(cam.zoom, ZOOM_MIN, ZOOM_MAX) });

export function aproximar(cam, fator, focoTela, t) {
  const antes = paraMundo(cam, focoTela, t);
  const zoom = clamp(cam.zoom * fator, ZOOM_MIN, ZOOM_MAX);
  const s = (Math.min(t.largura, t.altura) / 600) * zoom;
  return limitar({ zoom, x: antes.x - (focoTela.x - t.largura / 2) / s, y: antes.y - (focoTela.y - t.altura / 2) / s });
}

export const arrastar = (cam, dx, dy, t) => {
  const s = escala(cam, t);
  return limitar({ ...cam, x: cam.x - dx / s, y: cam.y - dy / s });
};

export const camParaArea = (i, n) => ({ ...noAnel(fatiaDaArea(i, n).meio, (R.memoriaDe + R.memoriaAte) / 2), zoom: 2.4 });

export const camParaPonto = ({ x, y }) => ({ x, y, zoom: 4 });

export function interpolar(de, para, t) {
  const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return { x: de.x + (para.x - de.x) * e, y: de.y + (para.y - de.y) * e, zoom: de.zoom + (para.zoom - de.zoom) * e };
}
