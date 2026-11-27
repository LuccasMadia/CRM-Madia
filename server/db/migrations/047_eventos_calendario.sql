-- Cada evento lembra de qual calendário do iCloud veio (ou para qual vai subir). Os já sincronizados eram todos do calendário único escolhido até aqui.
ALTER TABLE eventos ADD COLUMN calendario_href TEXT;
UPDATE eventos SET calendario_href = (SELECT valor FROM config WHERE chave = 'apple_calendario_href') WHERE href IS NOT NULL;
