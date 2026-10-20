-- Ferramentas que o Lucca paga para trabalhar (a maioria IA): mensalidade fixa ou créditos comprados em recargas.
CREATE TABLE ferramentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cobranca TEXT NOT NULL CHECK (cobranca IN ('mensalidade', 'creditos')),
  -- Só para mensalidade: valor em reais que cai na fatura e dia do mês em que cobra.
  valor_centavos INTEGER,
  dia_cobranca INTEGER CHECK (dia_cobranca BETWEEN 1 AND 31),
  ativa INTEGER NOT NULL DEFAULT 1,
  observacao TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE ferramentas_recargas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ferramenta_id INTEGER NOT NULL REFERENCES ferramentas(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_ferramentas_recargas_ferramenta ON ferramentas_recargas(ferramenta_id, data);

-- Valor fica 0 até o Lucca preencher o que vem na fatura.
INSERT INTO ferramentas (nome, cobranca, valor_centavos, criado_em, atualizado_em)
  VALUES ('Claude', 'mensalidade', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
