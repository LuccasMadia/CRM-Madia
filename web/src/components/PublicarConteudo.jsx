import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { isoParaLocal, localParaIso } from '../lib/datas.js';

const INTERVALO_CONSULTA_MS = 5000;
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Prévia + ações de publicação de um conteúdo já salvo; cada mudança devolve o conteúdo atualizado em `onMudou`.
export function PublicarConteudo({ conteudo, onMudou }) {
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const [horario, setHorario] = useState(conteudo.agendado_para ? isoParaLocal(conteudo.agendado_para) : '');
  const [reagendando, setReagendando] = useState(false);
  const { id, estado } = conteudo;
  const base = `/conteudos/${id}`;
  const onMudouRef = useRef(onMudou);
  onMudouRef.current = onMudou;

  useEffect(() => {
    if (estado !== 'publicando') return undefined;
    const timer = setInterval(async () => {
      try {
        const novo = await api(base);
        if (novo.estado !== 'publicando') onMudouRef.current(novo);
      } catch {
        // falha de rede passageira: tenta de novo no próximo ciclo
      }
    }, INTERVALO_CONSULTA_MS);
    return () => clearInterval(timer);
  }, [estado, base]);

  const mudar = (chamada) =>
    executar(async () => {
      onMudou(await chamada());
      setReagendando(false);
    });

  const publicar = () => mudar(() => api(`${base}/publicar`, { method: 'POST' }));
  const cancelar = () => mudar(() => api(`${base}/agendamento`, { method: 'DELETE' }));
  function agendar() {
    if (!horario) {
      setErros([{ campo: 'agendado_para', mensagem: 'Escolha data e hora.' }]);
      return;
    }
    mudar(() => api(`${base}/agendar`, { method: 'POST', body: { agendado_para: localParaIso(horario) } }));
  }

  const mensagem = erro && !erros.some((e) => e.campo === 'agendado_para')
    ? { message: erros.find((e) => e.campo === 'publicacao')?.mensagem ?? erro.message }
    : null;
  const podePublicar = ['rascunho', 'pronto', 'falhou', 'atrasado'].includes(estado);
  const mostraAgendar = podePublicar || (estado === 'agendado' && reagendando);

  return (
    <section className="publicar" aria-label="Publicação">
      <h3>Publicação</h3>
      <div className="publicar__previa">
        {conteudo.capa_url && <img src={conteudo.capa_url} alt="Capa" />}
        {conteudo.legenda && <p>{conteudo.legenda}</p>}
      </div>

      {estado === 'falhou' && conteudo.publicacao_erro && <p className="aviso aviso--erro" role="alert">{conteudo.publicacao_erro}</p>}
      {estado === 'atrasado' && <p className="kanban__meta">Passou do horário agendado ({dataHora(conteudo.agendado_para)}) e não foi publicado.</p>}
      {estado === 'agendado' && <p>Agendado para {dataHora(conteudo.agendado_para)}</p>}
      {estado === 'publicando' && <p role="status">Publicando…</p>}
      {estado === 'publicado' && (conteudo.permalink
        ? <a href={conteudo.permalink} target="_blank" rel="noreferrer">Abrir no Instagram</a>
        : <p className="kanban__meta">Publicado — aparece no grid após a próxima atualização.</p>)}

      <Aviso erro={mensagem} />

      {mostraAgendar && (
        <Campo rotulo="Agendar para" nome="agendado_para" erros={erros} type="datetime-local" value={horario} onChange={(e) => setHorario(e.target.value)} />
      )}
      <div className="form--linha">
        {podePublicar && (
          <button type="button" className="btn btn--primario" disabled={enviando} onClick={publicar}>
            {estado === 'falhou' ? 'Tentar de novo' : 'Publicar agora no Instagram'}
          </button>
        )}
        {mostraAgendar && <button type="button" className="btn" disabled={enviando} onClick={agendar}>{estado === 'agendado' ? 'Confirmar novo horário' : 'Agendar'}</button>}
        {estado === 'agendado' && !reagendando && (
          <button type="button" className="btn" disabled={enviando} onClick={() => setReagendando(true)}>Reagendar</button>
        )}
        {estado === 'agendado' && <button type="button" className="btn btn--fantasma" disabled={enviando} onClick={cancelar}>Cancelar agendamento</button>}
      </div>
    </section>
  );
}
