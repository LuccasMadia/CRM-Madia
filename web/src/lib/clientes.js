import { api } from '../api/client.js';

// A foto vai por rota própria, depois dos dados: no cadastro novo o id só existe depois do POST.
export async function salvarFotoCliente(id, { foto = null, removerFoto = false } = {}) {
  if (foto) {
    const corpo = new FormData();
    corpo.append('foto', foto);
    await api(`/clientes/${id}/foto`, { method: 'POST', body: corpo });
  } else if (removerFoto) {
    await api(`/clientes/${id}/foto`, { method: 'DELETE' });
  }
}
