// Instagram sempre como "@perfil": "@" sozinho vira vazio e arrobas repetidos
// (ex.: colou "@perfil" depois do "@" que o campo já traz) viram um só.
export function arroba(instagram) {
  const perfil = (instagram ?? '').trim().replace(/^@+/, '');
  return perfil ? `@${perfil}` : '';
}
