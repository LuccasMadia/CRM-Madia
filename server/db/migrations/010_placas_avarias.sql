CREATE TABLE placas_avarias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  custo_unitario_centavos INTEGER NOT NULL,
  observacao TEXT,
  data_avaria TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE placas_avarias_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaria_id INTEGER NOT NULL REFERENCES placas_avarias(id),
  material_id INTEGER NOT NULL REFERENCES placas_materiais(id),
  quantidade INTEGER NOT NULL
);
