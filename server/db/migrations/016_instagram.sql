CREATE TABLE instagram_midias (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('post', 'carrossel', 'reels')),
  legenda TEXT,
  permalink TEXT,
  publicado_em TEXT NOT NULL,
  capa TEXT,
  curtidas INTEGER,
  comentarios INTEGER,
  alcance INTEGER,
  visualizacoes INTEGER,
  salvamentos INTEGER,
  compartilhamentos INTEGER,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  removido INTEGER NOT NULL DEFAULT 0 CHECK (removido IN (0, 1)),
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_instagram_midias_publicado ON instagram_midias(publicado_em);

CREATE TABLE instagram_seguidores (
  dia TEXT PRIMARY KEY,
  seguidores INTEGER NOT NULL
);

-- Conteúdos marcados como publicados antes da sincronização: a primeira sync
-- tenta passar o projeto para o post real do mesmo dia e tipo (ou, se a data
-- não bater, da mesma legenda), depois apaga.
CREATE TABLE conteudos_legado (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER,
  tipo TEXT NOT NULL,
  data_publicada TEXT,
  legenda TEXT
);
INSERT INTO conteudos_legado (id, projeto_id, tipo, data_publicada, legenda)
  SELECT id, projeto_id, CASE WHEN tipo IN ('post', 'carrossel', 'reels') THEN tipo ELSE 'post' END, data_publicada, legenda
  FROM conteudos WHERE status = 'publicado';

CREATE TABLE conteudos_novo (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('post', 'carrossel', 'reels')),
  titulo TEXT NOT NULL,
  legenda TEXT,
  estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho', 'pronto')),
  ordem INTEGER NOT NULL DEFAULT 0,
  data_planejada TEXT,
  arte TEXT,
  midia_id TEXT UNIQUE REFERENCES instagram_midias(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
INSERT INTO conteudos_novo (id, projeto_id, tipo, titulo, legenda, estado, ordem, data_planejada, criado_em, atualizado_em)
  SELECT id, projeto_id,
    CASE WHEN tipo IN ('post', 'carrossel', 'reels') THEN tipo ELSE 'post' END,
    titulo, legenda,
    CASE status WHEN 'agendado' THEN 'pronto' ELSE 'rascunho' END,
    id, data_planejada, criado_em, atualizado_em
  FROM conteudos WHERE status <> 'publicado';
DROP TABLE conteudos;
ALTER TABLE conteudos_novo RENAME TO conteudos;
CREATE INDEX idx_conteudos_projeto ON conteudos(projeto_id);
