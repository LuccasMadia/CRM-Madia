import { obterConfig, definirConfig } from '../repos/config.js';
import { repoEventos } from '../repos/eventos.js';
import { criarExecutorUnico } from '../instagram/executor.js';
import { ErroHttp, ErroValidacao } from '../http/erros.js';
import { criarClienteCaldav, ErroCaldav } from './caldav.js';
import { criarSync } from './sync.js';
import { calendarioPadrao, lerCalendarios, lerOcultos, salvarCalendarios, salvarOcultos } from './calendarios.js';

// 'apple_calendario_href' e 'apple_calendario_nome' são do tempo do calendário único: só são apagados.
const CHAVES = [
  'apple_usuario', 'apple_senha', 'apple_calendarios', 'apple_calendario_padrao', 'apple_calendarios_ocultos',
  'apple_calendario_href', 'apple_calendario_nome', 'apple_ultima_sync', 'apple_erro',
];
const CORES = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#facc15', '#f87171'];

// Conexão com o iCloud, calendários (todos sincronizam; esconder é só da tela) e a sincronização (uma por vez).
// A senha de app nunca sai daqui.
export function criarServicoCalendario({ db, fetch, hoje }) {
  const sync = criarSync({ db, fetch, hoje });
  const eventos = repoEventos(db);
  const executor = criarExecutorUnico(() => sync.sincronizar());
  const cfg = (chave) => obterConfig(db, chave);

  const conectado = () => Boolean(cfg('apple_usuario') && cfg('apple_senha'));
  const clienteCaldav = () => criarClienteCaldav({ usuario: cfg('apple_usuario'), senha: cfg('apple_senha'), fetch });

  function estado() {
    const ocultos = new Set(lerOcultos(db));
    return {
      conectado: conectado(),
      usuario: cfg('apple_usuario') ?? null,
      calendarios: lerCalendarios(db).map((c, i) => ({ href: c.href, nome: c.nome, cor: CORES[i % CORES.length], visivel: !ocultos.has(c.href) })),
      padrao: calendarioPadrao(db)?.href ?? null,
      ultima_sync: cfg('apple_ultima_sync') ?? null,
      erro: cfg('apple_erro') || null,
    };
  }

  // Conta nova: os endereços dos eventos de antes não valem mais. O que veio do iPhone sai do CRM (continua no
  // iCloud) e o que foi criado aqui fica como evento local, pronto para subir.
  function soltarEventos() {
    db.prepare("DELETE FROM eventos WHERE origem = 'apple' OR apagado = 1").run();
    db.prepare("UPDATE eventos SET href = NULL, etag = NULL, calendario_href = NULL, pendente = 0 WHERE origem = 'crm'").run();
  }
  const apagarChaves = () => db.prepare(`DELETE FROM config WHERE chave IN (${CHAVES.map(() => '?').join(',')})`).run(...CHAVES);

  const falha = (erro) => (erro instanceof ErroCaldav ? new ErroHttp(502, erro.message) : erro);
  const salvarErro = (erro) => { if (erro instanceof ErroCaldav) definirConfig(db, 'apple_erro', erro.message); };
  const sincronizarEmSilencio = () => executor.executar().catch(() => {}); // o erro, se houver, fica em apple_erro

  async function conectar({ usuario, senha }) {
    try {
      await criarClienteCaldav({ usuario, senha, fetch }).descobrir();
    } catch (erro) {
      if (erro instanceof ErroCaldav && erro.credencial) throw new ErroValidacao([{ campo: 'senha', mensagem: erro.message }]);
      throw falha(erro);
    }
    soltarEventos();
    apagarChaves();
    definirConfig(db, 'apple_usuario', usuario);
    definirConfig(db, 'apple_senha', senha);
    // O que já existia só no CRM sobe para o calendário padrão.
    db.prepare("UPDATE eventos SET pendente = 1 WHERE origem = 'crm' AND apagado = 0 AND recorrente = 0").run();
    await sincronizarEmSilencio();
  }

  function exigirConexao() {
    if (!conectado()) throw new ErroHttp(409, 'Conecte o Apple Calendário em Configurações.');
  }

  function esconder(ocultos) {
    exigirConexao();
    if (!Array.isArray(ocultos) || ocultos.some((h) => typeof h !== 'string')) throw new ErroValidacao([{ campo: 'ocultos', mensagem: 'Envie a lista de calendários escondidos' }]);
    const conhecidos = new Set(lerCalendarios(db).map((c) => c.href));
    salvarOcultos(db, ocultos.filter((h) => conhecidos.has(h)));
  }

  function definirPadrao(href) {
    exigirConexao();
    if (!lerCalendarios(db).some((c) => c.href === href)) throw new ErroValidacao([{ campo: 'href', mensagem: 'Calendário não encontrado' }]);
    definirConfig(db, 'apple_calendario_padrao', href);
  }

  async function criarCalendario({ nome }) {
    exigirConexao();
    try {
      await clienteCaldav().criarCalendario(nome);
      salvarCalendarios(db, await clienteCaldav().listarCalendarios());
    } catch (erro) {
      throw falha(erro);
    }
    await sincronizarEmSilencio(); // o que estava pendente sem calendário sobe agora
  }

  function desconectar() {
    soltarEventos();
    apagarChaves();
  }

  async function sincronizar() {
    exigirConexao();
    try {
      return await executor.executar();
    } catch (erro) {
      throw falha(erro);
    }
  }

  // Depois de criar ou editar pela tela: grava já no iCloud. Se o iCloud falhar, o evento fica pendente e a resposta segue.
  async function aposGravar(id) {
    try {
      await sync.gravarEvento(id);
    } catch (erro) {
      if (!(erro instanceof ErroCaldav)) throw erro;
      eventos.atualizar(id, { pendente: 1 });
      salvarErro(erro);
    }
    return eventos.obter(id);
  }

  async function aposApagar(id) {
    try {
      await sync.apagarEvento(id);
    } catch (erro) {
      if (!(erro instanceof ErroCaldav)) throw erro;
      salvarErro(erro); // continua marcado como apagado; a próxima sincronização tenta de novo
    }
  }

  return {
    estado, conectar, esconder, definirPadrao, criarCalendario, desconectar, sincronizar, aposGravar, aposApagar,
    // Para o agendador de 5 minutos: só roda conectado e nunca lança.
    sincronizarSeConectado: () => (conectado() ? executor.executar() : null),
  };
}
