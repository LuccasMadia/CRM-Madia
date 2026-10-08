ALTER TABLE clientes ADD COLUMN chave_pix TEXT;
ALTER TABLE clientes ADD COLUMN tipo_chave_pix TEXT CHECK (tipo_chave_pix IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));
ALTER TABLE clientes ADD COLUMN cidade TEXT;
