import { api } from '../api/client.js';
import { notificar } from '../lib/notificacoes.js';
import { useEnvio } from './useEnvio.js';
import { useConfirmacao } from './useConfirmacao.jsx';

// Ações de um Google Meu Negócio: as mesmas no perfil do cliente e na lista de Serviços.
// Cada ação recebe o projeto, então a lista usa um só hook (os diálogos não podem ficar dentro da <tr>).
// Renderize {dialogo} (confirmação de excluir) e mostre envio.erro.
export function useAcoesGmn(onMudou) {
  const envio = useEnvio();
  const [confirmar, dialogo] = useConfirmacao();

  function marcarConfigurado(projeto) {
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { etapa: 'entregue' } });
      onMudou();
    });
  }

  function excluir(projeto) {
    confirmar({
      titulo: 'Excluir Google Meu Negócio?',
      mensagem: 'As parcelas dele também serão excluídas.',
      onConfirmar: async () => {
        await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
        notificar('Google Meu Negócio excluído');
        onMudou();
      },
    });
  }

  // se o PUT falhar, o FormGmn mostra o erro e o modal continua aberto
  async function salvar(projeto, corpo, fechar) {
    await api(`/projetos/${projeto.id}`, { method: 'PUT', body: corpo });
    fechar();
    onMudou();
    notificar('Google Meu Negócio salvo');
  }

  async function criar(corpo, fechar) {
    await api('/projetos', { method: 'POST', body: corpo });
    fechar();
    onMudou();
    notificar('Google Meu Negócio criado');
  }

  return { envio, dialogo, marcarConfigurado, excluir, salvar, criar };
}
