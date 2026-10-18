import { useEffect, useRef } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';

const LARGURA_DESKTOP = 1280;

// Link sem protocolo viraria caminho relativo dentro do CRM.
export function normalizarLink(texto) {
  const limpo = (texto ?? '').trim();
  if (!limpo) return null;
  return /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
}

export function PreviaSite({ projeto }) {
  const { dados: pf, carregando } = useCarregar(() => api(`/projetos/${projeto.id}/portfolio`), [projeto.id]);
  const site = normalizarLink(pf?.live_url);
  const codigo = normalizarLink(pf?.code_url);
  const capa = pf?.imagens?.[0]?.url;
  const quadro = useRef(null);

  // O site é desenhado com 1280px de largura e reduzido para caber no cartão, como um print do computador.
  useEffect(() => {
    const el = quadro.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(([entrada]) => {
      el.style.setProperty('--escala', String(entrada.contentRect.width / LARGURA_DESKTOP));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [site]);

  return (
    <section className="cartao previa">
      <h2 className="cartao__titulo">Pré-visualização</h2>
      <div className="previa__quadro" ref={quadro}>
        {site && (
          <iframe
            src={site}
            title={`Pré-visualização de ${projeto.titulo}`}
            sandbox="allow-scripts allow-same-origin allow-forms"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        {!site && capa && <img src={capa} alt={`Capa de ${projeto.titulo}`} />}
        {!site && !capa && !carregando && <p className="vazio previa__aviso">Sem link do site. Adicione em Divulgação → Portfólio.</p>}
      </div>
      {(site || codigo) && (
        <p className="previa__botoes">
          {site && <a className="btn btn--pequeno" href={site} target="_blank" rel="noreferrer">Abrir site ↗</a>}
          {codigo && <a className="btn btn--pequeno" href={codigo} target="_blank" rel="noreferrer">GitHub ↗</a>}
        </p>
      )}
    </section>
  );
}
