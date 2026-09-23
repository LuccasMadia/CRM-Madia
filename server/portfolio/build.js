import path from 'node:path';

export function construirPortfolio({ itens, projectsDelivered, uploadsDir, agora }) {
  const copias = [];
  const projects = itens.map((item) => {
    const caminhoWebPorImagem = new Map();
    const images = item.imagens.map((imagem, i) => {
      const destino = `${item.slug}/${String(i + 1).padStart(2, '0')}${path.extname(imagem.arquivo).toLowerCase()}`;
      copias.push({ origem: path.join(uploadsDir, imagem.arquivo), destino });
      const web = `/projects/${destino}`;
      caminhoWebPorImagem.set(imagem.id, web);
      return web;
    });

    const projeto = { id: item.slug, title: item.titulo_publico, description: item.descricao_publica, stack: item.stack };
    if (item.status_publico) projeto.status = item.status_publico;
    if (item.live_url) projeto.liveUrl = item.live_url;
    if (item.code_url) projeto.codeUrl = item.code_url;
    projeto.images = images;
    if (item.case_study.length) {
      projeto.caseStudy = item.case_study.map((slide) => ({
        titulo: slide.titulo,
        imagem: caminhoWebPorImagem.get(slide.imagem_id),
        descricao: slide.descricao ?? '',
      }));
    }
    return projeto;
  });
  return { json: { generatedAt: agora, stats: { projectsDelivered }, projects }, copias };
}
