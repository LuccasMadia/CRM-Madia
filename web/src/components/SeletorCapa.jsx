import { useRef, useState } from 'react';

// Escolhe o quadro do vídeo que vira capa do Reels: arraste a barra até o quadro e salve.
export function SeletorCapa({ conteudo, desabilitado, onSalvar }) {
  const video = useRef(null);
  const [duracao, setDuracao] = useState(0);
  const [segundos, setSegundos] = useState((conteudo.capa_ms ?? 0) / 1000);
  const salvo = (conteudo.capa_ms ?? 0) / 1000;

  function mover(valor) {
    setSegundos(valor);
    if (video.current) video.current.currentTime = valor;
  }

  return (
    <div className="seletor-capa">
      <video
        ref={video}
        src={`${conteudo.capa_url}#t=${salvo}`}
        muted
        playsInline
        preload="metadata"
        aria-label="Quadro da capa"
        onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
      />
      <label className="seletor-capa__barra">
        Quadro da capa ({segundos.toFixed(1)}s)
        <input type="range" min="0" max={duracao || 0} step="0.1" value={segundos} disabled={!duracao} onChange={(e) => mover(Number(e.target.value))} />
      </label>
      <button type="button" className="btn" disabled={desabilitado || segundos === salvo} onClick={() => onSalvar(Math.round(segundos * 1000))}>
        Usar este quadro como capa
      </button>
    </div>
  );
}
