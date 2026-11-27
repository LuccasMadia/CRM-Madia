-- Eventos do calendário. inicio/fim: AAAA-MM-DD (dia inteiro; fim é o último dia, inclusive) ou AAAA-MM-DDTHH:MM (horário de São Paulo).
-- uid é a identidade do evento (a mesma no iCloud); href/etag vêm do CalDAV; origem: 'crm' ou 'apple'.
CREATE TABLE eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT,
  dia_inteiro INTEGER NOT NULL DEFAULT 0 CHECK (dia_inteiro IN (0, 1)),
  local TEXT,
  notas TEXT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  uid TEXT NOT NULL UNIQUE,
  href TEXT,
  etag TEXT,
  origem TEXT NOT NULL DEFAULT 'crm' CHECK (origem IN ('crm', 'apple')),
  recorrente INTEGER NOT NULL DEFAULT 0 CHECK (recorrente IN (0, 1)),
  pendente INTEGER NOT NULL DEFAULT 0 CHECK (pendente IN (0, 1)),
  apagado INTEGER NOT NULL DEFAULT 0 CHECK (apagado IN (0, 1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX eventos_inicio ON eventos(inicio);
