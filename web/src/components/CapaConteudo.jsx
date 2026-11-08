// Capa de um conteúdo: imagem, ou o primeiro quadro quando o primeiro arquivo é vídeo (Reels).
export function CapaConteudo({ item, alt }) {
  if (item.midias?.[0]?.tipo === 'video') {
    return <video src={`${item.capa_url}#t=0.1`} muted playsInline preload="metadata" aria-label={alt} />;
  }
  return <img src={item.capa_url} alt={alt} />;
}
