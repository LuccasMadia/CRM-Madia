ALTER TABLE projetos ADD COLUMN mensalidade_ativa INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_ativa IN (0, 1));
ALTER TABLE projetos ADD COLUMN mensalidade_valor_centavos INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_valor_centavos >= 0);
ALTER TABLE projetos ADD COLUMN mensalidade_dia_vencimento INTEGER CHECK (mensalidade_dia_vencimento IS NULL OR (mensalidade_dia_vencimento BETWEEN 1 AND 31));
ALTER TABLE parcelas ADD COLUMN mensalidade INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade IN (0, 1));
