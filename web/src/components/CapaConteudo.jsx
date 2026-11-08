// Capa de um conteúdo: imagem, ou o quadro escolhido (padrão 0,1s) quando o primeiro arquivo é vídeo (Reels).
export function CapaConteudo({ item, alt }) {
  if (item.midias?.[0]?.tipo === 'video') {
    return <video src={`${item.capa_url}#t=${(item.capa_ms ?? 100) / 1000}`} muted playsInline preload="metadata" aria-label={alt} />;
  }
  return <img src={item.capa_url} alt={alt} />;
}
