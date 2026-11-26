import { useState } from 'react';
import { Icone } from '../../components/Icone.jsx';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';

// O CRM só lê o Supabase: nome, região e se o projeto está no ar ou pausado.
export function ConexaoSupabase() {
  const carregado = useCarregar(() => api('/supabase'), []);
  const [estado, setEstado] = useState(null);
  const [token, setToken] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;

  function conectar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/supabase/conexao', { method: 'PUT', body: { token } }));
      setToken('');
    });
  }

  function desconectar() {
    executar(async () => setEstado(await api('/supabase/conexao', { method: 'DELETE' })));
  }

  return (
    <section className="cartao">
      <h2 className="conexao__titulo"><Icone nome="supabase" tamanho={22} /> Supabase</h2>
      <Aviso erro={carregado.erro} />
      {atual?.conectado && (
        <div className="form--linha">
          <p>Supabase conectado</p>
          <button type="button" className="btn" disabled={enviando} onClick={desconectar}>Desconectar</button>
        </div>
      )}
      {atual && !atual.conectado && (
        <form className="form" onSubmit={conectar} noValidate>
          <p>
            O CRM só lê a lista dos seus projetos (nome, região e se estão no ar ou pausados) e nunca mexe nos dados.
            O token fica salvo neste computador, no banco de dados do CRM, e não vai para o backup.
          </p>
          <Campo
            rotulo="Token do Supabase"
            nome="token"
            erros={erros}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="form--linha">
            <button className="btn btn--primario" disabled={enviando || !token.trim()}>Conectar</button>
          </div>
        </form>
      )}
      {!erros.length && <Aviso erro={erro} />}
      <details>
        <summary>Como gerar o token</summary>
        <ol>
          <li>Entre em supabase.com/dashboard/account/tokens.</li>
          <li>Clique em Generate new token e dê um nome (por exemplo, CRM).</li>
          <li>Copie o token (começa com <code>sbp_</code>), cole aqui e clique em Conectar.</li>
        </ol>
      </details>
    </section>
  );
}
