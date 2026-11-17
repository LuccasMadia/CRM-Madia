export const CENTRO = 300;
const VOLTA = 2 * Math.PI;

// Fatia i de n, começando no topo e seguindo no sentido horário (ângulos de tela, em radianos).
export function fatiaDaArea(i, n) {
  const largura = VOLTA / n;
  const inicio = -Math.PI / 2 + i * largura;
  return { inicio, fim: inicio + largura, meio: inicio + largura / 2 };
}

// FNV-1a 32 bits: o mesmo id sempre cai no mesmo lugar, sem depender da ordem da lista.
export function fnv(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // mistura final (fmix32 do murmur3): ids quase iguais ("x:1", "x:2") caem longe um do outro, sem formar listras
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

export const noAnel = (angulo, raio) => ({ x: CENTRO + raio * Math.cos(angulo), y: CENTRO + raio * Math.sin(angulo) });
