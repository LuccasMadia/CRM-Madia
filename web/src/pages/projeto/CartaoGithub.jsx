import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { CommitsPorSemana } from '../../components/graficos/CommitsPorSemana.jsx';

function Selo({ visibilidade, entregue }) {
  if (visibilidade === 'privado') return <span className="etiqueta etiqueta--paga">Privado</span>;
  return <span className={entregue ? 'etiqueta etiqueta--atrasada' : 'etiqueta'}>Público</span>;
}

function Conteudo({ projeto }) {
  const estado = useCarregar(() => api('/github'), []);
  const conectado = estado.dados?.conectado;
  const detalhe = useCarregar(
    () => (conectado && projeto.github_repo ? api(`/projetos/${projeto.id}/github`) : Promise.resolve(null)),
    [conectado, projeto.id, projeto.github_repo],
  );
  const [criado, setCriado] = useState(null);
  const { erro, enviando, executar } = useEnvio();
  const dados = criado ?? detalhe.dados;
  const repo = dados?.repo ?? projeto.github_repo;

  const criar = () => executar(async () => setCriado(await api(`/projetos/${projeto.id}/github`, { method: 'POST' })));

  return (
    <section className="cartao">
      <h2 className="cartao__titulo">GitHub</h2>
      <Aviso erro={estado.erro ?? detalhe.erro} />
      {estado.dados && !conectado && (
        <p>Conecte o GitHub para criar e acompanhar o repositório. <Link to="/configuracoes">Conectar o GitHub</Link></p>
      )}
      {conectado && !repo && (
        <>
          <p>Este projeto ainda não tem repositório.</p>
          <Aviso erro={erro} />
          <button type="button" className="btn" disabled={enviando} onClick={criar}>Criar repositório</button>
        </>
      )}
      {conectado && repo && dados && (
        <>
          <p className="github__repo">
            <a href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer">{repo}</a>
            {dados.encontrado && <Selo visibilidade={dados.visibilidade} entregue={projeto.etapa === 'entregue'} />}
          </p>
          {dados.encontrado
            ? <CommitsPorSemana semanas={dados.commits?.semanas ?? []} calculando={Boolean(dados.commits?.calculando)} />
            : <p className="commits__aviso">Repositório não encontrado no GitHub</p>}
        </>
      )}
    </section>
  );
}

// Só sites e sistemas reais têm repositório criado pelo CRM.
export function CartaoGithub({ projeto }) {
  if (projeto.servico !== 'site_sistema' || projeto.ficticio || projeto.privado) return null;
  return <Conteudo projeto={projeto} />;
}
