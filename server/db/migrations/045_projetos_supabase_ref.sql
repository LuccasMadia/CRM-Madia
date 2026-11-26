ALTER TABLE projetos ADD COLUMN supabase_ref TEXT;
CREATE UNIQUE INDEX projetos_supabase_ref_unico ON projetos(supabase_ref) WHERE supabase_ref IS NOT NULL;
