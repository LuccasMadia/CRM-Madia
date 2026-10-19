import { useState } from 'react';
import { Confirmacao } from './Confirmacao.jsx';

// Botões da cobrança de um site (Avisei / Tirar do ar / Colocar no ar) e as confirmações de corte.
// Usado na aba Hospedagem e nos avisos do Início; `children` entram na mesma linha de botões.
export function AcoesCobranca({ titulo, url, fase, podeTirar, podeColocar, enviando, onAvisei, onPausar, onReligar, children }) {
  const [confirmar, setConfirmar] = useState(null); // 'pausar' | 'religar'
  const fechar = () => setConfirmar(null);

  return (
    <>
      <div className="form--linha">
        {fase === 'atrasada' && <button type="button" className="btn" disabled={enviando} onClick={onAvisei}>Avisei o cliente</button>}
        {podeTirar && <button type="button" className="btn btn--perigo" onClick={() => setConfirmar('pausar')}>Tirar do ar</button>}
        {podeColocar && <button type="button" className="btn btn--primario" onClick={() => setConfirmar('religar')}>Colocar no ar</button>}
        {children}
      </div>
      {confirmar === 'pausar' && (
        <Confirmacao
          titulo={`Tirar ${titulo} do ar?`}
          mensagem={`O site ${url} vai ficar fora do ar até você colocar de novo.`}
          rotuloConfirmar="Tirar do ar"
          onConfirmar={onPausar}
          onFechar={fechar}
        />
      )}
      {confirmar === 'religar' && (
        <Confirmacao
          titulo={`Colocar ${titulo} no ar?`}
          mensagem={`O site ${url} volta a ficar disponível para o público.`}
          rotuloConfirmar="Colocar no ar"
          onConfirmar={onReligar}
          onFechar={fechar}
        />
      )}
    </>
  );
}
