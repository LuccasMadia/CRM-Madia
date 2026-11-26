import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Campo } from '../../components/Campo.jsx';
import { formatarData } from '../../lib/datas.js';

function Conteudo({ projeto }) {
  const estado = useCarregar(() => api('/figma'), []);
  const conectado = estado.dados?.conectado;
  const [codigo, setCodigo] = useState(projeto.figma_arquivo ?? null);
  const [trocando, setTrocando] = useState(false);
  const [link, setLink] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const detalhe = useCarregar(
    () => (conectado && codigo ? api(`/projetos/${projeto.id}/figma`) : Promise.resolve(null)),
    [conectado, projeto.id, codigo],
  );

  const gravar = (figmaUrl) => executar(async () => {
    const salvo = await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { figma_url: figmaUrl } });
    setCodigo(salvo.figma_arquivo ?? null);
    setTrocando(false);
    setLink('');
  });
  const salvar = (e) => { e.preventDefault(); gravar(link); };

  const dados = detalhe.dados;
  const mostrandoArquivo = codigo && !trocando;
  return (
    <section className="cartao">
      <h2 className="cartao__titulo">Figma</h2>
      <Aviso erro={estado.erro} />
      {estado.dados && !conectado && (
        <p>Conecte o Figma para ver o nome e a data da última edição. <Link to="/configuracoes">Conectar o Figma</Link></p>
      )}
      {!mostrandoArquivo && (
        <form className="form" onSubmit={salvar} noValidate>
          <Campo rotulo="Link do arquivo do Figma" nome="figma_url" erros={erros} value={link} onChange={(e) => setLink(e.target.value)} />
          <div className="form--linha">
            <button className="btn btn--primario" disabled={enviando || !link.trim()}>Salvar</button>
            {trocando && <button type="button" className="btn" onClick={() => setTrocando(false)}>Cancelar</button>}
          </div>
        </form>
      )}
      {mostrandoArquivo && (
        <>
          {dados?.encontrado && (
            <>
              <p className="figma__nome">{dados.nome}</p>
              <p className="figma__edicao">{`Editado em ${formatarData(dados.editado_em.slice(0, 10))}`}</p>
            </>
          )}
          {conectado && dados && !dados.encontrado && <p className="commits__aviso">Arquivo não encontrado ou sem acesso</p>}
          <Aviso erro={detalhe.erro} />
          <div className="form--linha">
            <a className="btn btn--primario" href={dados?.url ?? `https://www.figma.com/design/${codigo}`} target="_blank" rel="noopener noreferrer">Abrir no Figma</a>
            <button type="button" className="btn" disabled={enviando} onClick={() => setTrocando(true)}>Trocar</button>
            <button type="button" className="btn" disabled={enviando} onClick={() => gravar('')}>Remover</button>
          </div>
        </>
      )}
      {!erros.length && <Aviso erro={erro} />}
    </section>
  );
}

// Todo site/sistema pode ter o design no Figma, inclusive fictício e privado.
export function CartaoFigma({ projeto }) {
  if (projeto.servico !== 'site_sistema') return null;
  return <Conteudo projeto={projeto} />;
}
