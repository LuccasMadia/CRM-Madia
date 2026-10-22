-- Tarefas internas (sem projeto): testar repositórios, organizar serviços próprios etc.
-- O NOT NULL de projeto_id só sai recriando a tabela; nenhuma outra tabela aponta para tarefas.
CREATE TABLE tarefas_nova (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  prazo TEXT,
  concluida INTEGER NOT NULL DEFAULT 0 CHECK (concluida IN (0, 1)),
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  etapa TEXT NOT NULL DEFAULT 'a_fazer'
    CHECK (etapa IN ('a_fazer', 'fazendo', 'aguardando_cliente', 'concluido'))
);
INSERT INTO tarefas_nova (id, projeto_id, texto, prazo, concluida, ordem, criado_em, atualizado_em, etapa)
  SELECT id, projeto_id, texto, prazo, concluida, ordem, criado_em, atualizado_em, etapa FROM tarefas;
DROP TABLE tarefas;
ALTER TABLE tarefas_nova RENAME TO tarefas;
CREATE INDEX idx_tarefas_projeto ON tarefas(projeto_id);
