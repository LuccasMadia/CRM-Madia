import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { formatarData, hojeISO, nomeMes } from '../../lib/datas.js';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { intervalo, mover } from './datasCalendario.js';
import { GradeMes } from './GradeMes.jsx';
import { GradeSemana } from './GradeSemana.jsx';
import { ListaEventos } from './ListaEventos.jsx';
import { FormEvento } from './FormEvento.jsx';

const MODOS = [['mes', 'Mês'], ['semana', 'Semana'], ['lista', 'Lista']];
const UNIDADE = { mes: 'Mês', semana: 'Semana', lista: 'Mês' };
const noCelular = () => window.matchMedia?.('(max-width: 760px)').matches ?? false;

// Tarefas com prazo (não concluídas) e parcelas em aberto, só para ver: o prazo vira um item do dia.
function prazosDe({ tarefas = [], parcelas = [] }) {
  return [
    ...tarefas.filter((t) => t.prazo && !t.concluida).map((t) => ({ chave: `tarefa-${t.id}`, tipo: 'tarefa', titulo: t.texto, dia: t.prazo, link: '/tarefas' })),
    ...parcelas.filter((p) => p.estado !== 'paga').map((p) => ({
      chave: `parcela-${p.tipo ?? 'parcela'}-${p.id}`, tipo: 'parcela', titulo: `${p.cliente_nome} · ${formatarDinheiro(p.valor_centavos)}`, dia: p.vencimento,
      link: p.projeto_id ? `/projetos/${p.projeto_id}` : '/financeiro',
    })),
  ];
}

function tituloDoPeriodo(modo, ancora, de, ate) {
  return modo === 'semana' ? `${formatarData(de)} – ${formatarData(ate)}` : nomeMes(ancora.slice(0, 7));
}

export function Calendario({ hoje: hojeFixo }) {
  const hoje = hojeFixo ?? hojeISO();
  const [modo, setModo] = useState(() => (noCelular() ? 'lista' : 'mes'));
  const [ancora, setAncora] = useState(hoje);
  const [mostrarPrazos, setMostrarPrazos] = useState(true);
  const [aberto, setAberto] = useState(null); // { dia } = evento novo; { evento } = existente
  const [erroSync, setErroSync] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [appleLocal, setAppleLocal] = useState(null); // estado devolvido ao esconder/mostrar um calendário
  const jaSincronizou = useRef(false);
  const { de, ate } = intervalo(modo, ancora);

  const apple = useCarregar(() => api('/calendario'), []);
  const eventos = useCarregar(() => api(`/eventos?de=${de}&ate=${ate}`), [de, ate]);
  const outros = useCarregar(async () => {
    const [tarefas, parcelas, clientes, projetos] = await Promise.all(['/tarefas', '/parcelas', '/clientes', '/projetos'].map((c) => api(c).catch(() => [])));
    return { tarefas, parcelas, clientes, projetos };
  }, []);

  async function sincronizar() {
    setSincronizando(true);
    setErroSync(null);
    try {
      await api('/calendario/sincronizar', { method: 'POST' });
    } catch (erro) {
      setErroSync(erro);
    } finally {
      setSincronizando(false);
      setAppleLocal(null);
      eventos.recarregar();
      apple.recarregar();
    }
  }

  // Ao abrir a tela, lê o iCloud uma vez (se estiver conectado e com calendário escolhido).
  useEffect(() => {
    if (!jaSincronizou.current && apple.dados?.conectado) {
      jaSincronizou.current = true;
      sincronizar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apple.dados]);

  const estadoApple = appleLocal ?? apple.dados;
  const calendarios = estadoApple?.calendarios ?? [];
  const ocultos = new Set(calendarios.filter((c) => !c.visivel).map((c) => c.href));
  const cores = Object.fromEntries(calendarios.map((c) => [c.href, c.cor]));
  const lista = (eventos.dados ?? []).filter((e) => !ocultos.has(e.calendario_href));

  // Esconder só tira da tela; o calendário continua sincronizando em segundo plano.
  async function alternar(href) {
    const novos = ocultos.has(href) ? [...ocultos].filter((h) => h !== href) : [...ocultos, href];
    try {
      setAppleLocal(await api('/calendario/ocultos', { method: 'PUT', body: { ocultos: novos } }));
    } catch (erro) {
      setErroSync(erro);
    }
  }
  const prazos = mostrarPrazos && outros.dados ? prazosDe(outros.dados) : [];
  const conectado = estadoApple?.conectado;
  const fechar = () => setAberto(null);
  const salvo = () => { fechar(); eventos.recarregar(); };
  const props = { ancora, hoje, eventos: lista, prazos, cores, onNovo: (dia) => setAberto({ dia }), onAbrir: (evento) => setAberto({ evento }) };
  const nomeAviso = UNIDADE[modo];

  return (
    <section>
      <header className="pagina__topo">
        <h1>Calendário</h1>
        <div className="form--linha">
          <button type="button" className="btn" onClick={() => setAberto({ dia: ancora.slice(0, 7) === hoje.slice(0, 7) ? hoje : `${ancora.slice(0, 7)}-01` })}>+ Evento</button>
          {conectado && <button type="button" className="btn" disabled={sincronizando} onClick={sincronizar}>Atualizar</button>}
        </div>
      </header>

      {estadoApple && !conectado && (
        <p className="aviso">Conecte o Apple Calendário para ver e criar eventos também no iPhone. <Link to="/configuracoes">Conectar o Apple Calendário</Link></p>
      )}
      <Aviso erro={erroSync} />
      {!erroSync && estadoApple?.erro && <p className="aviso aviso--erro" role="alert">Última sincronização falhou: {estadoApple.erro}</p>}
      <Aviso erro={eventos.erro} />

      <div className="agenda__controles">
        <div className="form--linha">
          <button type="button" className="btn" onClick={() => setAncora(mover(modo, ancora, -1))} aria-label={`${nomeAviso} anterior`}>‹</button>
          <button type="button" className="btn" onClick={() => setAncora(hoje)}>Hoje</button>
          <button type="button" className="btn" onClick={() => setAncora(mover(modo, ancora, 1))} aria-label={`${nomeAviso} seguinte`}>›</button>
          <h2 className="agenda__titulo">{tituloDoPeriodo(modo, ancora, de, ate)}</h2>
        </div>
        <label className="campo--marcar">
          <input type="checkbox" checked={mostrarPrazos} onChange={(e) => setMostrarPrazos(e.target.checked)} /> Mostrar prazos e parcelas
        </label>
      </div>

      {conectado && calendarios.length > 0 && (
        <div className="agenda__filtros" role="group" aria-label="Calendários">
          {calendarios.map((c) => (
            <label key={c.href} className="campo--marcar">
              <input type="checkbox" checked={c.visivel} onChange={() => alternar(c.href)} />
              <span className="agenda__ponto" style={{ background: c.cor }} aria-hidden="true" /> {c.nome}
            </label>
          ))}
        </div>
      )}

      <div role="tablist" className="abas">
        {MODOS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="abas__aba" aria-selected={modo === chave} onClick={() => setModo(chave)}>{rotulo}</button>
        ))}
      </div>

      {modo === 'mes' && <GradeMes {...props} />}
      {modo === 'semana' && <GradeSemana {...props} />}
      {modo === 'lista' && <ListaEventos {...props} de={de} ate={ate} clientes={outros.dados?.clientes} />}

      {aberto && (
        <Modal titulo={aberto.evento ? (aberto.evento.recorrente ? 'Evento' : 'Editar evento') : 'Novo evento'} onFechar={fechar}>
          <FormEvento
            evento={aberto.evento ?? null} diaInicial={aberto.dia} clientes={outros.dados?.clientes} projetos={outros.dados?.projetos}
            calendarios={calendarios} padrao={estadoApple?.padrao}
            onSalvo={salvo} onExcluido={salvo}
          />
        </Modal>
      )}
    </section>
  );
}
