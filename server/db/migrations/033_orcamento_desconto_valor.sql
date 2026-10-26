-- Desconto em reais no orçamento (ex.: R$ 1.200 com R$ 200 de desconto). Soma com o desconto de combo.
-- NULL = sem desconto em reais.
ALTER TABLE orcamentos ADD COLUMN desconto_valor_centavos INTEGER CHECK (desconto_valor_centavos IS NULL OR desconto_valor_centavos >= 0);
