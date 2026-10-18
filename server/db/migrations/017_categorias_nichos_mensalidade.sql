CREATE TABLE categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE nichos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE projetos_categorias (
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  PRIMARY KEY (projeto_id, categoria_id)
);
CREATE INDEX idx_projetos_categorias_categoria ON projetos_categorias(categoria_id);

ALTER TABLE projetos ADD COLUMN nicho_id INTEGER REFERENCES nichos(id);
ALTER TABLE projetos ADD COLUMN mensalidade_inicio_modo TEXT NOT NULL DEFAULT 'entrega'
  CHECK (mensalidade_inicio_modo IN ('desenvolvimento', 'entrega', 'data'));
ALTER TABLE projetos ADD COLUMN mensalidade_inicio_data TEXT;

INSERT INTO categorias (nome, ordem, criado_em, atualizado_em) VALUES
  ('Site', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Landing page', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Sistema', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('SaaS', 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Linhas Sistemas/SaaS dos sites viram categorias.
INSERT INTO projetos_categorias (projeto_id, categoria_id)
  SELECT DISTINCT ps.projeto_id, c.id
  FROM projetos_servicos ps
  JOIN projetos p ON p.id = ps.projeto_id
  JOIN categorias c ON c.nome = CASE ps.tipo WHEN 'sistemas' THEN 'Sistema' ELSE 'SaaS' END
  WHERE ps.tipo IN ('sistemas', 'saas') AND p.servico = 'site_sistema';

-- Site sem linha nenhuma recebe "Site".
INSERT INTO projetos_categorias (projeto_id, categoria_id)
  SELECT p.id, (SELECT id FROM categorias WHERE nome = 'Site')
  FROM projetos p
  WHERE p.servico = 'site_sistema'
    AND NOT EXISTS (SELECT 1 FROM projetos_categorias pc WHERE pc.projeto_id = p.id);

DELETE FROM projetos_servicos WHERE tipo IN ('sistemas', 'saas');

-- Mensalidade que já gerou parcela: começa na primeira mensalidade existente.
UPDATE projetos
  SET mensalidade_inicio_modo = 'data',
      mensalidade_inicio_data = (SELECT MIN(pa.vencimento) FROM parcelas pa WHERE pa.projeto_id = projetos.id AND pa.mensalidade = 1)
  WHERE mensalidade_ativa = 1
    AND EXISTS (SELECT 1 FROM parcelas pa WHERE pa.projeto_id = projetos.id AND pa.mensalidade = 1);

-- GMN/placas com mensalidade e sem parcela: cobra desde a criação (comportamento antigo).
UPDATE projetos
  SET mensalidade_inicio_modo = 'data', mensalidade_inicio_data = substr(criado_em, 1, 10)
  WHERE servico <> 'site_sistema' AND mensalidade_ativa = 1 AND mensalidade_inicio_data IS NULL;

DELETE FROM config WHERE chave IN ('preco_servico_sistemas_centavos', 'preco_servico_saas_centavos');
