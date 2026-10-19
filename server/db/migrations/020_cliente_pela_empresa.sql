-- O cliente passa a ser identificado pela empresa: `nome` guarda o nome da empresa e a pessoa de contato vai para `responsavel`.
-- Cliente sem empresa preenchida mantém o `nome` como está (na prática já era o nome do negócio) e fica sem responsável.

ALTER TABLE clientes ADD COLUMN responsavel TEXT;

UPDATE clientes SET responsavel = nome, nome = trim(empresa)
WHERE empresa IS NOT NULL AND trim(empresa) <> '';

ALTER TABLE clientes DROP COLUMN empresa;
