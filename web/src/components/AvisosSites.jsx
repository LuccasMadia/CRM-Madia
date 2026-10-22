import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from './Aviso.jsx';
import { AcoesCobranca } from './AcoesCobranca.jsx';
import { TextoCobranca } from './TextoCobranca.jsx';
import { dataHoraCurta } from '../lib/hospedagem.js';

// Faixa de sites fora do ar e de mensalidades que pedem ação; some quando não há nada a avisar.
// mostrar: 'fora_do_ar' (Início) ou 'cobrancas' (Financeiro › Mensalidades); sem ele mostra os dois.
export function AvisosSites({ mostrar }) {
  const avisos = useCarregar(() => api('/hospedagem/avisos'), []);
  const estado = useCarregar(() => api('/vercel/estado'), []);
  const { erro, enviando, executar } = useEnvio();

  const foraDoAr = mostrar === 'cobrancas' ? [] : (avisos.dados?.fora_do_ar ?? []);
  const cobrancas = mostrar === 'fora_do_ar' ? [] : (avisos.dados?.cobrancas ?? []);
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
                <AcoesCobranca
                  titulo={c.titulo}
                  url={c.url}
                  fase={c.fase}
                  podeTirar={c.fase === 'prazo_vencido'}
                  podeColocar={c.fase === 'pago_pausado'}
                  enviando={enviando}
                  onAvisei={() => avisei(c)}
                  onPausar={() => postar(c, 'pausar')}
                  onReligar={() => postar(c, 'religar')}
                >
                  <Link className="btn" to={`/projetos/${c.projeto_id}`}>Abrir</Link>
                </AcoesCobranca>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Aviso erro={erro} />
    </div>
  );
}
