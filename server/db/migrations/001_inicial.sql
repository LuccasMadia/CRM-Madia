CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  empresa TEXT,
  email TEXT,
  telefone TEXT,
  instagram TEXT,
  origem TEXT,
  notas TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE projetos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  etapa TEXT NOT NULL DEFAULT 'contato'
    CHECK (etapa IN ('contato', 'proposta', 'andamento', 'entregue', 'perdido')),
  valor_total_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_total_centavos >= 0),
  data_inicio TEXT,
  prazo_entrega TEXT,
  data_entrega TEXT,
  notas TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_projetos_cliente ON projetos(cliente_id);

CREATE TABLE parcelas (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  descricao TEXT,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  vencimento TEXT NOT NULL,
  pago_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_parcelas_projeto ON parcelas(projeto_id);

CREATE TABLE tarefas (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  prazo TEXT,
  concluida INTEGER NOT NULL DEFAULT 0 CHECK (concluida IN (0, 1)),
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_tarefas_projeto ON tarefas(projeto_id);

CREATE TABLE portfolio (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL UNIQUE REFERENCES projetos(id) ON DELETE CASCADE,
  publicar INTEGER NOT NULL DEFAULT 0 CHECK (publicar IN (0, 1)),
  slug TEXT UNIQUE,
  titulo_publico TEXT,
  descricao_publica TEXT,
  stack TEXT NOT NULL DEFAULT '[]',
  status_publico TEXT,
  live_url TEXT,
  code_url TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE portfolio_imagens (
  id INTEGER PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
  arquivo TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE portfolio_case_study (
  id INTEGER PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
  titulo TEXT,
  descricao TEXT,
  imagem_id INTEGER REFERENCES portfolio_imagens(id) ON DELETE SET NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE conteudos (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  canal TEXT NOT NULL CHECK (canal IN ('instagram', 'portfolio')),
  tipo TEXT NOT NULL CHECK (tipo IN ('post', 'carrossel', 'reels', 'story', 'atualizacao')),
  titulo TEXT NOT NULL,
  legenda TEXT,
  status TEXT NOT NULL DEFAULT 'ideia'
    CHECK (status IN ('ideia', 'produzindo', 'agendado', 'publicado')),
  data_planejada TEXT,
  data_publicada TEXT,
  link TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
