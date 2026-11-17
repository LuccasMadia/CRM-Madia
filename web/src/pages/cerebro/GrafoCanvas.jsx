import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { fatiaDaArea, fnv, noAnel, CENTRO } from './posicoes.js';
import { emVolta, posicionarGrafo, R } from './layout.js';
import { aproximar, arrastar, camParaArea, camParaPonto, CAMERA_INICIAL, DURACAO_VOO, escala, interpolar, paraMundo } from './camera.js';
import { criarGrade, maisProximo } from './alvo.js';
import { ligadosA, montarVizinhos } from './ligacoes.js';
import { desenhar, lerCores } from './desenho.js';

const ALVO_PX = 22;
const ARRASTO_PX = 5;
const SEM_LIGADOS = { linhas: [], acesos: new Set() };
const naInicial = (c) => Math.abs(c.x - CAMERA_INICIAL.x) < 1e-6 && Math.abs(c.y - CAMERA_INICIAL.y) < 1e-6 && Math.abs(c.zoom - CAMERA_INICIAL.zoom) < 1e-6;
const distancia = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const meio = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

// Tudo o que o desenho e o clique precisam, calculado uma vez por carga de dados.
function montarCena(dados) {
  const { areas } = dados.memoria;
  const posicoes = posicionarGrafo(areas);
  const rotuloArea = Object.fromEntries(areas.map((a) => [a.id, a.rotulo]));
  const acoes = new Map();
  const pontos = areas
    .flatMap((a) => a.pontos.map((ponto) => {
      acoes.set(ponto.id, { tipo: 'ponto', dados: { ...ponto, area: rotuloArea[a.id] } });
      return { ...posicoes.get(ponto.id), id: ponto.id, rotulo: ponto.rotulo, destaque: ponto.destaque, arquivo: ponto.tipo === 'arquivo', fase: fnv(ponto.id) * 2 * Math.PI };
    }))
    .sort((p, q) => p.vivo - q.vivo || p.destaque - q.destaque);
  const skills = emVolta(dados.skills, R.skills);
  const rotinas = emVolta(dados.rotinas, R.rotinas);
  const apps = emVolta(dados.apps, R.apps);
  const rotulos = areas.map((area, i) => ({ area, i, ...noAnel(fatiaDaArea(i, areas.length).meio, R.rotulos) }));

  const posicao = new Map(pontos.map((p) => [p.id, p]));
  const alvos = pontos.map(({ id, x, y }) => ({ id, x, y }));
  const alvo = (id, x, y, acao) => { alvos.push({ id, x, y }); acoes.set(id, acao); };
  for (const { item, x, y } of apps) {
    posicao.set(`app:${item.id}`, { x, y, rotulo: item.nome, raio: 12 });
    alvo(`app:${item.id}`, x, y, { tipo: 'app', dados: item });
  }
  for (const { item, x, y } of skills) alvo(`skill:${item.id}`, x, y, { tipo: 'skill', dados: item });
  for (const { item, x, y } of rotinas) alvo(`rotina:${item.id}`, x, y, { tipo: 'rotina', dados: item });
  if (dados.centro) alvo('centro', CENTRO, CENTRO, { tipo: 'centro', dados: dados.centro });
  for (const { area, x, y } of rotulos) alvo(`area:${area.id}`, x, y, { area: area.id });

  return {
    areas, pontos, skills, rotinas, apps, rotulos, posicao, acoes, centro: dados.centro,
    grade: criarGrade(alvos),
    vizinhos: montarVizinhos(areas.flatMap((a) => a.pontos)),
  };
}

// Grafo do cérebro em canvas: câmera (roda, arrasto, pinça, voo), hover que acende as ligações e clique que abre o item.
// Pelo ref: voarParaPonto(id), voarParaArea(idArea), verTudo(). aoMudarCamera(emInicio) avisa quando sai ou volta ao enquadramento inicial.
export const GrafoCanvas = forwardRef(function GrafoCanvas({ dados, selecionado = null, aoAbrir, aoFechar, aoMudarCamera }, ref) {
  const caixa = useRef(null);
  const tela = useRef(null);
  const motor = useRef(null);
  const cena = useMemo(() => montarCena(dados), [dados]);
  const atual = useRef(null);
  atual.current = { cena, selecionado, aoAbrir, aoFechar, aoMudarCamera };

  useEffect(() => {
    const canvas = tela.current;
    const el = caixa.current;
    const ctx = canvas.getContext('2d');
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let tamanho = { largura: 0, altura: 0 };
    let dpr = 1;
    let cam = CAMERA_INICIAL;
    let emInicio = true;
    let voo = null;
    let foco = null;
    let raf = 0;
    let cache = { cena: null, id: null, ligados: SEM_LIGADOS };

    const ligadosDe = (c, id) => {
      if (cache.cena !== c || cache.id !== id) cache = { cena: c, id, ligados: id ? ligadosA(id, c.vizinhos) : SEM_LIGADOS };
      return cache.ligados;
    };

    function quadro(agora) {
      raf = 0;
      if (voo) {
        const { de, para } = voo;
        const k = Math.min(1, Math.max(0, (agora - voo.inicio) / DURACAO_VOO));
        if (k === 1) voo = null;
        mudarCamera(k === 1 ? para : interpolar(de, para, k));
      }
      if (ctx && tamanho.largura > 0) {
        const { cena: c, selecionado: sel } = atual.current;
        const ativo = foco ?? sel;
        desenhar(ctx, { tamanho, dpr, cam, cena: c, cores: lerCores(el, c.areas), ativo, ligados: ligadosDe(c, ativo), t: reduzido ? 0 : agora / 1000 });
      }
      if (!reduzido) pedir();
    }
    const pedir = () => { if (!raf) raf = requestAnimationFrame(quadro); };

    function mudarCamera(nova) {
      cam = nova;
      const agora = naInicial(cam);
      if (agora !== emInicio) {
        emInicio = agora;
        atual.current.aoMudarCamera?.(agora);
      }
      pedir();
    }
    function voar(para) {
      if (reduzido) { voo = null; mudarCamera(para); return; }
      voo = { de: cam, para, inicio: performance.now() };
      pedir();
    }
    const voarParaArea = (idArea) => {
      const { areas } = atual.current.cena;
      const i = areas.findIndex((a) => a.id === idArea);
      if (i >= 0) voar(camParaArea(i, areas.length));
    };
    motor.current = {
      pedir,
      voarParaArea,
      voarParaPonto: (id) => {
        const p = atual.current.cena.posicao.get(id);
        if (p) voar(camParaPonto(p));
      },
      verTudo: () => voar(CAMERA_INICIAL),
    };

    function medir() {
      const r = el.getBoundingClientRect();
      const nav = document.querySelector('.sidebar');
      const baixo = nav && getComputedStyle(nav).position === 'fixed' ? nav.offsetHeight : 0;
      // topo relativo ao documento: a altura não muda com a rolagem da página
      tamanho = { largura: r.width, altura: Math.max(420, window.innerHeight - (r.top + window.scrollY) - 24 - baixo) };
      dpr = window.devicePixelRatio || 1;
      canvas.style.height = `${tamanho.altura}px`;
      canvas.width = Math.round(tamanho.largura * dpr);
      canvas.height = Math.round(tamanho.altura * dpr);
      // mudar o tamanho apaga o canvas: redesenha já, antes da pintura, sem piscar
      cancelAnimationFrame(raf);
      quadro(performance.now());
    }

    const naTela = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const alvoEm = (p) => maisProximo(atual.current.cena.grade, paraMundo(cam, p, tamanho), ALVO_PX / escala(cam, tamanho));

    function clicar(p) {
      const { cena: c, aoAbrir: abrir, aoFechar: fechar } = atual.current;
      const id = alvoEm(p);
      const acao = id && c.acoes.get(id);
      if (!acao) fechar?.();
      else if (acao.area) voarParaArea(acao.area);
      else abrir?.(acao);
    }

    // ponteiros apertados agora (id → posição); um só arrasta, dois fazem a pinça
    const ponteiros = new Map();
    let inicio = null;
    let arrastou = false;

    function aoApertar(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = naTela(e);
      ponteiros.set(e.pointerId, p);
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* ponteiro já solto */ }
      voo = null;
      if (ponteiros.size === 1) { inicio = p; arrastou = false; } else arrastou = true;
    }
    // mouse passando por cima: acende o ponto ou app sob ele
    function passarPor(p) {
      const id = alvoEm(p);
      const novo = id && atual.current.cena.posicao.has(id) ? id : null;
      canvas.style.cursor = id ? 'pointer' : '';
      if (novo !== foco) { foco = novo; pedir(); }
    }
    function aoMover(e) {
      const p = naTela(e);
      const antes = ponteiros.get(e.pointerId);
      if (!antes) { passarPor(p); return; }
      ponteiros.set(e.pointerId, p);
      if (ponteiros.size === 1) {
        if (!arrastou && distancia(p, inicio) > ARRASTO_PX) arrastou = true;
        if (arrastou) mudarCamera(arrastar(cam, p.x - antes.x, p.y - antes.y, tamanho));
        return;
      }
      const outro = [...ponteiros].find(([id]) => id !== e.pointerId)[1];
      const d0 = distancia(antes, outro);
      const m0 = meio(antes, outro);
      const m1 = meio(p, outro);
      const movida = arrastar(cam, m1.x - m0.x, m1.y - m0.y, tamanho);
      mudarCamera(d0 > 0 ? aproximar(movida, distancia(p, outro) / d0, m1, tamanho) : movida);
    }
    function aoSoltar(e) {
      if (!ponteiros.delete(e.pointerId)) return;
      if (ponteiros.size > 0) return;
      if (!arrastou) clicar(naTela(e));
      // depois de arrastar ou voar, o que está sob o mouse mudou
      if (e.pointerType === 'mouse') passarPor(naTela(e));
    }
    const aoCancelar = (e) => { ponteiros.delete(e.pointerId); arrastou = true; };
    const aoSair = () => { if (foco) { foco = null; pedir(); } };
    function aoRolar(e) {
      e.preventDefault();
      voo = null;
      mudarCamera(aproximar(cam, 1.0015 ** -e.deltaY, naTela(e), tamanho));
    }

    canvas.addEventListener('pointerdown', aoApertar);
    canvas.addEventListener('pointermove', aoMover);
    canvas.addEventListener('pointerup', aoSoltar);
    canvas.addEventListener('pointercancel', aoCancelar);
    canvas.addEventListener('pointerleave', aoSair);
    canvas.addEventListener('wheel', aoRolar, { passive: false });
    window.addEventListener('resize', medir);
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    observador?.observe(el);
    medir();

    return () => {
      cancelAnimationFrame(raf);
      raf = -1; // impede novos quadros depois de desmontar
      observador?.disconnect();
      window.removeEventListener('resize', medir);
      canvas.removeEventListener('pointerdown', aoApertar);
      canvas.removeEventListener('pointermove', aoMover);
      canvas.removeEventListener('pointerup', aoSoltar);
      canvas.removeEventListener('pointercancel', aoCancelar);
      canvas.removeEventListener('pointerleave', aoSair);
      canvas.removeEventListener('wheel', aoRolar);
      motor.current = null;
    };
  }, []);

  // dados novos ou outro ponto aberto: redesenha (com reduced-motion o laço fica parado até isso)
  useEffect(() => { motor.current?.pedir(); }, [cena, selecionado]);

  useImperativeHandle(ref, () => ({
    voarParaPonto: (id) => motor.current?.voarParaPonto(id),
    voarParaArea: (idArea) => motor.current?.voarParaArea(idArea),
    verTudo: () => motor.current?.verTudo(),
  }), []);

  const resumo = cena.areas.map((a) => `${a.rotulo} ${a.pontos.length}`).join(', ');
  return (
    <div ref={caixa} className="cerebro__grafo">
      <canvas ref={tela} className="cerebro__canvas" role="img" aria-label={`Mapa do cérebro: ${resumo}`} />
    </div>
  );
});
