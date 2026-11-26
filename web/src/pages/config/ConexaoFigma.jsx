import { useState } from 'react';
import { Icone } from '../../components/Icone.jsx';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';

// O CRM só lê o Figma: nome do arquivo e data da última edição.
export function ConexaoFigma() {
  const carregado = useCarregar(() => api('/figma'), []);
  const [estado, setEstado] = useState(null);
  const [token, setToken] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;

  function conectar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/figma/conexao', { method: 'PUT', body: { token } }));
      setToken('');
    });
  }

  function desconectar() {
    executar(async () => setEstado(await api('/figma/conexao', { method: 'DELETE' })));
  }

  return (
    <section className="cartao">
      <h2 className="conexao__titulo"><Icone nome="figma" tamanho={22} /> Figma</h2>
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
            O CRM só lê o nome e a data da última edição dos arquivos que você ligar aos projetos. O token fica salvo
            neste computador, no banco de dados do CRM, e não vai para o backup.
          </p>
          <Campo
            rotulo="Token do Figma"
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
          <li>Abra o Figma, clique no seu nome e vá em Settings → Security → Personal access tokens.</li>
          <li>Generate new token, dê um nome (por exemplo, CRM) e marque só os escopos <code>current_user:read</code> e <code>file_content:read</code>.</li>
          <li>Copie o token, cole aqui e clique em Conectar.</li>
        </ol>
      </details>
    </section>
  );
}
