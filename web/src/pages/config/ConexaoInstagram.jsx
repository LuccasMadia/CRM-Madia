import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarData } from '../../lib/datas.js';

export function ConexaoInstagram() {
  const carregado = useCarregar(() => api('/instagram/estado'), []);
  const [estado, setEstado] = useState(null);
  const [token, setToken] = useState('');
  const [trocando, setTrocando] = useState(false);
  const { erros, erro, enviando, executar } = useEnvio();
  const atual = estado ?? carregado.dados;

  function conectar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/instagram/conexao', { method: 'PUT', body: { token } }));
      setToken('');
      setTrocando(false);
    });
  }

  function desconectar() {
    executar(async () => {
      await api('/instagram/conexao', { method: 'DELETE' });
      setEstado({ conectado: false, usuario: null, expira_em: null });
    });
  }

  return (
    <section className="cartao">
      <h2>Instagram</h2>
      <Aviso erro={carregado.erro} />
      {atual?.conectado && (
        <div className="form--linha">
          <p>
            Conectado como @{atual.usuario} · o acesso renova sozinho
            {atual.expira_em ? ` (vence em ${formatarData(atual.expira_em.slice(0, 10))})` : ''}
          </p>
          {!trocando && !atual.ultimo_erro && (
            <button type="button" className="btn" onClick={() => setTrocando(true)}>Colar novo token</button>
          )}
          <button type="button" className="btn" disabled={enviando} onClick={desconectar}>Desconectar</button>
        </div>
      )}
      {atual?.conectado && atual.ultimo_erro && <p className="aviso aviso--erro" role="alert">{atual.ultimo_erro}</p>}
      {atual && (!atual.conectado || atual.ultimo_erro || trocando) && (
        <form className="form" onSubmit={conectar} noValidate>
          <Campo
            rotulo="Token de acesso"
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
          <li>Em developers.facebook.com, crie um app do tipo “Empresa” e adicione o produto <strong>Instagram</strong> → “API com login do Instagram”.</li>
          <li>Em “Funções do app → Testadores do Instagram”, adicione sua conta e aceite o convite no Instagram (Configurações → Apps e sites).</li>
          <li>Na configuração da API, em “Permissões”, confirme que estão incluídas <code>instagram_business_basic</code> e <code>instagram_business_content_publish</code> (a segunda é a que permite publicar pelo CRM).</li>
          <li>Em “Gerar tokens de acesso”, clique em “Adicionar conta”, entre com o Instagram, autorize a publicação quando ele pedir e copie o token.</li>
          <li>Cole o token aqui e clique em Conectar. O CRM renova o acesso sozinho antes de vencer.</li>
        </ol>
      </details>
    </section>
  );
}
