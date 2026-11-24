-- A primeira parcela paga de um site em Orçamento enviado move o projeto para Versão final (o trabalho começa).
-- Gatilhos porque a parcela pode ser paga por mais de um caminho (tela, orçamento, importação).
CREATE TRIGGER parcelas_paga_avanca_projeto_ao_pagar AFTER UPDATE OF pago_em ON parcelas
WHEN NEW.pago_em IS NOT NULL AND OLD.pago_em IS NULL AND NEW.mensalidade = 0
BEGIN
  UPDATE projetos SET etapa = 'andamento', data_inicio = COALESCE(data_inicio, date('now', 'localtime'))
  WHERE id = NEW.projeto_id AND etapa = 'valor_definido' AND servico = 'site_sistema' AND ficticio = 0;
END;

CREATE TRIGGER parcelas_paga_avanca_projeto_ao_criar AFTER INSERT ON parcelas
WHEN NEW.pago_em IS NOT NULL AND NEW.mensalidade = 0
BEGIN
  UPDATE projetos SET etapa = 'andamento', data_inicio = COALESCE(data_inicio, date('now', 'localtime'))
  WHERE id = NEW.projeto_id AND etapa = 'valor_definido' AND servico = 'site_sistema' AND ficticio = 0;
END;
