import { useState } from 'react';
import { Icone } from '../../components/Icone.jsx';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';

// O CRM só lê o Gmail: mostra na página do cliente as conversas com o e-mail dele. Nada é enviado nem alterado.
export function ConexaoGmail() {
  const carregado = useCarregar(() => api('/gmail'), []);
  const [estado, setEstado] = useState(null);
  const [clientId, setClientId] = useState('');
  const [segredo, setSegredo] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;

  function salvar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/gmail/credenciais', { method: 'PUT', body: { client_id: clientId, client_secret: segredo } }));
      setClientId('');
      setSegredo('');
    });
  }

  function desconectar() {
    executar(async () => setEstado(await api('/gmail/conexao', { method: 'DELETE' })));
  }

  return (
    <section className="cartao">
      <h2 className="conexao__titulo"><Icone nome="gmail" tamanho={22} /> Gmail</h2>
      <Aviso erro={carregado.erro} />
      {atual?.conectado && (
        <div className="form--linha">
          <p>{`Conectado como ${atual.usuario ?? 'sua conta'}`}</p>
          <button type="button" className="btn" disabled={enviando} onClick={desconectar}>Desconectar</button>
        </div>
      )}
      {atual && !atual.conectado && (
        <>
          <form className="form" onSubmit={salvar} noValidate>
            <p>
              O CRM só lê as conversas de e-mail com cada cliente (somente leitura). As credenciais ficam salvas neste
              computador, no banco de dados do CRM, e não vão para o backup.
            </p>
            <Campo rotulo="Client ID" nome="client_id" erros={erros} autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <Campo rotulo="Client Secret" nome="client_secret" erros={erros} type="password" autoComplete="off" value={segredo} onChange={(e) => setSegredo(e.target.value)} />
            <div className="form--linha">
              <button className="btn" disabled={enviando || !clientId.trim() || !segredo.trim()}>Salvar</button>
              {atual.configurado && <a className="btn btn--primario" href={`/api/gmail/autorizar?retorno=${encodeURIComponent(window.location.origin)}`}>Conectar com o Google</a>}
            </div>
          </form>
        </>
      )}
      {!erros.length && <Aviso erro={erro} />}
      <details>
        <summary>Como conectar</summary>
        <ol>
          <li>Abra console.cloud.google.com e crie um projeto novo (por exemplo, CRM).</li>
          <li>Em APIs e serviços → Biblioteca, procure por Gmail API e clique em Ativar.</li>
          <li>Em Tela de consentimento OAuth, escolha o tipo Externo, preencha o nome do app e o seu e-mail e adicione o seu e-mail como usuário.</li>
          <li>
            Ainda na tela de consentimento, clique em Publicar app para o status ficar <strong>Em produção</strong>. No modo Teste o
            Google derruba a conexão depois de 7 dias.
          </li>
          <li>
            Em Credenciais → Criar credenciais → ID do cliente OAuth, escolha App da Web e, em URIs de redirecionamento autorizados, coloque:{' '}
            <code>http://127.0.0.1:5174/api/gmail/callback</code>
          </li>
          <li>Copie o Client ID e o Client Secret, cole aqui, clique em Salvar e depois em Conectar com o Google.</li>
        </ol>
      </details>
    </section>
  );
}
