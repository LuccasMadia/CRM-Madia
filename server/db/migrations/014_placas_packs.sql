CREATE TABLE placas_modelos_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 2),
  preco_total_centavos INTEGER NOT NULL CHECK (preco_total_centavos >= 0),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE (modelo_id, quantidade)
);

ALTER TABLE projetos_servicos ADD COLUMN valor_total_centavos INTEGER CHECK (valor_total_centavos >= 0);
UPDATE projetos_servicos SET valor_total_centavos = valor_unitario_centavos * quantidade WHERE tipo = 'placas_nfc';
