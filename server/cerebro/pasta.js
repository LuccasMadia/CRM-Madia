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

function lerLista(pasta, arquivo, avisos) {
  const caminho = path.join(pasta, arquivo);
  if (!existsSync(caminho)) return [];
  try {
    const dados = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!Array.isArray(dados)) throw new Error('não é lista');
    return dados;
  } catch {
    avisos.push(`${arquivo} não é um JSON válido`);
    return [];
  }
}

export function lerPasta(caminho) {
  const vazio = { configurada: false, centro: null, skills: [], rotinas: [], apps_base: [], avisos: [] };
  if (!caminho) return vazio;
  if (!existsSync(caminho) || !statSync(caminho).isDirectory()) {
    return { ...vazio, avisos: ['Pasta do cérebro não encontrada'] };
  }
  const avisos = [];
  const arquivoCentro = path.join(caminho, 'CLAUDE.md');
  const centro = existsSync(arquivoCentro) ? { texto: readFileSync(arquivoCentro, 'utf8') } : null;
  if (!centro) avisos.push('CLAUDE.md não encontrado na pasta do cérebro');

  const dirSkills = path.join(caminho, '.claude', 'skills');
  const skills = [];
  if (existsSync(dirSkills)) {
    for (const d of readdirSync(dirSkills, { withFileTypes: true })) {
      const arq = path.join(dirSkills, d.name, 'SKILL.md');
      if (!d.isDirectory() || !existsSync(arq)) continue;
      const fm = frontmatter(readFileSync(arq, 'utf8'));
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
