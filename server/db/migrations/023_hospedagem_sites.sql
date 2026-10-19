-- Hospedagem dos sites: onde cada site está, se está no ar e quando o cliente foi avisado da cobrança.
CREATE TABLE hospedagens (
  projeto_id INTEGER PRIMARY KEY REFERENCES projetos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('vercel', 'sem_hospedagem')),
  url TEXT,
  vercel_projeto_id TEXT,
  vercel_projeto_nome TEXT,
  status TEXT NOT NULL DEFAULT 'desconhecido' CHECK (status IN ('desconhecido', 'no_ar', 'fora_do_ar', 'pausado')),
  status_desde TEXT,
  falhas_seguidas INTEGER NOT NULL DEFAULT 0,
  ultimo_motivo TEXT,
  ultima_checagem TEXT,
  cliente_avisado_em TEXT,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE hospedagem_pausas (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  acao TEXT NOT NULL CHECK (acao IN ('pausou', 'religou')),
  em TEXT NOT NULL
);
CREATE INDEX idx_hospedagem_pausas_projeto ON hospedagem_pausas(projeto_id, id);
