import { useState } from 'react';
import { Icone } from '../../components/Icone.jsx';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { ValidadeToken } from './ValidadeToken.jsx';

// O CRM só lê o Supabase: nome, região e se o projeto está no ar ou pausado. Um token por conta.
export function ConexaoSupabase() {
  const carregado = useCarregar(() => api('/supabase'), []);
  const [estado, setEstado] = useState(null);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;

  function adicionar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/supabase/contas', { method: 'POST', body: { email, token } }));
      setEmail('');
      setToken('');
    });
  }

  const remover = (conta) => executar(async () => setEstado(await api(`/supabase/contas/${conta.id}`, { method: 'DELETE' })));

  return (
    <section className="cartao">
      <h2 className="conexao__titulo"><Icone nome="supabase" tamanho={22} /> Supabase</h2>
      <Aviso erro={carregado.erro} />
      {atual?.contas?.length > 0 && (
        <ul className="contas">
          {atual.contas.map((conta) => (
            <li key={conta.id}>
              <div className="form--linha">
                <span>{conta.email}</span>
                <button type="button" className="btn" aria-label={`Remover ${conta.email}`} disabled={enviando} onClick={() => remover(conta)}>Remover</button>
              </div>
              <ValidadeToken servico="supabase" contaId={conta.id} />
            </li>
          ))}
        </ul>
      )}
      {atual && (
        <form className="form" onSubmit={adicionar} noValidate>
          <p>
            O plano gratuito do Supabase limita os projetos por conta, então adicione uma conta para cada token. O CRM só lê a
            lista dos projetos (nome, região e se estão no ar ou pausados) e nunca mexe nos dados. Os tokens ficam salvos neste
            computador, no banco de dados do CRM, e não vão para o backup.
          </p>
          <Campo rotulo="E-mail da conta" nome="email" type="email" erros={erros} value={email} onChange={(e) => setEmail(e.target.value)} />
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
            <button className="btn btn--primario" disabled={enviando || !email.trim() || !token.trim()}>Adicionar conta</button>
          </div>
        </form>
      )}
      {!erros.length && <Aviso erro={erro} />}
      <details>
        <summary>Como gerar o token</summary>
        <ol>
          <li>Entre na conta do Supabase e abra supabase.com/dashboard/account/tokens.</li>
          <li>Clique em Generate new token e dê um nome (por exemplo, CRM).</li>
          <li>Copie o token (começa com <code>sbp_</code>), digite aqui o e-mail dessa conta, cole o token e clique em Adicionar conta.</li>
          <li>Repita com cada uma das suas contas do Supabase: um token por conta.</li>
        </ol>
      </details>
    </section>
  );
}
