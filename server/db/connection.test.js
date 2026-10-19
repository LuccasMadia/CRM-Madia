import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDb, migrate } from './connection.js';

describe('openDb', () => {
  it('cria todas as tabelas do esquema inicial', () => {
    const db = openDb(':memory:');
    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);
    expect(tabelas).toEqual(
      expect.arrayContaining([
        'clientes', 'projetos', 'parcelas', 'tarefas', 'portfolio',
        'portfolio_imagens', 'portfolio_case_study', 'conteudos', 'config', 'schema_migrations',
      ]),
    );
  });

  it('não reaplica migrações já registradas', () => {
    const db = openDb(':memory:');
    const antes = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
    migrate(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n).toBe(antes);
  });

  it('liga as chaves estrangeiras', () => {
    const db = openDb(':memory:');
    const agora = new Date().toISOString();
    expect(() =>
      db
        .prepare('INSERT INTO projetos (cliente_id, titulo, criado_em, atualizado_em) VALUES (999, ?, ?, ?)')
        .run('X', agora, agora),
    ).toThrow(/FOREIGN KEY/);
  });

  it('cria a pasta do arquivo do banco', () => {
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'crm-db-')), 'sub');
    const db = openDb(path.join(dir, 'crm.db'));
    db.close();
    expect(existsSync(path.join(dir, 'crm.db'))).toBe(true);
  });
});

describe('migration 014_placas_packs', () => {
  it('preenche valor_total_centavos das linhas de placas já existentes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('CREATE TABLE schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
    const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql') && f < '014').sort()) {
      db.exec(readFileSync(path.join(pasta, arquivo), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?, ?)').run(arquivo, 'x');
    }
    const t = '2026-10-01T00:00:00.000Z';
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
    db.prepare('INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('P', t, t);
    db.prepare('INSERT INTO placas_modelos (id, nome, preco_venda_centavos, criado_em, atualizado_em) VALUES (1, ?, 8000, ?, ?)').run('10x10', t, t);
    db.prepare("INSERT INTO projetos_servicos (projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, criado_em, atualizado_em) VALUES (1, 'placas_nfc', 1, 2, 7000, ?, ?)").run(t, t);
    db.prepare("INSERT INTO projetos_servicos (projeto_id, tipo, quantidade, valor_unitario_centavos, criado_em, atualizado_em) VALUES (1, 'saas', 1, 5000, ?, ?)").run(t, t);

    migrate(db);

    const linhas = db.prepare('SELECT tipo, valor_total_centavos FROM projetos_servicos ORDER BY id').all().map((r) => ({ ...r }));
    // a linha 'saas' deixa de existir na 017 (vira categoria)
    expect(linhas).toEqual([{ tipo: 'placas_nfc', valor_total_centavos: 14000 }]);
  });
});

describe('migration 017_categorias_nichos_mensalidade', () => {
  function bancoAte017() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('CREATE TABLE schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
    const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql') && f < '017').sort()) {
      db.exec(readFileSync(path.join(pasta, arquivo), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?, ?)').run(arquivo, 'x');
    }
    return db;
  }

  it('converte linhas em categorias, define início das mensalidades e apaga os preços', () => {
    const db = bancoAte017();
    const t = '2026-10-01T00:00:00.000Z';
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
    const projeto = (id, extra = '') => db.exec(`INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em${extra ? ', ' + extra.split('|')[0] : ''})
      VALUES (${id}, 1, 'P${id}', '2026-08-15T10:00:00.000Z', '${t}'${extra ? ', ' + extra.split('|')[1] : ''})`);
    projeto(1); // sem linhas → Site
    projeto(2); // sistemas + saas
    projeto(3, 'mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento|1, 5000, 5'); // ativa sem parcela
    projeto(4, 'mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento|1, 5000, 10'); // ativa com parcelas
    projeto(5, "servico, etapa, mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento|'google_meu_negocio', 'andamento', 1, 3000, 10");
    const linhaServico = db.prepare(`INSERT INTO projetos_servicos (projeto_id, tipo, valor_unitario_centavos, criado_em, atualizado_em) VALUES (?, ?, 100, '${t}', '${t}')`);
    linhaServico.run(2, 'sistemas');
    linhaServico.run(2, 'saas');
    const mensal = db.prepare(`INSERT INTO parcelas (projeto_id, descricao, valor_centavos, vencimento, mensalidade, criado_em, atualizado_em) VALUES (4, 'Mensalidade', 5000, ?, 1, '${t}', '${t}')`);
    mensal.run('2026-09-10');
    mensal.run('2026-08-10');
    db.prepare("INSERT INTO config (chave, valor) VALUES ('preco_servico_sistemas_centavos', '150000'), ('preco_servico_saas_centavos', '9900'), ('preco_servico_google_meu_negocio_centavos', '20000')").run();

    migrate(db);

    expect(db.prepare('SELECT nome FROM categorias ORDER BY ordem').all().map((c) => c.nome)).toEqual(['Site', 'Landing page', 'Sistema', 'SaaS']);
    const categoriasDe = (id) => db.prepare(`SELECT c.nome FROM projetos_categorias pc JOIN categorias c ON c.id = pc.categoria_id
      WHERE pc.projeto_id = ? ORDER BY c.ordem`).all(id).map((c) => c.nome);
    expect(categoriasDe(1)).toEqual(['Site']);
    expect(categoriasDe(2)).toEqual(['Sistema', 'SaaS']);
    expect(categoriasDe(5)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM projetos_servicos WHERE tipo IN ('sistemas', 'saas')").get().n).toBe(0);
    const inicio = (id) => ({ ...db.prepare('SELECT mensalidade_inicio_modo AS modo, mensalidade_inicio_data AS data FROM projetos WHERE id = ?').get(id) });
    expect(inicio(1)).toEqual({ modo: 'entrega', data: null });
    expect(inicio(3)).toEqual({ modo: 'entrega', data: null });
    expect(inicio(4)).toEqual({ modo: 'data', data: '2026-08-10' });
    expect(inicio(5)).toEqual({ modo: 'data', data: '2026-08-15' });
    expect(db.prepare('SELECT chave FROM config ORDER BY chave').all().map((c) => c.chave)).toEqual(['preco_servico_google_meu_negocio_centavos']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM nichos').get().n).toBe(0);
  });

  it('nome de categoria e nicho é único sem diferenciar maiúsculas', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO nichos (nome, criado_em, atualizado_em) VALUES ('Barbearia', 'x', 'x')").run();
    expect(() => db.prepare("INSERT INTO nichos (nome, criado_em, atualizado_em) VALUES ('barbearia', 'x', 'x')").run()).toThrow(/UNIQUE/);
    expect(() => db.prepare("INSERT INTO categorias (nome, criado_em, atualizado_em) VALUES ('site', 'x', 'x')").run()).toThrow(/UNIQUE/);
  });
});

describe('migration 019_etapas_funil_sites', () => {
  it('troca as etapas antigas pelas novas sem apagar parcelas e tarefas', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    migrate(db, { ate: '018_placas_montagens_recebimento.sql' });
    const t = '2026-10-01T00:00:00.000Z';
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
    const projeto = db.prepare('INSERT INTO projetos (id, cliente_id, titulo, etapa, servico, criado_em, atualizado_em) VALUES (?, 1, ?, ?, ?, ?, ?)');
    projeto.run(1, 'A', 'contato', 'site_sistema', t, t);
    projeto.run(2, 'B', 'proposta', 'site_sistema', t, t);
    projeto.run(3, 'C', 'andamento', 'site_sistema', t, t);
    projeto.run(4, 'D', 'andamento', 'google_meu_negocio', t, t);
    db.prepare('INSERT INTO parcelas (projeto_id, valor_centavos, vencimento, criado_em, atualizado_em) VALUES (2, 500, ?, ?, ?)').run('2026-10-10', t, t);
    db.prepare('INSERT INTO tarefas (projeto_id, texto, criado_em, atualizado_em) VALUES (3, ?, ?, ?)').run('Fazer', t, t);

    migrate(db);

    expect(db.prepare('SELECT id, etapa, prototipo_pronto, teste_inicio FROM projetos ORDER BY id').all().map((r) => ({ ...r }))).toEqual([
      { id: 1, etapa: 'ideia', prototipo_pronto: 0, teste_inicio: null },
      { id: 2, etapa: 'valor_definido', prototipo_pronto: 0, teste_inicio: null },
      { id: 3, etapa: 'andamento', prototipo_pronto: 0, teste_inicio: null },
      { id: 4, etapa: 'andamento', prototipo_pronto: 0, teste_inicio: null },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM parcelas').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tarefas').get().n).toBe(1);
    expect(db.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
    expect(() => db.prepare("UPDATE projetos SET etapa = 'contato' WHERE id = 1").run()).toThrow(/CHECK/);
    // a chave estrangeira dos filhos continua valendo depois da troca da tabela
    expect(() => db.prepare('DELETE FROM projetos WHERE id = 2').run()).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM parcelas').get().n).toBe(0);
  });
});
