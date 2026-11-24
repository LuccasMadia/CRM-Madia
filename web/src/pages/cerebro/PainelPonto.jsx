import { Link } from 'react-router';
import { Icone } from '../../components/Icone.jsx';
import { formatarData } from '../../lib/datas.js';

const TITULO = { centro: () => 'CLAUDE.md', ponto: (d) => d.rotulo, skill: (d) => d.nome, rotina: (d) => d.nome, app: (d) => d.nome };
const TIPO = { centro: 'Centro do cérebro', skill: 'Skill', rotina: 'Rotina', app: 'App' };
const TIPO_PONTO = {
  cliente: 'Cliente', projeto: 'Projeto', orcamento: 'Orçamento', tarefa: 'Tarefa', parcela: 'Parcela', venda: 'Venda de placas',
  hospedagem: 'Site', ferramenta: 'Ferramenta', conteudo: 'Conteúdo', instagram: 'Post', arquivo: 'Arquivo',
};

export const tituloDoItem = ({ tipo, dados }) => TITULO[tipo](dados);
export const textoDoItem = ({ dados }) => dados.texto || null;

function Campos({ campos }) {
  return (
    <dl className="cerebro-painel__campos">
      {campos.map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}
    </dl>
  );
}

function Corpo({ tipo, dados, ligados, aoIrPara }) {
  if (tipo === 'centro') return null;
  if (tipo === 'skill') return <p>{dados.descricao}</p>;
  if (tipo === 'rotina') {
    return <Campos campos={[
      ['O que faz', dados.o_que_faz],
      ['Frequência', dados.frequencia],
      ['Estado', dados.estado === 'ativa' ? 'Ativa' : 'Planejada'],
      ['Última execução', dados.ultima_execucao ? formatarData(dados.ultima_execucao) : 'Ainda não rodou'],
    ]} />;
  }
  if (tipo === 'app') {
    return <Campos campos={[
      ['Para que serve', dados.para_que],
      ['Conexão', dados.conectado ? 'Conectado ao CRM' : 'Não conectado ao CRM'],
    ]} />;
  }
  return (
    <>
      <p>{dados.resumo}</p>
      {ligados.length > 0 && (
        <div className="cerebro-painel__ligados">
          <h3>Ligado a</h3>
          <ul>
            {ligados.map((l) => (
              <li key={l.id}>
                {l.noMapa
                  ? <button type="button" className="cerebro-painel__vizinho" onClick={() => aoIrPara(l.id)}>{l.rotulo}</button>
                  : l.rotulo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// Cartão do item aberto (à esquerda do palco; no celular é a aba "Item" da folha de baixo).
export function PainelItem({ item, ligados = [], aoIrPara, onFechar }) {
  const titulo = tituloDoItem(item);
  const { tipo, dados } = item;
  return (
    <aside className="cerebro-painel cerebro-painel--item" aria-label={titulo}>
      <header className="cerebro-painel__topo">
        <span className="cerebro-painel__etiquetas">
          <span className="cerebro-painel__tipo">{tipo === 'ponto' ? TIPO_PONTO[dados.tipo] : TIPO[tipo]}</span>
          {tipo === 'ponto' && <span className="cerebro-painel__tipo">{dados.area}</span>}
          {tipo === 'ponto' && dados.vivo === false && <span className="cerebro-painel__tipo">Histórico</span>}
          {tipo === 'ponto' && dados.destaque && <span className="cerebro-painel__tipo cerebro-painel__tipo--atencao">Pede ação</span>}
        </span>
        <button type="button" className="cerebro-painel__fechar" aria-label="Fechar" onClick={onFechar}>
          <Icone nome="fechar" />
        </button>
      </header>
      <h2>{titulo}</h2>
      <Corpo tipo={tipo} dados={dados} ligados={ligados} aoIrPara={aoIrPara} />
      {tipo === 'ponto' && dados.link && (
        <div className="cerebro-painel__acoes">
          <Link className="btn btn--primario" to={dados.link}>Abrir no CRM</Link>
        </div>
      )}
    </aside>
  );
}

// Texto inteiro do arquivo, skill ou CLAUDE.md (à direita do palco; no celular é a aba "Conteúdo").
export function PainelConteudo({ item }) {
  const titulo = tituloDoItem(item);
  return (
    <aside className="cerebro-painel cerebro-painel--conteudo" aria-label={`Conteúdo de ${titulo}`}>
      <h2>{titulo}</h2>
      <pre className="cerebro-painel__texto">{textoDoItem(item)}</pre>
    </aside>
  );
}
