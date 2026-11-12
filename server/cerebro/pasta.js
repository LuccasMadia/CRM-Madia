import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Lê só as linhas `chave: valor` do bloco entre as duas primeiras linhas `---`.
function frontmatter(texto) {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/);
  if (linhas[0]?.trim() !== '---') return {};
  const fim = linhas.indexOf('---', 1);
  if (fim === -1) return {};
  const dados = {};
  for (const l of linhas.slice(1, fim)) {
    const m = l.match(/^([\w-]+):\s*(.*)$/);
    if (m) dados[m[1]] = m[2].trim();
  }
  return dados;
}

// Lê um arquivo de texto; qualquer falha vira aviso e null.
function lerTexto(caminho, nome, avisos) {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    avisos.push(`${nome} não pôde ser lido`);
    return null;
  }
}

const objeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function lerLista(pasta, arquivo, avisos) {
  const caminho = path.join(pasta, arquivo);
  if (!existsSync(caminho)) return [];
  const texto = lerTexto(caminho, arquivo, avisos);
  if (texto === null) return [];
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = null;
  }
  if (!Array.isArray(dados)) {
    avisos.push(`${arquivo} não é um JSON válido`);
    return [];
  }
  const validos = dados.filter((x) => objeto(x) && typeof x.id === 'string' && typeof x.nome === 'string');
  if (validos.length < dados.length) avisos.push(`${arquivo} tem itens sem id ou nome que foram ignorados`);
  return validos;
}

export function lerPasta(caminho) {
  const vazio = { configurada: false, centro: null, skills: [], rotinas: [], apps_base: [], avisos: [] };
  if (!caminho) return vazio;
  if (!existsSync(caminho) || !statSync(caminho).isDirectory()) {
    return { ...vazio, avisos: ['Pasta do cérebro não encontrada'] };
  }
  const avisos = [];
  const arquivoCentro = path.join(caminho, 'CLAUDE.md');
  const textoCentro = existsSync(arquivoCentro) ? lerTexto(arquivoCentro, 'CLAUDE.md', avisos) : null;
  if (!existsSync(arquivoCentro)) avisos.push('CLAUDE.md não encontrado na pasta do cérebro');
  const centro = textoCentro === null ? null : { texto: textoCentro };

  const dirSkills = path.join(caminho, '.claude', 'skills');
  const skills = [];
  if (existsSync(dirSkills)) {
    let entradas = [];
    try {
      entradas = readdirSync(dirSkills, { withFileTypes: true });
    } catch {
      avisos.push('Não foi possível ler as skills da pasta do cérebro');
    }
    for (const d of entradas) {
      const arq = path.join(dirSkills, d.name, 'SKILL.md');
      if (!d.isDirectory() || !existsSync(arq)) continue;
      const textoSkill = lerTexto(arq, `${d.name}/SKILL.md`, avisos);
      if (textoSkill === null) continue;
      const fm = frontmatter(textoSkill);
      skills.push({ id: d.name, nome: fm.name || d.name, descricao: fm.description || '' });
    }
  }

  const rotinas = lerLista(caminho, 'rotinas.json', avisos).map((r) => ({
    id: r.id, nome: r.nome, o_que_faz: r.o_que_faz, frequencia: r.frequencia, estado: r.estado, ultima_execucao: r.ultima_execucao ?? null,
  }));
  const apps_base = lerLista(caminho, 'apps.json', avisos).map((a) => ({
    id: a.id, nome: a.nome, para_que: a.para_que, conexao: a.conexao,
  }));
  return { configurada: true, centro, skills, rotinas, apps_base, avisos };
}
