import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarData } from '../../lib/datas.js';

const PERIGO = ['publico_entregue', 'publico_interno'];

function Selo({ item }) {
  if (item.visibilidade === 'privado') return <span className="etiqueta etiqueta--paga">Privado</span>;
  const perigo = item.alertas.some((a) => PERIGO.includes(a));
  return <span className={perigo ? 'etiqueta etiqueta--atrasada' : 'etiqueta'}>Público</span>;
}

function Alertas({ alertas }) {
  if (!alertas.length) return <p className="aviso aviso--ok" role="status">Tudo em ordem: nada fora do conforme.</p>;
  return (
    <section className="pede-atencao" aria-label="Fora do conforme">
      {alertas.map(({ codigo, texto, link }) => (
        <Link key={`${codigo}-${texto}`} className={`pede-atencao__item pede-atencao__item--${PERIGO.includes(codigo) ? 'perigo' : 'atencao'}`} to={link}>{texto}</Link>
      ))}
    </section>
  );
}

// Cada repositório da conta, o projeto do CRM ligado a ele e o que está fora do conforme.
export function VisaoGithub() {
  const estado = useCarregar(() => api('/github'), []);
  if (!estado.dados) return <Aviso erro={estado.erro} />;
  if (!estado.dados.conectado) {
    return <p>Conecte o GitHub para ver os repositórios e conferir o que é público. <Link to="/configuracoes">Conectar o GitHub</Link></p>;
  }
  return <Tabela />;
}

function Tabela() {
  const { erro, enviando, executar } = useEnvio();
  const carregado = useCarregar(() => api('/github/repositorios'), []);
  const [forcado, setForcado] = useState(null);
  const dados = forcado ?? carregado.dados;

  const recarregar = () => executar(async () => setForcado(await api('/github/repositorios?atualizar=1')));
  const confirmar = (item) => executar(async () => {
    await api(`/projetos/${item.sugestao.id}`, { method: 'PUT', body: { github_repo: item.repo.nome_completo } });
    setForcado(await api('/github/repositorios?atualizar=1'));
  });

  return (
    <div className="github-auditoria">
      <Aviso erro={carregado.erro ?? erro} />
      {dados && (
        <>
          <Alertas alertas={dados.alertas} />
          <div className="barra-visao">
            <p className="github-auditoria__resumo">{`${dados.itens.length} repositórios, ${dados.projetos_sem_repo.length} projetos sem repositório`}</p>
            <button type="button" className="btn" disabled={enviando} onClick={recarregar}>Atualizar</button>
          </div>
          {dados.itens.length ? (
            <div className="tabela-rolavel">
              <table className="tabela">
                <thead>
                  <tr><th>Repositório</th><th>Visibilidade</th><th>Projeto</th><th>Último commit</th></tr>
                </thead>
                <tbody>
                  {dados.itens.map((item) => (
                    <tr key={item.repo.nome_completo}>
                      <td><a href={item.repo.url} target="_blank" rel="noopener noreferrer">{item.repo.nome_completo}</a></td>
                      <td><Selo item={item} /></td>
                      <td>
                        {item.projeto && <Link to={`/projetos/${item.projeto.id}`}>{item.projeto.titulo}</Link>}
                        {!item.projeto && item.sugestao && (
                          <span className="github-auditoria__sugestao">
                            {item.sugestao.titulo}
                            <button type="button" className="btn btn--pequeno" disabled={enviando} onClick={() => confirmar(item)}>Confirmar</button>
                          </span>
                        )}
                        {!item.projeto && !item.sugestao && '—'}
                      </td>
                      <td>{item.repo.ultimo_commit_em ? formatarData(item.repo.ultimo_commit_em.slice(0, 10)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>Nenhum repositório encontrado.</p>}
          {dados.projetos_sem_repo.length > 0 && (
            <section>
              <h3>Projetos sem repositório</h3>
              <ul>
                {dados.projetos_sem_repo.map((p) => <li key={p.id}><Link to={`/projetos/${p.id}`}>{p.titulo}</Link></li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
