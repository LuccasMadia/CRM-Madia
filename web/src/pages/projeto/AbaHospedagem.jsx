import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { AcoesCobranca } from '../../components/AcoesCobranca.jsx';
import { TextoCobranca } from '../../components/TextoCobranca.jsx';
import { BolinhaStatus, textoStatus, dataHoraCurta } from '../../lib/hospedagem.js';

function FormCadastro({ projetoId, hospedagem, projetosVercel, aoSalvar }) {
  const [tipo, setTipo] = useState(hospedagem?.tipo ?? 'vercel');
  const [url, setUrl] = useState(hospedagem?.url ?? '');
  const [projetoVercel, setProjetoVercel] = useState(hospedagem?.vercel_projeto_id ?? '');
  const { erros, erro, enviando, executar } = useEnvio();
  const lista = projetosVercel.dados ?? [];

  function salvar(e) {
    e.preventDefault();
    executar(async () => {
      const escolhido = lista.find((p) => p.id === projetoVercel);
      const corpo = tipo === 'vercel'
        ? {
          tipo,
          url,
          vercel_projeto_id: projetoVercel || null,
          vercel_projeto_nome: escolhido?.nome ?? (projetoVercel ? hospedagem?.vercel_projeto_nome ?? null : null),
        }
        : { tipo };
      aoSalvar(await api(`/projetos/${projetoId}/hospedagem`, { method: 'PUT', body: corpo }));
    });
  }

  return (
    <form className="form" onSubmit={salvar} noValidate>
      <fieldset className="campo">
        <legend className="campo__rotulo">Onde o site está hospedado</legend>
        <label className="campo--check">
          <input type="radio" name="tipo" checked={tipo === 'vercel'} onChange={() => setTipo('vercel')} /> Vercel
        </label>
        <label className="campo--check">
          <input type="radio" name="tipo" checked={tipo === 'sem_hospedagem'} onChange={() => setTipo('sem_hospedagem')} /> Sem hospedagem (instalado no cliente)
        </label>
      </fieldset>
      {tipo === 'vercel' && (
        <>
          <Campo rotulo="Endereço do site" nome="url" erros={erros} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="meusite.com.br" />
          {projetosVercel.erro ? (
            <p className="form__ajuda">
              {projetosVercel.erro.status === 409
                ? 'Conecte a Vercel em Configurações para escolher o projeto.'
                : projetosVercel.erro.message}
            </p>
          ) : (
            <Campo rotulo="Projeto da Vercel" nome="vercel_projeto_id">
              <select value={projetoVercel} onChange={(e) => setProjetoVercel(e.target.value)}>
                <option value="">— escolha —</option>
                {lista.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Campo>
          )}
        </>
      )}
      {!erros.length && <Aviso erro={erro} />}
      <div><button className="btn btn--primario" disabled={enviando}>Salvar</button></div>
    </form>
  );
}

export function AbaHospedagem({ projeto }) {
  const base = `/projetos/${projeto.id}/hospedagem`;
  const carregado = useCarregar(() => api(base), [projeto.id]);
  const projetosVercel = useCarregar(() => api('/vercel/projetos'), []);
  const estado = useCarregar(() => api('/vercel/estado'), []);
  const [atual, setAtual] = useState(null);
  const acao = useEnvio();

  const dados = atual ?? carregado.dados;
  if (carregado.erro) return <Aviso erro={carregado.erro} />;
  if (!dados) return <p>Carregando…</p>;

  const { hospedagem, pausas, cobranca } = dados;
  const pausado = hospedagem?.status === 'pausado';
  const podeTirar = hospedagem?.tipo === 'vercel' && !pausado && !projeto.ficticio;
  const podeColocar = hospedagem?.tipo === 'vercel' && pausado;
  const prazoDias = estado.dados?.prazo_dias ?? 7;

  const executarPost = async (caminho) => setAtual(await api(`${base}/${caminho}`, { method: 'POST' }));
  const avisei = () => acao.executar(() => executarPost('avisei'));

  return (
    <>
      <section className="cartao">
        <h2>Hospedagem</h2>
        <FormCadastro
          key={`${hospedagem?.tipo}|${hospedagem?.url}|${hospedagem?.vercel_projeto_id}`}
          projetoId={projeto.id}
          hospedagem={hospedagem}
          projetosVercel={projetosVercel}
          aoSalvar={setAtual}
        />
      </section>

      {hospedagem?.tipo === 'vercel' && (
        <section className="cartao">
          <h2>Situação</h2>
          <p className="status-linha">
            <BolinhaStatus status={hospedagem.status} /> <span>{textoStatus(hospedagem)}</span>
          </p>
          <p className="form__ajuda">Última checagem: {hospedagem.ultima_checagem ? dataHoraCurta(hospedagem.ultima_checagem) : '—'}</p>
          {hospedagem.status === 'fora_do_ar' && hospedagem.ultimo_motivo && <p>{hospedagem.ultimo_motivo}</p>}

          {cobranca && (
            <>
              <TextoCobranca cobranca={cobranca} prazoDias={prazoDias} />
            </>
          )}
          <Aviso erro={acao.erro} />

          <AcoesCobranca
            titulo={projeto.titulo}
            url={hospedagem.url}
            fase={cobranca?.fase}
            podeTirar={podeTirar}
            podeColocar={podeColocar}
            enviando={acao.enviando}
            onAvisei={avisei}
            onPausar={() => executarPost('pausar')}
            onReligar={() => executarPost('religar')}
          />

          {pausas.length > 0 && (
            <>
              <h3>Histórico</h3>
              <ul>
                {pausas.map((p, i) => (
                  <li key={i}>{p.acao === 'pausou' ? 'Tirado do ar em' : 'Colocado no ar em'} {dataHoraCurta(p.em)}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

    </>
  );
}
