import { api } from '../api/client.js';

// Salva o planejado e, em seguida, a arte (upload separado, multipart).
// `aoCriar` recebe o planejado novo antes do upload: se a arte falhar, quem
// chamou passa a editar esse registro e salvar de novo não cria um duplicado.
export async function salvarConteudo(id, dados, { arte = null, removerArte = false } = {}, { aoCriar } = {}) {
  const salvo = id
    ? await api(`/conteudos/${id}`, { method: 'PUT', body: dados })
    : await api('/conteudos', { method: 'POST', body: dados });
  if (!id) aoCriar?.(salvo);
  const alvo = id ?? salvo.id;
  if (arte) {
    const corpo = new FormData();
    corpo.append('arte', arte);
    return api(`/conteudos/${alvo}/arte`, { method: 'POST', body: corpo });
  }
  if (removerArte) return api(`/conteudos/${alvo}/arte`, { method: 'DELETE' });
  return salvo;
}
