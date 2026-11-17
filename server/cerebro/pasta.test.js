import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
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
    expect(lerPasta(null)).toEqual({ configurada: false, centro: null, skills: [], rotinas: [], apps_base: [], arquivos: [], avisos: [] });
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
    expect(r.skills).toEqual([{ id: 'relatorio-projetos', nome: 'relatorio-projetos', descricao: 'Monta o relatório', texto: '---\nname: relatorio-projetos\ndescription: Monta o relatório\n---\n# Corpo' }]);
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
    expect(r.skills).toEqual([{ id: 'relatorio-projetos', nome: 'relatorio-projetos', descricao: '', texto: '# só texto' }]);
  });

  it('skill traz o texto inteiro do SKILL.md', () => {
    const skill = `---\nname: x\n---\n${'linha\n'.repeat(500)}`;
    expect(lerPasta(pastaTemp({ skill })).skills[0].texto).toBe(skill);
  });
});

describe('lerPasta: relatorios', () => {
  const comRelatorios = (fn) => {
    const dir = pastaTemp();
    mkdirSync(path.join(dir, 'relatorios', 'sub'), { recursive: true });
    fn(path.join(dir, 'relatorios'));
    return dir;
  };

  it('relatorios: só .md do primeiro nível, o mais recente primeiro', () => {
    const dir = comRelatorios((rel) => {
      writeFileSync(path.join(rel, 'velho.md'), 'a');
      writeFileSync(path.join(rel, 'novo.md'), 'b');
      writeFileSync(path.join(rel, 'nota.txt'), 'c');
      writeFileSync(path.join(rel, 'sub', 'fundo.md'), 'd');
      utimesSync(path.join(rel, 'velho.md'), new Date('2026-01-01'), new Date('2026-01-01'));
      utimesSync(path.join(rel, 'novo.md'), new Date('2026-06-01'), new Date('2026-06-01'));
    });
    const r = lerPasta(dir);
    expect(r.arquivos.map((a) => a.id)).toEqual(['arquivo:relatorios/novo.md', 'arquivo:relatorios/velho.md']);
    expect(r.arquivos[0]).toMatchObject({ nome: 'novo.md', texto: 'b' });
    expect(r.arquivos[0].modificado_em).toBeInstanceOf(Date);
  });

  it('arquivo acima de 200 KB vem cortado com o aviso no fim', () => {
    const dir = comRelatorios((rel) => writeFileSync(path.join(rel, 'grande.md'), 'x'.repeat(300 * 1024)));
    const { texto } = lerPasta(dir).arquivos[0];
    expect(texto.length).toBeLessThanOrEqual(200 * 1024 + 60);
    expect(texto.endsWith('[… arquivo cortado em 200 KB]')).toBe(true);
  });

  it('sem pasta relatorios, arquivos é [] sem aviso', () => {
    const r = lerPasta(pastaTemp());
    expect(r.arquivos).toEqual([]);
    expect(r.avisos).toEqual([]);
  });
});

describe('lerPasta: nunca lança', () => {
  it('[null] em rotinas.json ignora o item e avisa', () => {
    const r = lerPasta(pastaTemp({ rotinas: '[null]' }));
    expect(r.rotinas).toEqual([]);
    expect(r.avisos).toEqual(['rotinas.json tem itens sem id ou nome que foram ignorados']);
  });

  it('app sem nome é ignorado e avisa', () => {
    const r = lerPasta(pastaTemp({ apps: JSON.stringify([
      { id: 'vercel', nome: 'Vercel', para_que: 'Hospedagem', conexao: 'x' },
      { id: 'sem-nome', para_que: 'y', conexao: 'z' },
    ]) }));
    expect(r.apps_base).toHaveLength(1);
    expect(r.avisos).toEqual(['apps.json tem itens sem id ou nome que foram ignorados']);
  });

  it('.claude/skills que é arquivo avisa sem lançar', () => {
    const dir = pastaTemp();
    rmSync(path.join(dir, '.claude', 'skills'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'skills'), 'x');
    const r = lerPasta(dir);
    expect(r.skills).toEqual([]);
    expect(r.avisos).toEqual(['Não foi possível ler as skills da pasta do cérebro']);
  });

  it('apps.json que não é lista avisa', () => {
    const r = lerPasta(pastaTemp({ apps: '{"a":1}' }));
    expect(r.apps_base).toEqual([]);
    expect(r.avisos).toEqual(['apps.json não é um JSON válido']);
  });

  it('sem CLAUDE.md avisa e centro é null', () => {
    const dir = pastaTemp();
    rmSync(path.join(dir, 'CLAUDE.md'));
    const r = lerPasta(dir);
    expect(r.centro).toBeNull();
    expect(r.avisos).toContain('CLAUDE.md não encontrado na pasta do cérebro');
  });

  it('CLAUDE.md que é pasta avisa sem lançar', () => {
    const dir = pastaTemp();
    rmSync(path.join(dir, 'CLAUDE.md'));
    mkdirSync(path.join(dir, 'CLAUDE.md'));
    const r = lerPasta(dir);
    expect(r.centro).toBeNull();
    expect(r.avisos).toEqual(['CLAUDE.md não pôde ser lido']);
    expect(r.skills).toHaveLength(1);
  });
});
