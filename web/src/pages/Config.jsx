import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from '../components/Campo.jsx';
import { Aviso } from '../components/Aviso.jsx';

export function Config() {
  const { dados: config, erro } = useCarregar(() => api('/config'), []);
  return (
    <section>
      <header className="pagina__topo"><h1>Configurações</h1></header>
      <Aviso erro={erro} />
      {config && <Repositorio inicial={config.portfolio_repo_path ?? ''} />}
      <Publicacao />
      <section className="cartao">
        <h2>Backup</h2>
        <p>Baixa um .zip com o banco de dados e todas as imagens enviadas.</p>
        <a className="btn" href="/api/backup" download>Exportar backup (.zip)</a>
      </section>
    </section>
  );
}

function Repositorio({ inicial }) {
  const { valores, campo } = useFormulario({ portfolio_repo_path: inicial });
  const { erros, erro, enviando, executar } = useEnvio();
  const [salvo, setSalvo] = useState(false);
  const importacao = useEnvio();
  const [importados, setImportados] = useState(null);

  function salvar(e) {
    e.preventDefault();
    setSalvo(false);
    executar(async () => {
      await api('/config', { method: 'PUT', body: valores });
      setSalvo(true);
    });
  }

  function importar() {
    importacao.executar(async () => setImportados(await api('/portfolio/importar', { method: 'POST' })));
  }

  const lista = (nomes) => nomes.join(', ') || 'nenhum';

  return (
    <section className="cartao">
      <h2>Repositório do portfólio</h2>
      <form onSubmit={salvar} className="form" noValidate>
        <Campo
          rotulo="Caminho da pasta (clone local)"
          nome="portfolio_repo_path"
          erros={erros}
          placeholder="C:\Users\ComputadorA\Documents\Projetos\Luccas-Madia-Portif-lio"
          {...campo('portfolio_repo_path')}
        />
        <Aviso erro={erro} />
        {salvo && <p className="aviso aviso--ok" role="status">Caminho salvo.</p>}
        <div><button className="btn btn--primario" disabled={enviando}>Salvar caminho</button></div>
      </form>

      <h3>Importar do portfólio</h3>
      <p>Cria no CRM os projetos que estão hoje no <code>src/data/content.js</code> do site. Projetos já importados são ignorados.</p>
      <button type="button" className="btn" onClick={importar} disabled={importacao.enviando}>Importar do portfólio</button>
      <Aviso erro={importacao.erro} />
      {importados && (
        <p role="status">Importados: {lista(importados.importados)}. Ignorados: {lista(importados.ignorados)}.</p>
      )}
    </section>
  );
}

function Publicacao() {
  const [previa, setPrevia] = useState(null);
  const [publicacao, setPublicacao] = useState(null);
  const [git, setGit] = useState(null);
  const envio = useEnvio();

  function gerarPrevia() {
    setPublicacao(null);
    setGit(null);
    envio.executar(async () => setPrevia(await api('/portfolio/previa', { method: 'POST' })));
  }

  function publicar() {
    envio.executar(async () => {
      setPublicacao(await api('/portfolio/publicar', { method: 'POST' }));
      setPrevia(null);
    });
  }

  function commitar() {
    envio.executar(async () => setGit(await api('/portfolio/git', { method: 'POST' })));
  }

  return (
    <section className="cartao">
      <h2>Publicar no portfólio</h2>
      <p>Gera <code>src/data/projects.json</code> e as imagens em <code>public/projects/</code> no repositório do portfólio.</p>
      <button type="button" className="btn btn--primario" onClick={gerarPrevia} disabled={envio.enviando}>Gerar prévia</button>
      <Aviso erro={envio.erro} />

      {previa?.erros.length > 0 && (
        <div className="aviso aviso--erro" role="alert">
          <p>Corrija antes de publicar:</p>
          <ul>
            {previa.erros.map((e, i) => (
              <li key={i}><Link to={`/projetos/${e.projeto_id}`}>{e.projeto}</Link>: {e.mensagem}</li>
            ))}
          </ul>
        </div>
      )}

      {previa?.diff && (
        <>
          <ResumoDiff diff={previa.diff} />
          <button type="button" className="btn btn--primario" onClick={publicar} disabled={envio.enviando}>Confirmar publicação</button>
        </>
      )}

      {publicacao && (
        <div className="aviso aviso--ok" role="status">
          <p>{publicacao.gravado ? 'Arquivos gravados no repositório do portfólio.' : 'Nada mudou — nenhum arquivo foi reescrito.'}</p>
          <button type="button" className="btn" onClick={commitar} disabled={envio.enviando}>Commitar e enviar</button>
        </div>
      )}
      {git && <pre className="saida">{git.saida || 'Commit criado e enviado.'}</pre>}
    </section>
  );
}

function ResumoDiff({ diff }) {
  if (diff.semMudancas) return <p className="aviso">Nenhuma mudança em relação ao que já está no portfólio.</p>;
  const { antes, depois } = diff.projectsDelivered;
  const descrever = (a) =>
    [
      a.campos.length ? `campos ${a.campos.join(', ')}` : null,
      a.imagensAlteradas ? `${a.imagensAlteradas} imagem(ns) alterada(s)` : null,
    ].filter(Boolean).join('; ');
  return (
    <ul className="diff">
      {diff.adicionados.map((t) => <li key={`+${t}`}>Novo projeto: <strong>{t}</strong></li>)}
      {diff.removidos.map((t) => <li key={`-${t}`}>Removido: <strong>{t}</strong></li>)}
      {diff.alterados.map((a) => <li key={a.id}><strong>{a.title}</strong>: {descrever(a)}</li>)}
      {diff.ordemAlterada && <li>Ordem dos projetos alterada</li>}
      {antes !== depois && <li>Projetos entregues: {antes ?? '—'} → {depois}</li>}
    </ul>
  );
}
