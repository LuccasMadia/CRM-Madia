import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';

export function ConexaoVercel() {
  const carregado = useCarregar(() => api('/vercel/estado'), []);
  const [estado, setEstado] = useState(null);
  const [token, setToken] = useState('');
  const [dias, setDias] = useState(null);
  const [prazoSalvo, setPrazoSalvo] = useState(false);
  const { erros, erro, enviando, executar } = useEnvio();
  const prazo = useEnvio();
  const atual = estado ?? carregado.dados;

  function conectar(e) {
    e.preventDefault();
    executar(async () => {
      setEstado(await api('/vercel/conexao', { method: 'PUT', body: { token } }));
      setToken('');
    });
  }

  function desconectar() {
    executar(async () => {
      await api('/vercel/conexao', { method: 'DELETE' });
      setEstado({ ...atual, conectado: false });
    });
  }

  function salvarPrazo(e) {
    e.preventDefault();
    setPrazoSalvo(false);
    prazo.executar(async () => {
      setEstado(await api('/vercel/prazo', { method: 'PUT', body: { dias: Number(dias ?? atual.prazo_dias) } }));
      setDias(null);
      setPrazoSalvo(true);
    });
  }

  return (
    <section className="cartao">
      <h2>Vercel</h2>
      <Aviso erro={carregado.erro} />
      {atual?.conectado && (
        <div className="form--linha">
          <p>Conectado</p>
          <button type="button" className="btn" disabled={enviando} onClick={desconectar}>Desconectar</button>
        </div>
      )}
      {atual && !atual.conectado && (
        <form className="form" onSubmit={conectar} noValidate>
          <Campo
            rotulo="Token da Vercel"
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
      {atual && (
        <form className="form" onSubmit={salvarPrazo} noValidate>
          <Campo
            rotulo="Dias entre avisar o cliente e tirar do ar"
            nome="dias"
            erros={prazo.erros}
            type="number"
            min="1"
            max="60"
            value={dias ?? atual.prazo_dias}
            onChange={(e) => setDias(e.target.value)}
          />
          {!prazo.erros.length && <Aviso erro={prazo.erro} />}
          {prazoSalvo && <p className="aviso aviso--ok" role="status">Prazo salvo.</p>}
          <div><button className="btn btn--primario" disabled={prazo.enviando}>Salvar</button></div>
        </form>
      )}
      <details>
        <summary>Como gerar o token</summary>
        <ol>
          <li>Entre em vercel.com e abra Account Settings → Tokens.</li>
          <li>Clique em Create, dê um nome (por exemplo, CRM) e escolha o escopo no time <code>luccasmadia07-5360's projects</code>.</li>
          <li>Copie o token, cole aqui e clique em Conectar. Ele fica guardado só neste computador.</li>
        </ol>
      </details>
    </section>
  );
}
