-- Modelos de tarefas por tipo de serviço: a sequência que se repete em todo site, GMN ou placa.
-- dias_apos_inicio vira o prazo (a partir do início do projeto, ou do dia em que o modelo é aplicado).
CREATE TABLE tarefas_modelos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('site_sistema', 'google_meu_negocio', 'placas_nfc', 'conteudo', 'cobranca', 'comercial', 'interno')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE tarefas_modelos_itens (
  id INTEGER PRIMARY KEY,
  modelo_id INTEGER NOT NULL REFERENCES tarefas_modelos(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  descricao TEXT,
  dias_apos_inicio INTEGER CHECK (dias_apos_inicio >= 0),
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_tarefas_modelos_itens_modelo ON tarefas_modelos_itens(modelo_id);

-- Tarefa de cobrança ligada ao dinheiro: fecha sozinha quando a parcela é paga ou a venda de placa recebida.
-- Apagar a parcela ou a venda só solta a tarefa.
ALTER TABLE tarefas ADD COLUMN parcela_id INTEGER REFERENCES parcelas(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN placa_venda_id INTEGER REFERENCES placas_vendas(id) ON DELETE SET NULL;
CREATE INDEX idx_tarefas_parcela ON tarefas(parcela_id);
CREATE INDEX idx_tarefas_placa_venda ON tarefas(placa_venda_id);

-- Modelos iniciais. O de site é a sequência que a Pingou teve.
INSERT INTO tarefas_modelos (id, nome, tipo, criado_em, atualizado_em) VALUES
  (1, 'Site', 'site_sistema', '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (2, 'Google Meu Negócio', 'google_meu_negocio', '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (3, 'Placas NFC', 'placas_nfc', '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z');

INSERT INTO tarefas_modelos_itens (modelo_id, texto, descricao, dias_apos_inicio, ordem, criado_em, atualizado_em) VALUES
  (1, 'Levantar conteúdo e fotos com o cliente', 'Textos, produtos, preços, logo e fotos que vão no site.', 1, 0, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (1, 'Criar identidade visual (cores e estilo)', NULL, 2, 1, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (1, 'Montar o wireframe', NULL, 3, 2, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (1, 'Desenvolver o site', NULL, 5, 3, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (1, 'Testar no celular', 'Responsividade, links e formulários num celular de verdade.', 6, 4, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (1, 'Publicar e configurar o domínio', NULL, 7, 5, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (1, 'Gravar vídeo de apresentação para o Instagram', NULL, 14, 6, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (2, 'Coletar dados e fotos da empresa', 'Endereço, horários, telefone, serviços e fotos do local.', 1, 0, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (2, 'Criar ou reivindicar o perfil', NULL, 2, 1, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (2, 'Pedir a verificação do Google', NULL, 3, 2, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (2, 'Publicar fotos, horários e serviços', NULL, 5, 3, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (2, 'Mandar ao cliente o link para pedir avaliações', NULL, 7, 4, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (3, 'Confirmar o modelo e o link de destino', 'Para onde a placa leva: Google, Instagram, cardápio ou WhatsApp.', 0, 0, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (3, 'Montar e gravar a placa', NULL, 2, 1, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (3, 'Testar a placa no celular', NULL, 2, 2, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (3, 'Entregar ao cliente', NULL, 4, 3, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z');
