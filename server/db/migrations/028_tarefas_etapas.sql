-- Tarefas viram um quadro com 4 colunas. "concluida" continua existindo e
-- acompanha a etapa (concluido = 1), para o painel e os contadores seguirem iguais.
ALTER TABLE tarefas ADD COLUMN etapa TEXT NOT NULL DEFAULT 'a_fazer'
  CHECK (etapa IN ('a_fazer', 'fazendo', 'aguardando_cliente', 'concluido'));
UPDATE tarefas SET etapa = 'concluido' WHERE concluida = 1;
