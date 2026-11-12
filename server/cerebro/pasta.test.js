import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lerPasta } from './pasta.js';

function pastaTemp({ skill = '---\nname: relatorio-projetos\ndescription: Monta o relatório\n---\n# Corpo', rotinas, apps } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cerebro-teste-'));
  writeFileSync(path.join(dir, 'CLAUDE.md'), '# Madia');
  mkdirSync(path.join(dir, '.claude', 'skills', 'relatorio-projetos'), { recursive: true });
  writeFileSync(path.join(dir, '.claude', 'skills', 'relatorio-projetos', 'SKILL.md'), skill);
  writeFileSync(path.join(dir, 'rotinas.json'), rotinas ?? JSON.stringify([
    { id: 'checar', nome: 'Checar', o_que_faz: 'Verifica', frequencia: 'a cada 5 minutos', estado: 'ativa', ultima_execucao: null },
  ]));
  writeFileSync(path.join(dir, 'apps.json'), apps ?? JSON.stringify([
    { id: 'vercel', nome: 'Vercel', para_que: 'Hospedagem', conexao: 'crm:vercel_token' },
  ]));
  return dir;
}

describe('lerPasta', () => {
  it('null devolve pasta não configurada', () => {
    expect(lerPasta(null)).toEqual({ configurada: false, centro: null, skills: [], rotinas: [], apps_base: [], avisos: [] });
  });

  it('pasta inexistente avisa', () => {
    const r = lerPasta(path.join(os.tmpdir(), 'nao-existe-cerebro-xyz'));
    expect(r.configurada).toBe(false);
    expect(r.avisos).toContain('Pasta do cérebro não encontrada');
  });

  it('pasta completa lê centro, skill, rotinas e apps', () => {
    const r = lerPasta(pastaTemp());
    expect(r.configurada).toBe(true);
    expect(r.centro).toEqual({ texto: '# Madia' });
    expect(r.skills).toEqual([{ id: 'relatorio-projetos', nome: 'relatorio-projetos', descricao: 'Monta o relatório' }]);
    expect(r.rotinas).toHaveLength(1);
    expect(r.rotinas[0]).toMatchObject({ id: 'checar', frequencia: 'a cada 5 minutos', ultima_execucao: null });
    expect(r.apps_base).toEqual([{ id: 'vercel', nome: 'Vercel', para_que: 'Hospedagem', conexao: 'crm:vercel_token' }]);
    expect(r.avisos).toEqual([]);
  });

  it('rotinas.json inválido avisa e o resto continua', () => {
    const r = lerPasta(pastaTemp({ rotinas: '{quebrado' }));
    expect(r.rotinas).toEqual([]);
    expect(r.avisos).toEqual(['rotinas.json não é um JSON válido']);
    expect(r.apps_base).toHaveLength(1);
    expect(r.skills).toHaveLength(1);
  });

  it('SKILL.md sem frontmatter usa o nome da pasta', () => {
    const r = lerPasta(pastaTemp({ skill: '# só texto' }));
    expect(r.skills).toEqual([{ id: 'relatorio-projetos', nome: 'relatorio-projetos', descricao: '' }]);
  });
});
