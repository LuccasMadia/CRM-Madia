import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from './Aviso.jsx';
import { Confirmacao } from './Confirmacao.jsx';
import { TextoCobranca } from './TextoCobranca.jsx';
import { dataHoraCurta } from '../lib/hospedagem.js';

// Faixa de sites fora do ar e de mensalidades que pedem ação; some quando não há nada a avisar.
export function AvisosSites() {
  const avisos = useCarregar(() => api('/hospedagem/avisos'), []);
  const estado = useCarregar(() => api('/vercel/estado'), []);
  const [confirmar, setConfirmar] = useState(null); // { acao: 'pausar' | 'religar', cobranca }
  const { erro, enviando, executar } = useEnvio();

  const foraDoAr = avisos.dados?.fora_do_ar ?? [];
  const cobrancas = avisos.dados?.cobrancas ?? [];
  if (avisos.erro) return <Aviso erro={avisos.erro} />;
  if (!foraDoAr.length && !cobrancas.length && !erro) return null;

  const prazoDias = estado.dados?.prazo_dias ?? 7;
  const postar = async (c, caminho) => {
    try {
      await api(`/projetos/${c.projeto_id}/hospedagem/${caminho}`, { method: 'POST' });
    } finally {
      avisos.recarregar();
    }
  };
  const avisei = (c) => executar(() => postar(c, 'avisei'));

  return (
    <div className="avisos-publicacao">
      {foraDoAr.length > 0 && (
        <section className="aviso aviso--erro" aria-label="Sites fora do ar">
          <ul className="lista">
            {foraDoAr.map((s) => (
              <li key={s.projeto_id}>
                <span>
                  {s.titulo} — fora do ar desde {dataHoraCurta(s.desde)}
                  {s.motivo && <span className="vazio"> ({s.motivo})</span>}
                </span>
                <Link className="btn" to={`/projetos/${s.projeto_id}`}>Abrir</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {cobrancas.length > 0 && (
        <section className="aviso aviso--erro" aria-label="Mensalidades de sites">
          <ul className="lista">
            {cobrancas.map((c) => (
              <li key={c.projeto_id}>
                <span>
                  <strong>{c.titulo}</strong>
                  <TextoCobranca cobranca={c} prazoDias={prazoDias} />
                </span>
                <span className="form--linha">
                  {c.fase === 'atrasada' && (
                    <button type="button" className="btn" disabled={enviando} onClick={() => avisei(c)}>Avisei o cliente</button>
                  )}
                  {c.fase === 'prazo_vencido' && (
                    <button type="button" className="btn btn--perigo" onClick={() => setConfirmar({ acao: 'pausar', cobranca: c })}>Tirar do ar</button>
                  )}
                  {c.fase === 'pago_pausado' && (
                    <button type="button" className="btn btn--primario" onClick={() => setConfirmar({ acao: 'religar', cobranca: c })}>Colocar no ar</button>
                  )}
                  <Link className="btn" to={`/projetos/${c.projeto_id}`}>Abrir</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Aviso erro={erro} />
      {confirmar?.acao === 'pausar' && (
        <Confirmacao
          titulo={`Tirar ${confirmar.cobranca.titulo} do ar?`}
          mensagem={`O site de ${confirmar.cobranca.cliente_nome} vai ficar fora do ar até você colocar de novo.`}
          rotuloConfirmar="Tirar do ar"
          onConfirmar={() => postar(confirmar.cobranca, 'pausar')}
          onFechar={() => setConfirmar(null)}
        />
      )}
      {confirmar?.acao === 'religar' && (
        <Confirmacao
          titulo={`Colocar ${confirmar.cobranca.titulo} no ar?`}
          mensagem={`O site de ${confirmar.cobranca.cliente_nome} volta a ficar disponível para o público.`}
          rotuloConfirmar="Colocar no ar"
          onConfirmar={() => postar(confirmar.cobranca, 'religar')}
          onFechar={() => setConfirmar(null)}
        />
      )}
    </div>
  );
}
