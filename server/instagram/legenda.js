const TAMANHO_COMPARADO = 60;

// Forma comparável da legenda, usada para ligar um post ao planejado:
// a legenda do Instagram costuma ganhar emojis/hashtags ou um ajuste no fim.
export function normalizarLegenda(texto) {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/#\S+/g, ' ')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TAMANHO_COMPARADO)
    .trim();
}

export function tipoDaMidia({ media_type, media_product_type }) {
  if (media_type === 'CAROUSEL_ALBUM') return 'carrossel';
  if (media_type === 'VIDEO' || media_product_type === 'REELS') return 'reels';
  return 'post';
}
