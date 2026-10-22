import { useState } from 'react';
import { Confirmacao } from '../components/Confirmacao.jsx';

// const [confirmar, dialogo] = useConfirmacao();
// confirmar({ titulo, mensagem, rotuloConfirmar, onConfirmar }) abre o diálogo; renderize {dialogo} na tela.
// Se onConfirmar falhar, o erro aparece dentro do diálogo, que continua aberto.
export function useConfirmacao() {
  const [pedido, setPedido] = useState(null);
  const dialogo = pedido && <Confirmacao rotuloConfirmar="Excluir" {...pedido} onFechar={() => setPedido(null)} />;
  return [setPedido, dialogo];
}
