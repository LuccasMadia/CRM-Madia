import { Modal } from './Modal.jsx';
import { Aviso } from './Aviso.jsx';
import { useEnvio } from '../hooks/useEnvio.js';

export function Confirmacao({ titulo, mensagem, rotuloConfirmar, rotuloVoltar = 'Cancelar', onConfirmar, onFechar }) {
  const { erro, enviando, executar } = useEnvio();

  async function confirmar() {
    let ok = false;
    await executar(async () => {
      await onConfirmar();
      ok = true;
    });
    if (ok) onFechar();
  }

  return (
    <Modal titulo={titulo} onFechar={enviando ? () => {} : onFechar}>
      <p>{mensagem}</p>
      <Aviso erro={erro} />
      <div className="form--linha">
        <button type="button" className="btn btn--perigo" disabled={enviando} onClick={confirmar}>{rotuloConfirmar}</button>
        <button type="button" className="btn" disabled={enviando} onClick={onFechar}>{rotuloVoltar}</button>
      </div>
    </Modal>
  );
}
