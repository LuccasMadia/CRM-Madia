-- Cliente com várias lojas (ex.: Fotcell com 3): cada loja tem perfil no Google e placas próprios,
-- mas orçamento e cobrança continuam no cliente. Apagar a loja deixa o projeto/venda só no cliente.
CREATE TABLE lojas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  responsavel TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_lojas_cliente ON lojas(cliente_id);

ALTER TABLE projetos ADD COLUMN loja_id INTEGER REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE placas_vendas ADD COLUMN loja_id INTEGER REFERENCES lojas(id) ON DELETE SET NULL;
