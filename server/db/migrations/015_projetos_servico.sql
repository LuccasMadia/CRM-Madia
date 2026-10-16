ALTER TABLE projetos ADD COLUMN servico TEXT NOT NULL DEFAULT 'site_sistema'
  CHECK (servico IN ('site_sistema', 'google_meu_negocio', 'placas_nfc'));
ALTER TABLE projetos ADD COLUMN link_perfil TEXT;
CREATE INDEX idx_projetos_servico ON projetos(servico);

CREATE TABLE projetos_qrcodes (
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  qrcode_id INTEGER NOT NULL REFERENCES qrcodes(id) ON DELETE CASCADE,
  PRIMARY KEY (projeto_id, qrcode_id)
);
