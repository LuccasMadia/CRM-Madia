-- Tabela de preços por serviço, pacotes e orçamentos em PDF.
CREATE TABLE tabela_servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  frase TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('comum', 'placa', 'gmn_config', 'hospedagem')),
  -- NULL quando o serviço não tem esse tipo de cobrança. Placa e configuração do GMN têm preço em outro lugar.
  valor_unico_centavos INTEGER,
  valor_mensal_centavos INTEGER,
  hospedagem TEXT NOT NULL DEFAULT 'nao_se_aplica' CHECK (hospedagem IN ('obrigatoria', 'opcional', 'nao_se_aplica')),
  ordem INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE tabela_pacotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE tabela_pacotes_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pacote_id INTEGER NOT NULL REFERENCES tabela_pacotes(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES tabela_servicos(id),
  opcional INTEGER NOT NULL DEFAULT 0,
  quantidade INTEGER NOT NULL DEFAULT 1,
  placa_modelo_id INTEGER REFERENCES placas_modelos(id),
  ordem INTEGER NOT NULL
);
CREATE INDEX idx_tabela_pacotes_itens_pacote ON tabela_pacotes_itens(pacote_id, ordem);

-- AUTOINCREMENT: o id é o número do orçamento e um número apagado nunca volta.
CREATE TABLE orcamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  validade_dias INTEGER NOT NULL DEFAULT 15,
  pagamento TEXT NOT NULL DEFAULT 'a combinar',
  prazo TEXT NOT NULL DEFAULT 'a combinar',
  observacao TEXT,
  situacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho', 'enviado', 'aceito', 'recusado')),
  -- NULL = sem desconto.
  desconto_pct INTEGER,
  titulo_pacote TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_orcamentos_cliente ON orcamentos(cliente_id, id);

-- Cada item guarda nome, frase e valores: mudar a tabela depois não muda orçamento antigo.
CREATE TABLE orcamento_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  servico_id INTEGER REFERENCES tabela_servicos(id) ON DELETE SET NULL,
  placa_modelo_id INTEGER REFERENCES placas_modelos(id),
  nome TEXT NOT NULL,
  frase TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_unico_centavos INTEGER,
  valor_mensal_centavos INTEGER,
  ordem INTEGER NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_orcamento_itens_orcamento ON orcamento_itens(orcamento_id, ordem);

INSERT INTO tabela_servicos (nome, frase, tipo, valor_unico_centavos, valor_mensal_centavos, hospedagem, ordem, criado_em, atualizado_em) VALUES
  ('Landing page', 'Uma página com apresentação, serviços e botão de WhatsApp', 'comum', 60000, NULL, 'opcional', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Cardápio / catálogo digital', 'Produtos com foto e preço por categoria, pedido pelo WhatsApp', 'comum', 90000, NULL, 'obrigatoria', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Site institucional (até 5 páginas)', 'Início, sobre, serviços, galeria e contato', 'comum', 120000, NULL, 'opcional', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Sistema de agendamento', 'Cliente escolhe dia e horário; você vê a agenda num painel', 'comum', 150000, NULL, 'obrigatoria', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Loja online', 'Carrinho, pagamento online e controle de pedidos', 'comum', 200000, NULL, 'obrigatoria', 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Configuração do Google Meu Negócio', 'Perfil completo no Google Maps, com fotos, horários e categorias', 'gmn_config', NULL, NULL, 'nao_se_aplica', 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Gestão do Google Meu Negócio', 'Posts e respostas a avaliações todo mês', 'comum', NULL, 15000, 'nao_se_aplica', 6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Placa NFC', 'Encosta o celular e abre a avaliação no Google', 'placa', NULL, NULL, 'nao_se_aplica', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Hospedagem e suporte', 'Site no ar, pequenos ajustes e suporte', 'hospedagem', NULL, 15000, 'nao_se_aplica', 8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO tabela_pacotes (nome, criado_em, atualizado_em)
  VALUES ('Presença Local', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO tabela_pacotes_itens (pacote_id, servico_id, opcional, quantidade, placa_modelo_id, ordem) VALUES
  ((SELECT id FROM tabela_pacotes WHERE nome = 'Presença Local'), (SELECT id FROM tabela_servicos WHERE nome = 'Placa NFC'), 0, 1, NULL, 0),
  ((SELECT id FROM tabela_pacotes WHERE nome = 'Presença Local'), (SELECT id FROM tabela_servicos WHERE nome = 'Configuração do Google Meu Negócio'), 0, 1, NULL, 1),
  ((SELECT id FROM tabela_pacotes WHERE nome = 'Presença Local'), (SELECT id FROM tabela_servicos WHERE nome = 'Gestão do Google Meu Negócio'), 1, 1, NULL, 2);

INSERT OR IGNORE INTO config (chave, valor) VALUES ('orcamento_desconto_combo_pct', '10');
