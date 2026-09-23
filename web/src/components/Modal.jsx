import { useEffect } from 'react';

export function Modal({ titulo, onFechar, children }) {
  useEffect(() => {
    const aoTeclar = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div className="modal__fundo" onClick={onFechar}>
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
