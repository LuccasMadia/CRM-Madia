import { CENTRO, fatiaDaArea, noAnel } from './posicoes.js';
import { R } from './layout.js';
import { escala, paraMundo } from './camera.js';

const FOLGA_TELA = 20; // px além da borda que ainda são desenhados
const MEIO_MEMORIA = (R.memoriaDe + R.memoriaAte) / 2;

// Quais acesos ganham nome: poucos, todos; muitos (hub), só o ativo e projetos/clientes.
export function idsComNome(acesos, ativo) {
  const todos = acesos.size <= 12;
  return [...acesos].filter((id) => id === ativo || todos || id.startsWith('projeto:') || id.startsWith('cliente:'));
}

const curto = (texto) => (texto.length > 24 ? `${texto.slice(0, 23)}…` : texto);

// Cores do tema, lidas do CSS a cada quadro: trocar o tema troca o desenho sem recarregar.
export function lerCores(el, areas) {
  const css = getComputedStyle(el);
  const v = (nome) => css.getPropertyValue(nome).trim();
  return {
    fonte: css.fontFamily || 'sans-serif',
    fundo: v('--fundo'),
    primaria: v('--primaria'),
    primariaSuave: v('--primaria-suave'),
    texto: v('--texto'),
    textoSuave: v('--texto-suave'),
    perigo: v('--perigo'),
    superficie: v('--superficie'),
    superficie2: v('--superficie-2'),
    laranja: v('--tag-laranja'),
    skills: v('--anel-skills'),
    rotinas: v('--anel-rotinas'),
    apps: v('--anel-apps'),
    area: Object.fromEntries(areas.map((a) => [a.id, v(`--area-${a.id}`)])),
  };
}

// Sprite de brilho por cor, desenhado uma vez: drawImage é bem mais barato que shadowBlur ponto a ponto.
const sprites = new Map();
function brilho(cor) {
  let s = sprites.get(cor);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const c = s.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    // pinta só onde o gradiente tem alfa: a cor sai limpa, sem precisar decompor a cor do tema
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = cor;
    c.fillRect(0, 0, 64, 64);
  }
  sprites.set(cor, s);
  return s;
}

// Sprite centrado em (x, y) com diâmetro d (unidades do mundo). O miolo sólido tem raio d/8.
function halo(ctx, cor, x, y, d, alfa) {
  ctx.globalAlpha = alfa;
  ctx.drawImage(brilho(cor), x - d / 2, y - d / 2, d, d);
}

function disco(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
}

function losango(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.3);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r * 1.3);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

function hexagono(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    ctx[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

function anel(ctx, raio, cor, largura, traco, deslocamento) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = largura;
  ctx.setLineDash(traco);
  ctx.lineDashOffset = deslocamento;
  ctx.beginPath();
  ctx.arc(CENTRO, CENTRO, raio, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Texto com contorno da cor do fundo, legível por cima dos pontos.
function rotulo(ctx, texto, x, y, cor, fundo, contorno) {
  ctx.lineWidth = contorno;
  ctx.strokeStyle = fundo;
  ctx.strokeText(texto, x, y);
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, y);
}

// Posição do ponto no instante t (s): flutua ±1,5 unidade, cada um na sua fase.
const onde = (p, t) => (p.fase == null ? p : { x: p.x + 1.5 * Math.sin(t * 0.9 + p.fase), y: p.y + 1.5 * Math.cos(t * 0.7 + p.fase * 1.3) });

// Um quadro inteiro. ativo: id em foco (hover ou selecionado); ligados: { linhas, acesos } de ligadosA.
export function desenhar(ctx, { tamanho, dpr, cam, cena, cores, ativo, ligados, t }) {
  const { largura: w, altura: h } = tamanho;
  const s = escala(cam, tamanho);
  const px = 1 / s; // 1 px de tela em unidades do mundo
  const comFoco = ativo != null;
  const apagado = comFoco ? 0.45 : 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = cores.fundo;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - cam.x * s), dpr * (h / 2 - cam.y * s));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const a = paraMundo(cam, { x: -FOLGA_TELA, y: -FOLGA_TELA }, tamanho);
  const b = paraMundo(cam, { x: w + FOLGA_TELA, y: h + FOLGA_TELA }, tamanho);
  const visivel = (x, y, m = 0) => x >= a.x - m && x <= b.x + m && y >= a.y - m && y <= b.y + m;

  halo(ctx, cores.primaria, CENTRO, CENTRO, R.apps * 2.4, 0.06);

  // bolhas das áreas: ao aproximar, halo e nome grandes atrás dos pontos
  if (cam.zoom > 1.5) {
    ctx.font = `700 17px ${cores.fonte}`;
    cena.rotulos.forEach(({ area, i }) => {
      const c = noAnel(fatiaDaArea(i, cena.rotulos.length).meio, MEIO_MEMORIA);
      if (!visivel(c.x, c.y, 120)) return;
      halo(ctx, cores.area[area.id], c.x, c.y, 240, 0.16);
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = cores.area[area.id];
      ctx.fillText(area.rotulo.toUpperCase(), c.x, c.y);
    });
  }

  // anéis
  ctx.globalAlpha = 0.45;
  anel(ctx, R.apps, cores.apps, px, [], 0);
  ctx.globalAlpha = 0.6 * apagado;
  anel(ctx, R.rotinas, cores.rotinas, px, [10, 6], t * 1);
  ctx.globalAlpha = apagado;
  anel(ctx, R.skills, cores.skills, 2, [2, 4], -t * 1.5);
  const fonteAnel = Math.max(9, 10 * px); // nunca menor que 10 px na tela
  ctx.font = `600 ${fonteAnel}px ${cores.fonte}`;
  ctx.globalAlpha = 1;
  rotulo(ctx, 'APPS', CENTRO, CENTRO - R.apps + 4, cores.apps, cores.fundo, 6);
  rotulo(ctx, 'ROTINAS', CENTRO, CENTRO - R.rotinas + 4, cores.rotinas, cores.fundo, 6);

  // skills e rotinas
  ctx.globalAlpha = apagado;
  ctx.lineWidth = 1.5;
  for (const { x, y } of cena.skills) {
    ctx.fillStyle = cores.skills;
    ctx.strokeStyle = cores.fundo;
    disco(ctx, x, y, 5);
    ctx.stroke();
  }
  for (const { item, x, y } of cena.rotinas) {
    ctx.fillStyle = item.estado === 'ativa' ? cores.rotinas : cores.fundo;
    ctx.strokeStyle = cores.rotinas;
    ctx.lineWidth = 1.5;
    disco(ctx, x, y, 5);
    ctx.stroke();
  }

  // centro (CLAUDE.md)
  if (cena.centro) {
    ctx.fillStyle = cores.superficie2;
    ctx.strokeStyle = cores.laranja;
    ctx.lineWidth = 1.5;
    disco(ctx, CENTRO, CENTRO, R.centro);
    ctx.stroke();
    ctx.font = `700 7px ${cores.fonte}`;
    ctx.fillStyle = cores.texto;
    ctx.fillText('CLAUDE.md', CENTRO, CENTRO);
  }

  // nomes das áreas
  ctx.font = `600 ${fonteAnel}px ${cores.fonte}`;
  for (const { area, x, y } of cena.rotulos) {
    ctx.globalAlpha = apagado;
    rotulo(ctx, area.rotulo.toUpperCase(), x, y, cores.area[area.id], cores.fundo, 4);
  }

  // linhas do que está ligado ao ponto em foco (ligação para fora do mapa fica de fora)
  if (ligados.linhas.length) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = cores.texto;
    ctx.lineWidth = 1.2 * px;
    ctx.setLineDash([4 * px, 3 * px]);
    ctx.lineDashOffset = -t * 12 * px;
    ctx.beginPath();
    for (const [de, para] of ligados.linhas) {
      const p = cena.posicao.get(de);
      const q = cena.posicao.get(para);
      if (!p || !q) continue;
      const pp = onde(p, t);
      const qq = onde(q, t);
      ctx.moveTo(pp.x, pp.y);
      ctx.lineTo(qq.x, qq.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // apps (hexágonos)
  ctx.font = `700 9px ${cores.fonte}`;
  for (const { item, x, y } of cena.apps) {
    const id = `app:${item.id}`;
    const realce = id === ativo || ligados.acesos.has(id);
    ctx.globalAlpha = comFoco && !realce ? 0.18 : 1;
    hexagono(ctx, x, y, realce ? 14.4 : 12);
    ctx.fillStyle = item.conectado ? cores.primariaSuave : cores.superficie;
    ctx.fill();
    ctx.strokeStyle = item.conectado || realce ? cores.primaria : cores.apps;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = item.conectado ? cores.primaria : cores.textoSuave;
    ctx.fillText(item.nome.slice(0, 1).toUpperCase(), x, y);
  }

  // pontos da memória, já ordenados: histórico, vivo, pede ação (o urgente fica por cima)
  const pulso = 1 + 0.2 * Math.sin((t * 2 * Math.PI) / 2.4);
  for (const p of cena.pontos) {
    const { x, y } = onde(p, t);
    if (!visivel(x, y)) continue;
    const foco = p.id === ativo;
    const aceso = !foco && ligados.acesos.has(p.id);
    const alfa = comFoco && !foco && !aceso ? 0.18 : 1;
    const r = p.raio * (foco ? 2.6 : aceso ? 1.6 : 1) * (p.destaque ? pulso : 1);
    const cor = p.destaque ? cores.perigo : cores.area[p.area];
    ctx.fillStyle = cor;
    if (!p.vivo) {
      ctx.globalAlpha = 0.35 * alfa;
      if (p.arquivo) losango(ctx, x, y, r);
      // com menos de 2,5 px na tela, um quadrado de mesma área parece igual e custa bem menos que arc (medido: ~3× mais rápido com 5.000)
      else if (r * s < 2.5) ctx.fillRect(x - r * 0.886, y - r * 0.886, r * 1.772, r * 1.772);
      else disco(ctx, x, y, r);
      continue;
    }
    if (p.arquivo) {
      halo(ctx, cor, x, y, r * 8, 0.5 * alfa);
      ctx.globalAlpha = alfa;
      losango(ctx, x, y, r);
    } else {
      halo(ctx, cor, x, y, r * 8, alfa);
    }
  }

  // nomes curtos do que está aceso, por cima de tudo
  if (comFoco) {
    ctx.globalAlpha = 1;
    for (const id of idsComNome(ligados.acesos, ativo)) {
      const p = cena.posicao.get(id);
      if (!p) continue;
      const { x, y } = onde(p, t);
      const foco = id === ativo;
      ctx.font = `${foco ? 700 : 400} ${(foco ? 13 : 11) * px}px ${cores.fonte}`;
      rotulo(ctx, curto(p.rotulo), x, y - p.raio * 2.6 - 10 * px, foco ? cores.texto : cores.textoSuave, cores.fundo, 4 * px);
    }
  }
  ctx.globalAlpha = 1;
}
