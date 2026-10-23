-- Orçamento aceito gera projetos (site, GMN) e vendas de placa: cada um guarda de qual orçamento veio,
-- para não gerar duas vezes e para poder desfazer. Apagar o orçamento mantém o que ele gerou.
ALTER TABLE projetos ADD COLUMN orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL;
ALTER TABLE placas_vendas ADD COLUMN orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL;
CREATE INDEX idx_projetos_orcamento ON projetos(orcamento_id);
CREATE INDEX idx_placas_vendas_orcamento ON placas_vendas(orcamento_id);

-- O aceite também pode usar um projeto que já existia (vinculado): esse nunca é apagado ao desfazer,
-- só desvinculado. Por isso o projeto diz se foi vinculado e a parcela diz se foi o aceite que a criou.
ALTER TABLE projetos ADD COLUMN orcamento_vinculado INTEGER NOT NULL DEFAULT 0 CHECK (orcamento_vinculado IN (0, 1));
ALTER TABLE parcelas ADD COLUMN orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL;
CREATE INDEX idx_parcelas_orcamento ON parcelas(orcamento_id);
