-- O cliente "próprio" é o próprio Lucca (itens de portfólio): fica separado e no topo da lista.
ALTER TABLE clientes ADD COLUMN proprio INTEGER NOT NULL DEFAULT 0;
UPDATE clientes SET proprio = 1 WHERE nome = 'Portfólio';
