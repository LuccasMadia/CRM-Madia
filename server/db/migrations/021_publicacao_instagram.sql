-- sem-chaves-estrangeiras
-- Rascunho com várias mídias (conteudo_midias, substitui a coluna `arte`) e estados de publicação.
-- O CHECK de `estado` só muda recriando a tabela; sem chaves estrangeiras para o DROP não apagar as mídias em cascata.

CREATE TABLE conteudos_novo (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('post', 'carrossel', 'reels')),
  titulo TEXT NOT NULL,
  legenda TEXT,
  estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho', 'pronto', 'agendado', 'publicando', 'publicado', 'falhou', 'atrasado')),
  ordem INTEGER NOT NULL DEFAULT 0,
  data_planejada TEXT,
  midia_id TEXT UNIQUE REFERENCES instagram_midias(id) ON DELETE SET NULL,
  agendado_para TEXT,
  publicacao_erro TEXT,
  publicacao_token TEXT,
  publicacao_container_id TEXT,
  publicacao_enviado_em TEXT,
  publicacao_midia_id TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
INSERT INTO conteudos_novo (id, projeto_id, tipo, titulo, legenda, estado, ordem, data_planejada, midia_id, criado_em, atualizado_em)
  SELECT id, projeto_id, tipo, titulo, legenda, estado, ordem, data_planejada, midia_id, criado_em, atualizado_em
  FROM conteudos;

CREATE TABLE conteudo_midias (
  id INTEGER PRIMARY KEY,
  conteudo_id INTEGER NOT NULL REFERENCES conteudos(id) ON DELETE CASCADE,
  arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('imagem', 'video')),
  largura INTEGER,
  altura INTEGER,
  ordem INTEGER NOT NULL
);
INSERT INTO conteudo_midias (conteudo_id, arquivo, tipo, ordem)
  SELECT id, arte, 'imagem', 0 FROM conteudos WHERE arte IS NOT NULL AND arte <> '';
CREATE INDEX idx_conteudo_midias_conteudo ON conteudo_midias(conteudo_id, ordem);

DROP TABLE conteudos;
ALTER TABLE conteudos_novo RENAME TO conteudos;
CREATE INDEX idx_conteudos_projeto ON conteudos(projeto_id);
