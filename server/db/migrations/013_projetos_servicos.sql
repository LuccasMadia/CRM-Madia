CREATE TABLE projetos_servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('placas_nfc', 'sistemas', 'saas', 'google_meu_negocio')),
  modelo_id INTEGER REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  valor_unitario_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_unitario_centavos >= 0),
  venda_id INTEGER REFERENCES placas_vendas(id),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_projetos_servicos_projeto ON projetos_servicos(projeto_id);

ALTER TABLE projetos ADD COLUMN desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0);
