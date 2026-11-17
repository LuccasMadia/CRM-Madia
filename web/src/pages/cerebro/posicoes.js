export const CENTRO = 300;
const VOLTA = 2 * Math.PI;
// folga em cada borda da fatia, para as nuvens de áreas vizinhas não se encostarem
const FOLGA = 0.05;

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

export function posicionarPontos(areas, raioInterno, raioExterno) {
  return areas.flatMap((area, i) => {
    const { inicio, fim } = fatiaDaArea(i, areas.length);
    const util = (fim - inicio) * (1 - 2 * FOLGA);
    return area.pontos.map(({ id }) => {
      const angulo = inicio + (fim - inicio) * FOLGA + fnv(id) * util;
      // raiz quadrada: espalha por igual na área do anel, sem amontoar perto do centro
      const raio = Math.sqrt(raioInterno ** 2 + fnv(`${id}#raio`) * (raioExterno ** 2 - raioInterno ** 2));
      return { id, area: area.id, ...noAnel(angulo, raio) };
    });
  });
}
