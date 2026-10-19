ALTER TABLE placas_vendas ADD COLUMN recebido_em TEXT;
ALTER TABLE placas_vendas ADD COLUMN quantidade_montada INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_montada >= 0);

-- Vendas geradas na entrega de um projeto são cobradas pelas parcelas do projeto.
UPDATE placas_vendas SET recebido_em = data_venda
WHERE id IN (SELECT venda_id FROM projetos_servicos WHERE venda_id IS NOT NULL);

CREATE TABLE placas_montagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES placas_modelos(id),
  quantidade INTEGER NOT NULL CHECK (quantidade >= 1),
  data_montagem TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE placas_montagens_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  montagem_id INTEGER NOT NULL REFERENCES placas_montagens(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES placas_materiais(id),
  quantidade INTEGER NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
