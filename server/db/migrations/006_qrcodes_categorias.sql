DROP TABLE qrcodes_historico;
DROP TABLE qrcodes;

CREATE TABLE qrcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('avaliacao', 'cardapio')),
  descricao_local TEXT,
  destino_atual TEXT NOT NULL,
  imagem_arquivo TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE qrcodes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qrcode_id INTEGER NOT NULL REFERENCES qrcodes(id),
  destino_anterior TEXT,
  destino_novo TEXT NOT NULL,
  alterado_em TEXT NOT NULL
);
