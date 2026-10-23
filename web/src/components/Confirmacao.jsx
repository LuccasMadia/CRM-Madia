import { Modal } from './Modal.jsx';
import { Aviso } from './Aviso.jsx';
import { useEnvio } from '../hooks/useEnvio.js';

// detalhe: conteúdo extra abaixo da mensagem (listas, links). alternativa: { rotulo, onEscolher }, um segundo
// caminho que também fecha o diálogo (ex.: "manter e só mudar a situação").
export function Confirmacao({ titulo, mensagem, detalhe, alternativa, rotuloConfirmar, rotuloVoltar = 'Cancelar', onConfirmar, onFechar }) {
  const { erro, enviando, executar } = useEnvio();

  async function rodar(acao) {
    let ok = false;
    await executar(async () => {
      await acao();
      ok = true;
    });
    if (ok) onFechar();
  }

  return (
    <Modal titulo={titulo} onFechar={enviando ? () => {} : onFechar}>
      <p>{mensagem}</p>
      {detalhe}
      <Aviso erro={erro} />
      <div className="form--linha">
        {onConfirmar && <button type="button" className="btn btn--perigo" disabled={enviando} onClick={() => rodar(onConfirmar)}>{rotuloConfirmar}</button>}
        {alternativa && <button type="button" className="btn" disabled={enviando} onClick={() => rodar(alternativa.onEscolher)}>{alternativa.rotulo}</button>}
        <button type="button" className="btn" disabled={enviando} onClick={onFechar}>{rotuloVoltar}</button>
      </div>
    </Modal>
  );
}
