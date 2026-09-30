import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { lerQrPng, statusImagem } from './qrLeitura.js';

describe('lerQrPng', () => {
  it('lê o texto de um QR code PNG válido', async () => {
    const buffer = await QRCode.toBuffer('https://canva.com/design/abc', { type: 'png' });
    expect(lerQrPng(buffer)).toBe('https://canva.com/design/abc');
  });

  it('retorna null para um buffer inválido', () => {
    expect(lerQrPng(Buffer.from('lixo'))).toBeNull();
  });
});

describe('statusImagem', () => {
  it('sem_imagem quando não há arquivo', () => {
    expect(statusImagem({ imagem_arquivo: null, imagem_destino_lido: null, destino_atual: 'https://x.com' })).toBe('sem_imagem');
  });

  it('nao_verificado para PDF', () => {
    expect(statusImagem({ imagem_arquivo: 'a.pdf', imagem_destino_lido: null, destino_atual: 'https://x.com' })).toBe('nao_verificado');
  });

  it('ilegivel quando o PNG não foi decodificado', () => {
    expect(statusImagem({ imagem_arquivo: 'a.png', imagem_destino_lido: null, destino_atual: 'https://x.com' })).toBe('ilegivel');
  });

  it('ok quando o texto lido bate com o destino atual', () => {
    expect(statusImagem({ imagem_arquivo: 'a.png', imagem_destino_lido: 'https://x.com', destino_atual: 'https://x.com' })).toBe('ok');
  });

  it('desatualizado quando o texto lido diverge do destino atual', () => {
    expect(
      statusImagem({ imagem_arquivo: 'a.png', imagem_destino_lido: 'https://x.com/velho', destino_atual: 'https://x.com/novo' }),
    ).toBe('desatualizado');
  });
});
