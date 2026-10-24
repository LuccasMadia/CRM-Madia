-- Tarefa completa: de qual empresa é (com ou sem projeto), tipo, prioridade, descrição,
-- desde quando está na etapa atual (para "aguardando cliente há N dias") e quando foi concluída.
-- Com projeto, cliente_id é sempre o cliente do projeto (o servidor e o gatilho abaixo mantêm assim).
ALTER TABLE tarefas ADD COLUMN cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN descricao TEXT;
ALTER TABLE tarefas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'interno'
  CHECK (tipo IN ('site_sistema', 'google_meu_negocio', 'placas_nfc', 'conteudo', 'cobranca', 'comercial', 'interno'));
ALTER TABLE tarefas ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal'
  CHECK (prioridade IN ('urgente', 'alta', 'normal', 'baixa'));
ALTER TABLE tarefas ADD COLUMN etapa_desde TEXT;
ALTER TABLE tarefas ADD COLUMN concluida_em TEXT;

-- Dados antigos: empresa e tipo saem do projeto; as internas ficam "interno". O cliente nunca é
-- adivinhado pelo texto. As datas usam a última alteração, o melhor palpite que existe.
UPDATE tarefas SET
  cliente_id = (SELECT p.cliente_id FROM projetos p WHERE p.id = tarefas.projeto_id),
  tipo = COALESCE((SELECT p.servico FROM projetos p WHERE p.id = tarefas.projeto_id), 'interno'),
  etapa_desde = substr(atualizado_em, 1, 10),
  concluida_em = CASE WHEN etapa = 'concluido' THEN substr(atualizado_em, 1, 10) END;
CREATE INDEX idx_tarefas_cliente ON tarefas(cliente_id);

-- Projeto que muda de cliente leva as tarefas junto.
CREATE TRIGGER tarefas_seguem_cliente_do_projeto AFTER UPDATE OF cliente_id ON projetos
WHEN NEW.cliente_id IS NOT OLD.cliente_id
BEGIN
  UPDATE tarefas SET cliente_id = NEW.cliente_id WHERE projeto_id = NEW.id;
END;

CREATE TABLE tarefas_checklist (
  id INTEGER PRIMARY KEY,
  tarefa_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  feito INTEGER NOT NULL DEFAULT 0 CHECK (feito IN (0, 1)),
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_tarefas_checklist_tarefa ON tarefas_checklist(tarefa_id);

CREATE TABLE tarefas_comentarios (
  id INTEGER PRIMARY KEY,
  tarefa_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX idx_tarefas_comentarios_tarefa ON tarefas_comentarios(tarefa_id);
