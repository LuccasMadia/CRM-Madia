import { useEffect, useRef } from 'react';

export function Modal({ titulo, onFechar, children }) {
  useEffect(() => {
    const aoTeclar = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  // Só fecha se o clique começou e terminou no fundo: arrastar o mouse de dentro
  // do modal para fora (selecionando texto, por exemplo) não pode fechar.
  const apertouNoFundo = useRef(false);
  const noFundo = (e) => e.target === e.currentTarget;

  return (
    <div
      className="modal__fundo"
      onMouseDown={(e) => { apertouNoFundo.current = noFundo(e); }}
      onMouseUp={(e) => { apertouNoFundo.current = apertouNoFundo.current && noFundo(e); }}
      onClick={(e) => { if (apertouNoFundo.current && noFundo(e)) onFechar(); apertouNoFundo.current = false; }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <header className="modal__topo">
          <h2>{titulo}</h2>
          <button type="button" className="btn btn--fantasma" onClick={onFechar} aria-label="Fechar">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}
