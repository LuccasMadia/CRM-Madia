ALTER TABLE projetos ADD COLUMN postou_instagram INTEGER NOT NULL DEFAULT 0 CHECK (postou_instagram IN (0, 1));
