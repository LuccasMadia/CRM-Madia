-- Projeto privado: uso interno (Cérebro, CRM, controles próprios). Sempre também é ficticio = 1,
-- então fica fora do financeiro, da cobrança e dos números reais; só ganha visão própria.
ALTER TABLE projetos ADD COLUMN privado INTEGER NOT NULL DEFAULT 0 CHECK (privado IN (0, 1));
