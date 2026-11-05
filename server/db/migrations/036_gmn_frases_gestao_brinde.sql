-- GMN: configuração R$ 250 avulsa; vem grátis para quem contrata a gestão mensal por pelo menos 3 meses.
-- O mínimo de 3 meses vale só para o desconto da configuração: a gestão sozinha pode ser por menos tempo.
-- Só troca a frase se ainda for a original, para não apagar edição do Lucca.
UPDATE tabela_servicos
   SET frase = 'Montagem única do perfil no Google Maps: fotos, horários e categorias. Grátis para quem contrata a gestão mensal por pelo menos 3 meses.'
 WHERE tipo = 'gmn_config' AND frase = 'Perfil completo no Google Maps, com fotos, horários e categorias';

UPDATE tabela_servicos
   SET frase = 'Posts e respostas a avaliações todo mês. Recomendamos no mínimo 3 meses; com 3 meses ou mais, a configuração sai grátis.'
 WHERE nome = 'Gestão do Google Meu Negócio' AND frase = 'Posts e respostas a avaliações todo mês';

-- OR IGNORE: se o Lucca já definiu outro valor, fica o dele (a chave nunca tinha sido preenchida: saía R$ 0,00).
INSERT OR IGNORE INTO config (chave, valor) VALUES ('preco_servico_google_meu_negocio_centavos', '25000');
