// Código do arquivo dentro de um link do Figma (design, file, board ou proto); null se não for um.
export function codigoDoLinkFigma(texto) {
  const achado = /^(?:https?:\/\/)?(?:www\.)?figma\.com\/(?:design|file|board|proto)\/([\w-]+)/i.exec(String(texto ?? '').trim());
  return achado ? achado[1] : null;
}
