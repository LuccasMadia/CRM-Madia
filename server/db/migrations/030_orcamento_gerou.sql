-- Orçamento aceito gera projetos (site, GMN) e vendas de placa: cada um guarda de qual orçamento veio,
-- para não gerar duas vezes e para poder desfazer. Apagar o orçamento mantém o que ele gerou.
ALTER TABLE projetos ADD COLUMN orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL;
ALTER TABLE placas_vendas ADD COLUMN orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL;
CREATE INDEX idx_projetos_orcamento ON projetos(orcamento_id);
CREATE INDEX idx_placas_vendas_orcamento ON placas_vendas(orcamento_id);
