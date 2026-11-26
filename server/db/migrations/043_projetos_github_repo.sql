-- Repositório do GitHub ligado ao projeto (formato dono/nome).
ALTER TABLE projetos ADD COLUMN github_repo TEXT;
CREATE UNIQUE INDEX projetos_github_repo_unico ON projetos(github_repo) WHERE github_repo IS NOT NULL;
