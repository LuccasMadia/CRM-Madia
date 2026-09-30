import { PNG } from 'pngjs';
import jsQR from 'jsqr';

export function lerQrPng(buffer) {
  try {
    const png = PNG.sync.read(buffer);
    const resultado = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    return resultado?.data || null;
  } catch {
    return null;
  }
}

export function statusImagem({ imagem_arquivo, imagem_destino_lido, destino_atual }) {
  if (!imagem_arquivo) return 'sem_imagem';
  if (imagem_arquivo.endsWith('.pdf')) return 'nao_verificado';
  if (!imagem_destino_lido) return 'ilegivel';
  return imagem_destino_lido.trim() === destino_atual.trim() ? 'ok' : 'desatualizado';
}
