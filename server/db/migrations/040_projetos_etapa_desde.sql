-- Desde quando o projeto está na etapa atual (para avisar de projeto parado).
-- Os gatilhos cobrem todos os caminhos que criam ou movem projeto (API, aceite de orçamento, importação).
ALTER TABLE projetos ADD COLUMN etapa_desde TEXT;
UPDATE projetos SET etapa_desde = substr(atualizado_em, 1, 10);

CREATE TRIGGER projetos_etapa_desde_ao_criar AFTER INSERT ON projetos
WHEN NEW.etapa_desde IS NULL
BEGIN
  UPDATE projetos SET etapa_desde = date('now', 'localtime') WHERE id = NEW.id;
END;

CREATE TRIGGER projetos_etapa_desde_ao_mover AFTER UPDATE OF etapa ON projetos
WHEN NEW.etapa IS NOT OLD.etapa
BEGIN
  UPDATE projetos SET etapa_desde = date('now', 'localtime') WHERE id = NEW.id;
END;
