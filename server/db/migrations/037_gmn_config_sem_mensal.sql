-- A configuração do GMN é cobrança única; itens dela que ficaram com valor mensal (digitado no campo "Por mês") entravam no total mensal.
UPDATE orcamento_itens
   SET valor_mensal_centavos = NULL
 WHERE valor_mensal_centavos IS NOT NULL
   AND servico_id IN (SELECT id FROM tabela_servicos WHERE tipo = 'gmn_config');
