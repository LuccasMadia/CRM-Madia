import { existsSync } from 'node:fs';
import path from 'node:path';

export function validarRepo(caminho) {
  if (!caminho) return ['Configure o caminho do repositório do portfólio'];
  if (!existsSync(caminho)) return [`Pasta não encontrada: ${caminho}`];
  const erros = [];
  if (!existsSync(path.join(caminho, '.git'))) erros.push('A pasta não é um repositório git (falta a pasta .git)');
  if (!existsSync(path.join(caminho, 'package.json'))) erros.push('A pasta não tem package.json');
  return erros;
}

export function validarItens(itens, uploadsDir) {
  const erros = [];
  const donosDoSlug = new Map();
  for (const item of itens) {
    const projeto = item.titulo_publico || item.projeto_titulo;
    const erro = (campo, mensagem) => erros.push({ projeto_id: item.projeto_id, projeto, campo, mensagem });

    if (!item.slug) erro('slug', 'Defina o slug');
    else if (donosDoSlug.has(item.slug)) erro('slug', `Slug repetido (também usado em ${donosDoSlug.get(item.slug)})`);
    else donosDoSlug.set(item.slug, projeto);

    if (!item.titulo_publico) erro('titulo_publico', 'Defina o título público');
    if (!item.descricao_publica) erro('descricao_publica', 'Defina a descrição pública');
    if (!item.stack.length) erro('stack', 'Informe ao menos uma tecnologia');
    if (!item.imagens.length) erro('imagens', 'Adicione ao menos uma imagem');
    for (const imagem of item.imagens) {
      if (!existsSync(path.join(uploadsDir, imagem.arquivo))) {
        erro('imagens', `Arquivo de imagem não encontrado: ${imagem.arquivo}`);
      }
    }
    item.case_study.forEach((slide, i) => {
      if (!slide.titulo) erro('case_study', `Slide ${i + 1}: falta o título`);
      if (!slide.imagem_id) erro('case_study', `Slide ${i + 1}: falta a imagem`);
    });
  }
  return erros;
}
