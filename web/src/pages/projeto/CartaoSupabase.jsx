import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Campo } from '../../components/Campo.jsx';

const SELOS = {
  no_ar: ['No ar', 'etiqueta etiqueta--paga'],
  pausado: ['Pausado', 'etiqueta etiqueta--atrasada'],
  subindo: ['Subindo', 'etiqueta etiqueta--proposta'],
  outro: ['Desconhecido', 'etiqueta'],
};

function Selo({ estado }) {
  const [texto, classe] = SELOS[estado] ?? SELOS.outro;
  return <span className={classe}>{texto}</span>;
}

function Conteudo({ projeto }) {
  const estado = useCarregar(() => api('/supabase'), []);
  const conectado = estado.dados?.conectado;
  const [ref, setRef] = useState(projeto.supabase_ref ?? null);
  const [trocando, setTrocando] = useState(false);
  const [escolhido, setEscolhido] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const mostrandoProjeto = Boolean(ref) && !trocando;
  const lista = useCarregar(
    () => (conectado && !mostrandoProjeto ? api('/supabase/projetos') : Promise.resolve(null)),
    [conectado, mostrandoProjeto],
  );
  const detalhe = useCarregar(
    () => (conectado && ref ? api(`/projetos/${projeto.id}/supabase`) : Promise.resolve(null)),
    [conectado, projeto.id, ref],
  );

  const gravar = (valor) => executar(async () => {
    const salvo = await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { supabase_ref: valor } });
    setRef(salvo.supabase_ref ?? null);
    setTrocando(false);
    setEscolhido('');
  });
  const salvar = (e) => { e.preventDefault(); gravar(escolhido); };

  const dados = detalhe.dados;
  return (
    <section className="cartao">
      <h2 className="cartao__titulo">Supabase</h2>
      <Aviso erro={estado.erro} />
      {estado.dados && !conectado && (
        <p>Adicione uma conta do Supabase para ver se o projeto está no ar ou pausado. <Link to="/configuracoes">Conectar o Supabase</Link></p>
      )}
      {conectado && !mostrandoProjeto && (
        <form className="form" onSubmit={salvar} noValidate>
          <Aviso erro={lista.erro} />
          {(lista.dados?.erros ?? []).map((e) => <Aviso key={e.conta_id} erro={{ message: `Conta ${e.conta}: ${e.erro}` }} />)}
          <Campo rotulo="Projeto do Supabase" nome="supabase_ref" erros={erros}>
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
              <option value="">Escolha um projeto</option>
              {(lista.dados?.projetos ?? []).map((p) => <option key={p.ref} value={p.ref}>{`${p.nome} (${p.regiao}) · ${p.conta}`}</option>)}
            </select>
          </Campo>
          <div className="form--linha">
            <button className="btn btn--primario" disabled={enviando || !escolhido}>Salvar</button>
            {trocando && <button type="button" className="btn" onClick={() => setTrocando(false)}>Cancelar</button>}
          </div>
        </form>
      )}
      {mostrandoProjeto && (
        <>
          {dados?.encontrado && (
            <>
              <p className="figma__nome">{dados.nome}</p>
              <p className="figma__edicao"><span>{`${dados.regiao} · ${dados.conta}`}</span> <Selo estado={dados.estado} /></p>
            </>
          )}
          {conectado && dados && !dados.encontrado && <p className="commits__aviso">Projeto não encontrado nas suas contas do Supabase</p>}
          <Aviso erro={detalhe.erro} />
          <div className="form--linha">
            <a className="btn btn--primario" href={dados?.link ?? `https://supabase.com/dashboard/project/${ref}`} target="_blank" rel="noopener noreferrer">Abrir no Supabase</a>
            <button type="button" className="btn" disabled={enviando} onClick={() => setTrocando(true)}>Trocar</button>
            <button type="button" className="btn" disabled={enviando} onClick={() => gravar('')}>Remover</button>
          </div>
        </>
      )}
      {!erros.length && <Aviso erro={erro} />}
    </section>
  );
}

// Todo site/sistema pode ter o banco no Supabase, inclusive fictício e privado.
export function CartaoSupabase({ projeto }) {
  if (projeto.servico !== 'site_sistema') return null;
  return <Conteudo projeto={projeto} />;
}
