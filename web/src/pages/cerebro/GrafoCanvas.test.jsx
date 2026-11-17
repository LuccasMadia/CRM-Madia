import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GrafoCanvas } from './GrafoCanvas.jsx';
import { posicionarGrafo } from './layout.js';
import { CAMERA_INICIAL, paraTela } from './camera.js';

const ponto = (id, rotulo, extra = {}) => ({ id, tipo: id.split(':')[0], rotulo, destaque: false, vivo: true, link: null, ligacoes: [], resumo: '', texto: null, ...extra });
const ROTULOS = { clientes: 'Clientes', comercial: 'Comercial', projetos: 'Projetos', processos: 'Processos', administrativo: 'Administrativo', conteudo: 'Conteúdo', arquivos: 'Arquivos' };
const PONTOS = {
  clientes: [ponto('cliente:1', 'Padaria Sol'), ponto('cliente:2', 'Oficina Lua', { vivo: false })],
  projetos: [ponto('projeto:7', 'Site da Padaria', { destaque: true, ligacoes: ['cliente:1', 'projeto:999', 'app:gmail'] })],
  arquivos: [ponto('arquivo:relatorio.md', 'relatorio.md')],
};
const dados = {
  centro: { texto: '# CLAUDE.md' },
  skills: [{ id: 'relatorio', nome: 'Relatório', descricao: '', texto: null }],
  rotinas: [{ id: 'r1', nome: 'Resumo semanal', o_que_faz: '', frequencia: 'semanal', estado: 'ativa', ultima_execucao: null }],
  apps: [{ id: 'gmail', nome: 'Gmail', para_que: '', conexao: '', conectado: true }],
  memoria: { areas: Object.entries(ROTULOS).map(([id, rotulo]) => ({ id, rotulo, pontos: PONTOS[id] ?? [] })) },
  pede_atencao: [],
  avisos: [],
};

// contexto 2D falso: qualquer método existe, não faz nada e devolve o próprio contexto (gradiente incluso)
function contextoFalso() {
  const chamadas = [];
  const alvo = { chamadas };
  const ctx = new Proxy(alvo, {
    get: (t, k) => (k in t ? t[k] : (...args) => { chamadas.push([k, args]); return ctx; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return ctx;
}

const T = () => ({ largura: 600, altura: Math.max(420, window.innerHeight - 24) });
const naTela = (id) => paraTela(CAMERA_INICIAL, posicionarGrafo(dados.memoria.areas).get(id), T());
const tela = () => screen.getByRole('img');

function montar(props = {}) {
  const fns = { aoAbrir: vi.fn(), aoFechar: vi.fn(), aoMudarCamera: vi.fn() };
  const ref = createRef();
  render(<GrafoCanvas ref={ref} dados={dados} {...fns} {...props} />);
  return { ...fns, ref };
}

describe('GrafoCanvas', () => {
  let ctx;
  beforeEach(() => {
    ctx = contextoFalso();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, toJSON() {} });
  });

  it('sem contexto 2D não quebra e tem aria-label com as contagens', () => {
    HTMLCanvasElement.prototype.getContext.mockImplementation(() => null);
    montar();
    expect(tela()).toHaveAttribute('aria-label', 'Mapa do cérebro: Clientes 2, Comercial 0, Projetos 1, Processos 0, Administrativo 0, Conteúdo 0, Arquivos 1');
  });

  it('clique em cima de um ponto chama aoAbrir com o ponto', () => {
    const { aoAbrir, aoFechar } = montar();
    const { x, y } = naTela('cliente:1');
    fireEvent.pointerDown(tela(), { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(tela(), { clientX: x, clientY: y, pointerId: 1 });
    expect(aoAbrir).toHaveBeenCalledWith({ tipo: 'ponto', dados: { ...PONTOS.clientes[0], area: 'Clientes' } });
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('botão direito do mouse sobre um ponto não abre', () => {
    const { aoAbrir } = montar();
    const { x, y } = naTela('cliente:1');
    fireEvent.pointerDown(tela(), { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 2 });
    fireEvent.pointerUp(tela(), { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 2 });
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it('arrastar mais de 5px não abre nada', () => {
    const { aoAbrir, aoFechar } = montar();
    const { x, y } = naTela('cliente:1');
    fireEvent.pointerDown(tela(), { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerMove(tela(), { clientX: x + 20, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(tela(), { clientX: x + 20, clientY: y, pointerId: 1 });
    expect(aoAbrir).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('clique no vazio chama aoFechar', () => {
    const { aoAbrir, aoFechar } = montar();
    fireEvent.pointerDown(tela(), { clientX: 4, clientY: 4, pointerId: 1 });
    fireEvent.pointerUp(tela(), { clientX: 4, clientY: 4, pointerId: 1 });
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it('ref.voarParaPonto com reduced-motion move a câmera na hora', () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const { ref, aoMudarCamera } = montar();
    act(() => ref.current.voarParaPonto('cliente:1'));
    expect(aoMudarCamera).toHaveBeenLastCalledWith(false);
    act(() => ref.current.verTudo());
    expect(aoMudarCamera).toHaveBeenLastCalledWith(true);
  });

  it('ligação para ponto que não está no mapa não quebra o desenho', () => {
    montar({ selecionado: 'projeto:7' });
    // o desenho com o ponto aceso rodou: os nomes do que está ligado aparecem
    const textos = ctx.chamadas.filter(([k]) => k === 'fillText').map(([, [t]]) => t);
    expect(textos).toEqual(expect.arrayContaining(['Site da Padaria', 'Padaria Sol', 'Gmail']));
  });
});
