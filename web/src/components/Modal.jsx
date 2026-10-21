import { useEffect, useId, useRef, useState } from 'react';
import { Icone } from './Icone.jsx';

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CAMPOS = 'input:not([disabled]):not([type="hidden"]):not([type="file"]), select:not([disabled]), textarea:not([disabled])';
const abertos = []; // pilha dos modais na tela, o último é o de cima

// Ao abrir, o foco entra no primeiro campo e o Tab fica preso no modal; ao fechar, volta para quem abriu.
// Se algo foi digitado, fechar por Esc, × ou clique no fundo pergunta antes de descartar.
export function Modal({ titulo, onFechar, children }) {
  const caixa = useRef(null);
  const idTitulo = useId();
  const [alterado, setAlterado] = useState(false);
  const [perguntando, setPerguntando] = useState(false);
  const continuar = useRef(null);

  useEffect(() => {
    const anterior = document.activeElement;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const primeiro = caixa.current.querySelector('.modal__corpo')?.querySelector(CAMPOS);
    (primeiro ?? caixa.current).focus();
    return () => {
      document.body.style.overflow = rolagem;
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  useEffect(() => {
    if (perguntando) continuar.current?.focus();
  }, [perguntando]);

  function pedirFechar() {
    if (alterado) setPerguntando(true);
    else onFechar();
  }

  function continuarEditando() {
    setPerguntando(false);
    caixa.current.focus();
  }

  // Esc vale mesmo com o foco fora do modal, mas só para o modal de cima quando há um dentro do outro.
  const aoEsc = useRef(null);
  aoEsc.current = () => (perguntando ? continuarEditando() : pedirFechar());
  useEffect(() => {
    const eu = Symbol('modal');
    abertos.push(eu);
    const aoTeclarJanela = (e) => {
      if (e.key === 'Escape' && abertos[abertos.length - 1] === eu) aoEsc.current();
    };
    window.addEventListener('keydown', aoTeclarJanela);
    return () => {
      window.removeEventListener('keydown', aoTeclarJanela);
      abertos.splice(abertos.indexOf(eu), 1);
    };
  }, []);

  function aoTeclar(e) {
    if (e.key !== 'Tab') return;
    const focaveis = [...caixa.current.querySelectorAll(FOCAVEIS)];
    if (!focaveis.length) return;
    const [inicio, fim] = [focaveis[0], focaveis[focaveis.length - 1]];
    if (e.shiftKey && (document.activeElement === inicio || document.activeElement === caixa.current)) {
      e.preventDefault();
      fim.focus();
    } else if (!e.shiftKey && document.activeElement === fim) {
      e.preventDefault();
      inicio.focus();
    }
  }

  // Só fecha se o clique começou e terminou no fundo: arrastar o mouse de dentro
  // do modal para fora (selecionando texto, por exemplo) não pode fechar.
  const apertouNoFundo = useRef(false);
  const noFundo = (e) => e.target === e.currentTarget;

  return (
    <div
      className="modal__fundo"
      onMouseDown={(e) => { apertouNoFundo.current = noFundo(e); }}
      onMouseUp={(e) => { apertouNoFundo.current = apertouNoFundo.current && noFundo(e); }}
      onClick={(e) => { if (apertouNoFundo.current && noFundo(e)) pedirFechar(); apertouNoFundo.current = false; }}
    >
      <div
        ref={caixa}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={aoTeclar}
        onChange={() => setAlterado(true)}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__topo">
          <h2 id={idTitulo}>{titulo}</h2>
          <button type="button" className="btn btn--icone" onClick={pedirFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </header>
        {perguntando && (
          <div className="modal__descartar" role="alertdialog" aria-label="Descartar alterações?">
            <p>Descartar o que foi preenchido?</p>
            <div className="form--linha">
              <button type="button" className="btn btn--perigo btn--pequeno" onClick={onFechar}>Descartar</button>
              <button ref={continuar} type="button" className="btn btn--pequeno" onClick={continuarEditando}>Continuar editando</button>
            </div>
          </div>
        )}
        <div className="modal__corpo">{children}</div>
      </div>
    </div>
  );
}
