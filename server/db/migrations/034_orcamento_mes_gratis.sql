-- Item mensal com o 1º mês grátis (ex.: gestão do GMN de brinde na configuração). Só aparece no PDF/tela;
-- o valor mensal continua o mesmo.
ALTER TABLE orcamento_itens ADD COLUMN primeiro_mes_gratis INTEGER NOT NULL DEFAULT 0 CHECK (primeiro_mes_gratis IN (0, 1));
