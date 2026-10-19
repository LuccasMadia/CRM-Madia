import { describe, it, expect } from 'vitest';
import { validarParaPublicar, aceitaVideo, MENSAGEM_CARROSSEL_VIDEO } from './regrasPublicacao.js';

const imagem = (largura = 1080, altura = 1080) => ({ tipo: 'imagem', largura, altura });
const video = () => ({ tipo: 'video', largura: 1080, altura: 1920 });
const legenda = (tamanho) => 'a'.repeat(tamanho);
const comHashtags = (quantidade) => Array.from({ length: quantidade }, (_, i) => `#tag${i}`).join(' ');

describe('validarParaPublicar', () => {
  describe('reels', () => {
    it('exige exatamente 1 vídeo', () => {
      expect(validarParaPublicar({ tipo: 'reels', legenda: 'oi' }, [])).toEqual(['Reels precisa de exatamente 1 vídeo.']);
      expect(validarParaPublicar({ tipo: 'reels', legenda: 'oi' }, [imagem()])).toEqual(['Reels precisa de exatamente 1 vídeo.']);
    });
    it('recusa vídeo acompanhado de imagem', () => {
      expect(validarParaPublicar({ tipo: 'reels', legenda: 'oi' }, [video(), imagem()])).toEqual(['Reels precisa de exatamente 1 vídeo.']);
    });
    it('aceita 1 vídeo', () => {
      expect(validarParaPublicar({ tipo: 'reels', legenda: 'oi' }, [video()])).toEqual([]);
    });
  });

  describe('post', () => {
    it('exige exatamente 1 imagem', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [])).toEqual(['Post precisa de exatamente 1 imagem.']);
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [imagem(), imagem()])).toEqual(['Post precisa de exatamente 1 imagem.']);
    });
    it('recusa imagem acompanhada de vídeo, ou só vídeo', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [imagem(), video()])).toEqual(['Post precisa de exatamente 1 imagem.']);
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [video()])).toEqual(['Post precisa de exatamente 1 imagem.']);
    });
    it('aceita 1 imagem', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [imagem()])).toEqual([]);
    });
  });

  describe('carrossel', () => {
    it('exige de 2 a 10 imagens', () => {
      const onze = Array.from({ length: 11 }, () => imagem());
      expect(validarParaPublicar({ tipo: 'carrossel', legenda: 'oi' }, [imagem()])).toEqual(['Carrossel precisa de 2 a 10 imagens.']);
      expect(validarParaPublicar({ tipo: 'carrossel', legenda: 'oi' }, onze)).toEqual(['Carrossel precisa de 2 a 10 imagens.']);
    });
    it('aceita de 2 a 10 imagens', () => {
      const dez = Array.from({ length: 10 }, () => imagem());
      expect(validarParaPublicar({ tipo: 'carrossel', legenda: 'oi' }, [imagem(), imagem()])).toEqual([]);
      expect(validarParaPublicar({ tipo: 'carrossel', legenda: 'oi' }, dez)).toEqual([]);
    });
    it('recusa vídeo com a mensagem exata', () => {
      const erros = validarParaPublicar({ tipo: 'carrossel', legenda: 'oi' }, [imagem(), video()]);
      expect(erros).toContain(MENSAGEM_CARROSSEL_VIDEO);
      expect(MENSAGEM_CARROSSEL_VIDEO).toBe('Carrossel aceita só imagens — para vídeo, use um Reels.');
    });
  });

  describe('proporção das imagens', () => {
    it('recusa imagem 1000×2000 com a mensagem da posição', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [imagem(1000, 2000)])).toEqual([
        'A imagem 1 está fora das proporções aceitas pelo Instagram (de 4:5 a 1,91:1).',
      ]);
    });
    it('numera a imagem pela posição entre as imagens', () => {
      expect(validarParaPublicar({ tipo: 'carrossel', legenda: 'oi' }, [imagem(), imagem(), imagem(1000, 2000)])).toEqual([
        'A imagem 3 está fora das proporções aceitas pelo Instagram (de 4:5 a 1,91:1).',
      ]);
    });
    it('aceita os limites 4:5 e 1,91:1 inclusive', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [imagem(800, 1000)])).toEqual([]);
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [imagem(1910, 1000)])).toEqual([]);
    });
    it('pula a checagem quando largura ou altura são nulas', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: 'oi' }, [{ tipo: 'imagem', largura: null, altura: null }])).toEqual([]);
    });
  });

  describe('legenda', () => {
    it('aceita até 2.200 caracteres', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: legenda(2200) }, [imagem()])).toEqual([]);
    });
    it('recusa 2.201 caracteres', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: legenda(2201) }, [imagem()])).toEqual([
        'A legenda passa de 2.200 caracteres.',
      ]);
    });
    it('aceita até 30 hashtags', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: comHashtags(30) }, [imagem()])).toEqual([]);
    });
    it('recusa 31 hashtags', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: comHashtags(31) }, [imagem()])).toEqual([
        'A legenda tem mais de 30 hashtags.',
      ]);
    });
    it('conta hashtags com acento, número e underline', () => {
      const legendaComHashtags = Array.from({ length: 31 }, (_, i) => `#ção${i}_x`).join(' ');
      expect(validarParaPublicar({ tipo: 'post', legenda: legendaComHashtags }, [imagem()])).toEqual([
        'A legenda tem mais de 30 hashtags.',
      ]);
    });
    it('trata legenda nula ou ausente como vazia', () => {
      expect(validarParaPublicar({ tipo: 'post', legenda: null }, [imagem()])).toEqual([]);
      expect(validarParaPublicar({ tipo: 'post' }, [imagem()])).toEqual([]);
    });
  });

  it('casos válidos dos três tipos retornam lista vazia', () => {
    expect(validarParaPublicar({ tipo: 'post', legenda: 'Oi #um' }, [imagem()])).toEqual([]);
    expect(validarParaPublicar({ tipo: 'carrossel', legenda: 'Oi' }, [imagem(), imagem(1080, 1350)])).toEqual([]);
    expect(validarParaPublicar({ tipo: 'reels', legenda: null }, [video()])).toEqual([]);
  });
});

describe('aceitaVideo', () => {
  it('aceita vídeo só em reels', () => {
    expect(aceitaVideo('reels')).toBe(true);
    expect(aceitaVideo('post')).toBe(false);
    expect(aceitaVideo('carrossel')).toBe(false);
  });
});
