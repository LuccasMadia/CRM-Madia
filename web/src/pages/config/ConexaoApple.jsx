import { useState } from 'react';
import { Icone } from '../../components/Icone.jsx';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Calendário de eventos do CRM ligado ao app Calendário do iPhone (iCloud, CalDAV), de ida e volta.
export function ConexaoApple() {
  const carregado = useCarregar(() => api('/calendario'), []);
  const [estado, setEstado] = useState(null);
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [href, setHref] = useState('');
  const [trocando, setTrocando] = useState(false);
  const [resumo, setResumo] = useState(null);
  const { erros, erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;
  const escolhendo = Boolean(atual?.conectado && (!atual.calendario || trocando));
  const calendarios = useCarregar(() => (escolhendo ? api('/calendario/calendarios') : Promise.resolve([])), [escolhendo]);
  const lista = calendarios.dados ?? [];
  const escolhido = href || lista[0]?.href || '';

  function conectar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/calendario/conexao', { method: 'PUT', body: { usuario, senha } }));
      setSenha('');
    });
  }

  const escolher = (corpo) => executar(async () => {
    setEstado(await api('/calendario/calendario', { method: 'PUT', body: corpo }));
    setTrocando(false);
    setResumo(null);
  });

  const sincronizar = () => executar(async () => {
    const r = await api('/calendario/sincronizar', { method: 'POST' });
    setResumo(`Sincronizado: ${plural(r.lidos, 'lido', 'lidos')}, ${plural(r.enviados, 'enviado', 'enviados')}, ${plural(r.conflitos, 'conflito', 'conflitos')}.`);
    setEstado(await api('/calendario'));
  });

  const desconectar = () => executar(async () => {
    setEstado(await api('/calendario/conexao', { method: 'DELETE' }));
    setTrocando(false);
    setResumo(null);
  });

  return (
    <section className="cartao">
      <h2 className="conexao__titulo"><Icone nome="calendario" tamanho={22} /> Apple Calendário</h2>
      <Aviso erro={carregado.erro} />
      {atual && !atual.conectado && (
        <form className="form" onSubmit={conectar} noValidate>
          <p>
            Os eventos criados no CRM aparecem no app Calendário do iPhone, e os criados lá aparecem aqui. A senha de app fica salva
            neste computador, no banco de dados do CRM, e não vai para o backup.
          </p>
          <Campo rotulo="Apple ID" nome="usuario" erros={erros} autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          <Campo rotulo="Senha de app" nome="senha" erros={erros} type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <div className="form--linha">
            <button className="btn btn--primario" disabled={enviando || !usuario.trim() || !senha.trim()}>Conectar</button>
          </div>
        </form>
      )}
      {atual?.conectado && (
        <div className="form--linha">
          <p>
            {`Conectado como ${atual.usuario}`}
            {atual.calendario && ` · calendário ${atual.calendario.nome}`}
            {atual.ultima_sync && ` · última sincronização ${quando(atual.ultima_sync)}`}
          </p>
          {atual.calendario && !trocando && <button type="button" className="btn" disabled={enviando} onClick={sincronizar}>Sincronizar agora</button>}
          {atual.calendario && !trocando && <button type="button" className="btn" disabled={enviando} onClick={() => setTrocando(true)}>Trocar calendário</button>}
          <button type="button" className="btn" disabled={enviando} onClick={desconectar}>Desconectar</button>
        </div>
      )}
      {escolhendo && (
        <div className="form">
          <Aviso erro={calendarios.erro} />
          {lista.length > 0 && (
            <Campo rotulo="Calendário" nome="href" erros={erros}>
              <select value={escolhido} onChange={(e) => setHref(e.target.value)}>
                {lista.map((c) => <option key={c.href} value={c.href}>{c.nome}</option>)}
              </select>
            </Campo>
          )}
          {!calendarios.carregando && !calendarios.erro && !lista.length && (
            <p>Nenhum calendário de eventos encontrado nesta conta. Crie o calendário CRM Madia abaixo.</p>
          )}
          <div className="form--linha">
            {lista.length > 0 && <button type="button" className="btn btn--primario" disabled={enviando || !escolhido} onClick={() => escolher({ href: escolhido })}>Usar este calendário</button>}
            <button type="button" className="btn" disabled={enviando} onClick={() => escolher({ criar: 'CRM Madia' })}>Criar o calendário CRM Madia</button>
          </div>
        </div>
      )}
      {resumo && <p>{resumo}</p>}
      {atual?.erro && <p className="aviso aviso--erro" role="alert">Última sincronização falhou: {atual.erro}</p>}
      {!erros.length && <Aviso erro={erro} />}
      <details>
        <summary>Como gerar a senha de app</summary>
        <ol>
          <li>Entre em appleid.apple.com com o seu Apple ID (precisa da verificação em duas etapas ligada).</li>
          <li>Vá em Segurança → Senhas de app e clique em Gerar uma senha de app.</li>
          <li>Dê um nome (por exemplo, CRM) e copie a senha no formato abcd-efgh-ijkl-mnop.</li>
          <li>Cole aqui com o seu Apple ID e clique em Conectar. A senha normal do Apple ID não funciona.</li>
        </ol>
      </details>
    </section>
  );
}
