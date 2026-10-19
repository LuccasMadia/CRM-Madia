export const MENSAGEM_CARROSSEL_VIDEO = 'Carrossel aceita só imagens — para vídeo, use um Reels.';

const PROPORCAO_MINIMA = 4 / 5;
const PROPORCAO_MAXIMA = 1.91;
const LEGENDA_MAXIMA = 2200;
const HASHTAGS_MAXIMAS = 30;
const CARROSSEL_MINIMO = 2;
const CARROSSEL_MAXIMO = 10;
const REGEX_HASHTAG = /#[\p{L}\p{N}_]+/gu;

export function aceitaVideo(tipoConteudo) {
  return tipoConteudo === 'reels';
}

// Lista de problemas que impedem a publicação; lista vazia = pode publicar.
export function validarParaPublicar(conteudo, midias) {
  const erros = [];
  const imagens = midias.filter((midia) => midia.tipo === 'imagem');
  const videos = midias.filter((midia) => midia.tipo === 'video');

  // Reels e post: uma única mídia, e do tipo certo (nada de imagem sobrando no reels, nem vídeo no post).
  if (conteudo.tipo === 'reels' && !(midias.length === 1 && videos.length === 1)) {
    erros.push('Reels precisa de exatamente 1 vídeo.');
  }
  if (conteudo.tipo === 'post' && !(midias.length === 1 && imagens.length === 1)) {
    erros.push('Post precisa de exatamente 1 imagem.');
  }
  if (conteudo.tipo === 'carrossel') {
    if (videos.length > 0) erros.push(MENSAGEM_CARROSSEL_VIDEO);
    if (midias.length < CARROSSEL_MINIMO || midias.length > CARROSSEL_MAXIMO) {
      erros.push(`Carrossel precisa de ${CARROSSEL_MINIMO} a ${CARROSSEL_MAXIMO} imagens.`);
    }
  }

  imagens.forEach((imagem, indice) => {
    if (imagem.largura == null || imagem.altura == null) return;
    const proporcao = imagem.largura / imagem.altura;
    if (proporcao < PROPORCAO_MINIMA || proporcao > PROPORCAO_MAXIMA) {
      erros.push(`A imagem ${indice + 1} está fora das proporções aceitas pelo Instagram (de 4:5 a 1,91:1).`);
    }
  });

  const legenda = conteudo.legenda ?? '';
  if (legenda.length > LEGENDA_MAXIMA) {
    erros.push('A legenda passa de 2.200 caracteres.');
  }
  const hashtags = legenda.match(REGEX_HASHTAG) ?? [];
  if (hashtags.length > HASHTAGS_MAXIMAS) {
    erros.push('A legenda tem mais de 30 hashtags.');
  }

  return erros;
}
