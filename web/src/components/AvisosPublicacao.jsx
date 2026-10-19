import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Faixa de posts agendados que não saíram e de publicações que falharam; some quando não há nada a avisar.
export function AvisosPublicacao({ onAbrir, onMudou }) {
  const avisos = useCarregar(() => api('/conteudos/avisos'), []);
  const { erro, enviando, executar } = useEnvio();

  const atrasados = avisos.dados?.atrasados ?? [];
  const falhas = avisos.dados?.falhas ?? [];
  if (!atrasados.length && !falhas.length && !erro) return null;

  function agir(chamada) {
    executar(async () => {
      try {
        await chamada();
      } finally {
        avisos.recarregar();
        onMudou?.();
      }
    });
  }
  const publicar = (c) => agir(() => api(`/conteudos/${c.id}/publicar`, { method: 'POST' }));
  const voltar = (c) => agir(() => api(`/conteudos/${c.id}/agendamento`, { method: 'DELETE' }));

  return (
    <div className="avisos-publicacao">
      {atrasados.length > 0 && (
        <section className="aviso aviso--erro" aria-label="Posts atrasados">
          <p>
            <strong>
              {atrasados.length === 1
                ? '1 post agendado não saiu no horário'
                : `${atrasados.length} posts agendados não saíram no horário`}
            </strong>
          </p>
          <ul className="lista">
            {atrasados.map((c) => (
              <li key={c.id}>
                <span>
                  <span>{c.titulo}</span>
                  {c.agendado_para && <span className="vazio"> · marcado para {dataHora(c.agendado_para)}</span>}
                </span>
                <span className="form--linha">
                  <button type="button" className="btn btn--primario" disabled={enviando} onClick={() => publicar(c)}>Publicar agora</button>
                  {onAbrir
                    ? <button type="button" className="btn" onClick={() => onAbrir(c)}>Reagendar</button>
                    : <Link className="btn" to={`/conteudo?abrir=${c.id}`}>Reagendar</Link>}
                  <button type="button" className="btn" disabled={enviando} onClick={() => voltar(c)}>Voltar para rascunho</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {falhas.length > 0 && (
        <section className="aviso aviso--erro" aria-label="Publicações com falha">
          <p>
            <strong>{falhas.length === 1 ? '1 publicação falhou' : `${falhas.length} publicações falharam`}</strong>
          </p>
          <ul className="lista">
            {falhas.map((c) => (
              <li key={c.id}>
                <span>
                  <span>{c.titulo}</span>
                  {c.publicacao_erro && <> · <span className="vazio">{c.publicacao_erro}</span></>}
                </span>
                <button type="button" className="btn" disabled={enviando} onClick={() => publicar(c)}>Tentar de novo</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {erro && <p className="aviso aviso--erro" role="alert">{erro.erros?.[0]?.mensagem ?? erro.message}</p>}
    </div>
  );
}
