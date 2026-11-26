ALTER TABLE projetos ADD COLUMN figma_arquivo TEXT;
CREATE UNIQUE INDEX projetos_figma_arquivo_unico ON projetos(figma_arquivo) WHERE figma_arquivo IS NOT NULL;
