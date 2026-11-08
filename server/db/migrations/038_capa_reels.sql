-- Capa do Reels: momento do vídeo (em milissegundos) escolhido como capa. Vazio = o Instagram usa o início do vídeo.
ALTER TABLE conteudos ADD COLUMN capa_ms INTEGER CHECK (capa_ms IS NULL OR capa_ms >= 0);
