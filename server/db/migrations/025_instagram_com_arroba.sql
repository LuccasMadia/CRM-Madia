-- Instagram sempre como "@perfil": põe o @ que faltava, junta @ repetidos e limpa o que ficou só "@".
UPDATE clientes SET instagram = NULLIF(LTRIM(TRIM(instagram), '@'), '') WHERE instagram IS NOT NULL;
UPDATE clientes SET instagram = '@' || instagram WHERE instagram IS NOT NULL;
