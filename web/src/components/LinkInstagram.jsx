import { arroba } from '../lib/instagram.js';

export function LinkInstagram({ instagram }) {
  const perfil = arroba(instagram);
  if (!perfil) return '—';
  return <a href={`https://www.instagram.com/${perfil.slice(1)}/`} target="_blank" rel="noreferrer">{perfil}</a>;
}
