import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Icone } from '../../components/Icone.jsx';
import { notificar } from '../../lib/notificacoes.js';

// Google e Apple Agenda assinam o mesmo link (ICS). Só o CRM escreve; a agenda apenas mostra.
export function ConexaoAgenda() {
  const carregado = useCarregar(() => api('/agenda'), []);
  const [estado, setEstado] = useState(null);
  const { erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;

  const ligar = () => executar(async () => setEstado(await api('/agenda', { method: 'POST' })));
  const desligar = () => executar(async () => setEstado(await api('/agenda', { method: 'DELETE' })));
  async function copiar() {
    try {
      await navigator.clipboard.writeText(atual.url);
      notificar('Link da agenda copiado.');
    } catch {
      notificar('Não consegui copiar; selecione o link e copie à mão.');
    }
  }

  const webcal = atual?.url?.replace(/^https:/, 'webcal:');
  const google = atual?.url && `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  return (
    <section className="cartao">
      <h2 className="conexao__titulo"><Icone nome="calendario" tamanho={22} /> Google e Apple Agenda</h2>
      <Aviso erro={carregado.erro} />
      <Aviso erro={erro} />
      {!atual?.ativo ? (
        <>
          <p>Mostra na sua agenda os prazos das tarefas abertas e os vencimentos das parcelas a receber. É só visualização: o que muda no CRM aparece lá.</p>
          <button type="button" className="btn btn--primario" disabled={enviando || !atual} onClick={ligar}>Gerar link da agenda</button>
        </>
      ) : (
        <>
          <p>Link privado da sua agenda. Quem tiver o link vê seus prazos e vencimentos, então não compartilhe.</p>
          <input className="agenda__link" readOnly aria-label="Link da agenda" value={atual.url} onFocus={(e) => e.target.select()} />
          <div className="form--linha">
            <a className="btn btn--primario" href={google} target="_blank" rel="noreferrer">Adicionar ao Google Agenda</a>
            <a className="btn btn--primario" href={webcal}>Adicionar ao Apple Agenda</a>
            <button type="button" className="btn" onClick={copiar}>Copiar link</button>
            <button type="button" className="btn" disabled={enviando} onClick={ligar}>Gerar novo link</button>
            <button type="button" className="btn btn--perigo" disabled={enviando} onClick={desligar}>Desligar</button>
          </div>
          <p className="form__ajuda">O Google atualiza o que veio do link a cada 12–24 horas; o Apple, bem mais rápido. Gerar novo link ou desligar faz o antigo parar de funcionar.</p>
        </>
      )}
    </section>
  );
}
