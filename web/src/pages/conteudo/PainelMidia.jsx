import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarData } from '../../lib/datas.js';
import { ROTULO_TIPO } from '../../lib/rotulos.js';

const NUMEROS = [
  ['visualizacoes', 'Visualizações'],
  ['alcance', 'Alcance'],
  ['curtidas', 'Curtidas'],
  ['comentarios', 'Comentários'],
  ['salvamentos', 'Salvamentos'],
  ['compartilhamentos', 'Compartilhamentos'],
];

function Vinculo({ midia, onMudou, executar }) {
  const { dados: candidatos } = useCarregar(
    () => (midia.conteudo_id ? Promise.resolve([]) : api(`/instagram/midias/${midia.id}/candidatos`)),
    [midia.id, midia.conteudo_id],
  );
  const [escolhido, setEscolhido] = useState('');

  if (midia.conteudo_id) {
    const desfazer = () => executar(async () => {
      await api(`/instagram/midias/${midia.id}/vinculo`, { method: 'DELETE' });
      onMudou();
    });
    return (
      <p className="painel-midia__vinculo">
        <span>Ligado a: {midia.conteudo_titulo}</span> · <button type="button" className="btn btn--fantasma" onClick={desfazer}>Desfazer</button>
      </p>
    );
  }
  if (!candidatos?.length) return null;
  const alvo = escolhido || String(candidatos[0].id);
  const ligar = () => executar(async () => {
    await api(`/instagram/midias/${midia.id}/vinculo`, { method: 'POST', body: { conteudo_id: Number(alvo) } });
    onMudou();
  });
  return (
    <div className="painel-midia__vinculo">
      <label htmlFor="vinculo-planejado">Era um destes planejados?</label>
      <div className="form--linha">
        <select id="vinculo-planejado" value={alvo} onChange={(e) => setEscolhido(e.target.value)}>
          {candidatos.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
        </select>
        <button type="button" className="btn" onClick={ligar}>Ligar</button>
      </div>
    </div>
  );
}

export function PainelMidia({ midia, onMudou }) {
  const { dados: projetos } = useCarregar(() => api('/projetos'), []);
  const { erro, executar } = useEnvio();

  if (!midia) {
    return (
      <aside className="cartao painel-midia" aria-label="Detalhes do post">
        <p className="vazio">Clique num post para ver os números.</p>
      </aside>
    );
  }

  const mudarProjeto = (valor) => executar(async () => {
    await api(`/instagram/midias/${midia.id}`, { method: 'PUT', body: { projeto_id: valor ? Number(valor) : null } });
    onMudou();
  });

  return (
    <aside className="cartao painel-midia" aria-label="Detalhes do post">
      {midia.capa_url && <img className="painel-midia__capa" src={midia.capa_url} alt="" />}
      <p className="kanban__meta">{ROTULO_TIPO[midia.tipo]} · {formatarData(midia.publicado_em.slice(0, 10))}</p>
      {midia.legenda && (
        <details className="painel-midia__legenda">
          <summary>{midia.legenda.split('\n')[0]}</summary>
          <p>{midia.legenda}</p>
        </details>
      )}
      <dl className="painel-midia__numeros">
        {NUMEROS.map(([campo, rotulo]) => (
          <div key={campo}>
            <dt>{rotulo}</dt>
            <dd>{midia[campo] == null ? '—' : midia[campo].toLocaleString('pt-BR')}</dd>
          </div>
        ))}
      </dl>
      {midia.permalink && <a href={midia.permalink} target="_blank" rel="noreferrer">Abrir no Instagram</a>}
      <div className="campo">
        <label htmlFor="projeto-do-post">Projeto do post</label>
        <select id="projeto-do-post" value={midia.projeto_id ?? ''} onChange={(e) => mudarProjeto(e.target.value)}>
          <option value="">Nenhum</option>
          {(projetos ?? []).map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
        </select>
      </div>
      <Vinculo midia={midia} onMudou={onMudou} executar={executar} />
      <Aviso erro={erro} />
    </aside>
  );
}
