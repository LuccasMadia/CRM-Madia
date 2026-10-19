-- sem-chaves-estrangeiras
-- Etapas novas do funil de sites: ideia → protótipo → apresentado → valor definido → teste → versão final (andamento) → entregue.
-- O CHECK só muda recriando a tabela; GMN e placas continuam em andamento/entregue.

CREATE TABLE projetos_novo (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  etapa TEXT NOT NULL DEFAULT 'ideia'
    CHECK (etapa IN ('ideia', 'prototipo', 'apresentado', 'valor_definido', 'teste', 'andamento', 'entregue', 'perdido')),
  valor_total_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_total_centavos >= 0),
  data_inicio TEXT,
  prazo_entrega TEXT,
  data_entrega TEXT,
  notas TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  mensalidade_ativa INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_ativa IN (0, 1)),
  mensalidade_valor_centavos INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_valor_centavos >= 0),
  mensalidade_dia_vencimento INTEGER CHECK (mensalidade_dia_vencimento IS NULL OR (mensalidade_dia_vencimento BETWEEN 1 AND 31)),
  postou_instagram INTEGER NOT NULL DEFAULT 0 CHECK (postou_instagram IN (0, 1)),
  ficticio INTEGER NOT NULL DEFAULT 0 CHECK (ficticio IN (0, 1)),
  desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
  servico TEXT NOT NULL DEFAULT 'site_sistema'
    CHECK (servico IN ('site_sistema', 'google_meu_negocio', 'placas_nfc')),
  link_perfil TEXT,
  nicho_id INTEGER REFERENCES nichos(id),
  mensalidade_inicio_modo TEXT NOT NULL DEFAULT 'entrega'
    CHECK (mensalidade_inicio_modo IN ('desenvolvimento', 'entrega', 'data')),
  mensalidade_inicio_data TEXT,
  prototipo_pronto INTEGER NOT NULL DEFAULT 0 CHECK (prototipo_pronto IN (0, 1)),
  teste_inicio TEXT
);

INSERT INTO projetos_novo (
  id, cliente_id, titulo, descricao, etapa, valor_total_centavos, data_inicio, prazo_entrega, data_entrega, notas,
  criado_em, atualizado_em, mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento,
  postou_instagram, ficticio, desconto_centavos, servico, link_perfil, nicho_id, mensalidade_inicio_modo, mensalidade_inicio_data
)
SELECT
  id, cliente_id, titulo, descricao,
  CASE etapa WHEN 'contato' THEN 'ideia' WHEN 'proposta' THEN 'valor_definido' ELSE etapa END,
  valor_total_centavos, data_inicio, prazo_entrega, data_entrega, notas,
  criado_em, atualizado_em, mensalidade_ativa, mensalidade_valor_centavos, mensalidade_dia_vencimento,
  postou_instagram, ficticio, desconto_centavos, servico, link_perfil, nicho_id, mensalidade_inicio_modo, mensalidade_inicio_data
FROM projetos;

DROP TABLE projetos;
ALTER TABLE projetos_novo RENAME TO projetos;

CREATE INDEX idx_projetos_cliente ON projetos(cliente_id);
CREATE INDEX idx_projetos_servico ON projetos(servico);
