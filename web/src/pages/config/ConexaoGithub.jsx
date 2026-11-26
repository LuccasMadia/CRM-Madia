import { useState } from 'react';
import { Icone } from '../../components/Icone.jsx';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';

// O CRM só cria repositórios privados e nunca muda visibilidade; o resto é leitura.
export function ConexaoGithub() {
  const carregado = useCarregar(() => api('/github'), []);
  const [estado, setEstado] = useState(null);
  const [token, setToken] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;

  function conectar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/github/conexao', { method: 'PUT', body: { token } }));
      setToken('');
    });
  }

  function desconectar() {
    executar(async () => setEstado(await api('/github/conexao', { method: 'DELETE' })));
  }

  return (
    <section className="cartao">
      <h2 className="conexao__titulo"><Icone nome="github" tamanho={22} /> GitHub</h2>
      <Aviso erro={carregado.erro} />
      {atual?.conectado && (
        <div className="form--linha">
          <p>{`Conectado como ${atual.usuario ?? 'sua conta'}`}</p>
          <button type="button" className="btn" disabled={enviando} onClick={desconectar}>Desconectar</button>
        </div>
      )}
      {atual && !atual.conectado && (
        <form className="form" onSubmit={conectar} noValidate>
          <p>
            O token dá acesso aos seus repositórios privados. Crie um token só para o CRM e guarde-o em segurança:
            ele fica salvo neste computador, no banco de dados do CRM, e não vai para o backup.
          </p>
          <Campo
            rotulo="Token do GitHub"
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
          <li>Entre em github.com e abra Settings → Developer settings → Personal access tokens → Tokens (classic).</li>
          <li>Generate new token (classic), dê um nome (por exemplo, CRM) e marque só o acesso <code>repo</code>. Token fine-grained não consegue criar repositórios na conta pessoal.</li>
          <li>Copie o token, cole aqui e clique em Conectar.</li>
        </ol>
      </details>
    </section>
  );
}
