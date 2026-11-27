import { obterConfig, definirConfig } from '../repos/config.js';
import { repoEventos } from '../repos/eventos.js';
import { criarExecutorUnico } from '../instagram/executor.js';
import { ErroHttp, ErroValidacao } from '../http/erros.js';
import { criarClienteCaldav, ErroCaldav } from './caldav.js';
import { criarSync } from './sync.js';

const CHAVES = ['apple_usuario', 'apple_senha', 'apple_calendario_href', 'apple_calendario_nome', 'apple_ultima_sync', 'apple_erro'];

// Conexão com o iCloud, escolha do calendário e a sincronização (uma por vez). A senha de app nunca sai daqui.
export function criarServicoCalendario({ db, fetch, hoje }) {
  const sync = criarSync({ db, fetch, hoje });
  const eventos = repoEventos(db);
  const executor = criarExecutorUnico(() => sync.sincronizar());
  const cfg = (chave) => obterConfig(db, chave);

  const conectado = () => Boolean(cfg('apple_usuario') && cfg('apple_senha'));
  const escolhido = () => Boolean(cfg('apple_calendario_href'));
  const clienteCaldav = () => criarClienteCaldav({ usuario: cfg('apple_usuario'), senha: cfg('apple_senha'), fetch });

  function estado() {
    return {
      conectado: conectado(),
      usuario: cfg('apple_usuario') ?? null,
      calendario: escolhido() ? { href: cfg('apple_calendario_href'), nome: cfg('apple_calendario_nome') ?? 'Calendário' } : null,
      ultima_sync: cfg('apple_ultima_sync') ?? null,
      erro: cfg('apple_erro') || null,
    };
  }

  // Conta ou calendário novo: os endereços dos eventos de antes não valem mais. O que veio do iPhone sai do CRM
  // (continua no iCloud) e o que foi criado aqui fica como evento local, pronto para subir de novo.
  function soltarEventos() {
    db.prepare("DELETE FROM eventos WHERE origem = 'apple' OR apagado = 1").run();
    db.prepare("UPDATE eventos SET href = NULL, etag = NULL, pendente = 0 WHERE origem = 'crm'").run();
  }

  const falha = (erro) => (erro instanceof ErroCaldav ? new ErroHttp(502, erro.message) : erro);
  const salvarErro = (erro) => { if (erro instanceof ErroCaldav) definirConfig(db, 'apple_erro', erro.message); };

  async function conectar({ usuario, senha }) {
    try {
      await criarClienteCaldav({ usuario, senha, fetch }).descobrir();
    } catch (erro) {
      if (erro instanceof ErroCaldav && erro.credencial) throw new ErroValidacao([{ campo: 'senha', mensagem: erro.message }]);
      throw falha(erro);
    }
    soltarEventos();
    db.prepare(`DELETE FROM config WHERE chave IN (${CHAVES.map(() => '?').join(',')})`).run(...CHAVES);
    definirConfig(db, 'apple_usuario', usuario);
    definirConfig(db, 'apple_senha', senha);
  }

  function exigirConexao() {
    if (!conectado()) throw new ErroHttp(409, 'Conecte o Apple Calendário em Configurações.');
  }

  async function calendarios() {
    exigirConexao();
    try {
      return await clienteCaldav().listarCalendarios();
    } catch (erro) {
      throw falha(erro);
    }
  }

  async function escolher({ href, criar }) {
    exigirConexao();
    let escolhida;
    try {
      if (criar) {
        escolhida = { href: await clienteCaldav().criarCalendario(criar), nome: criar };
      } else {
        escolhida = (await clienteCaldav().listarCalendarios()).find((c) => c.href === href);
        if (!escolhida) throw new ErroValidacao([{ campo: 'href', mensagem: 'Calendário não encontrado no iCloud' }]);
      }
    } catch (erro) {
      throw falha(erro);
    }
    if (cfg('apple_calendario_href') && cfg('apple_calendario_href') !== escolhida.href) soltarEventos();
    definirConfig(db, 'apple_calendario_href', escolhida.href);
    definirConfig(db, 'apple_calendario_nome', escolhida.nome);
    // O que já existia só no CRM sobe para o calendário escolhido.
    db.prepare("UPDATE eventos SET pendente = 1 WHERE origem = 'crm' AND href IS NULL AND apagado = 0 AND recorrente = 0").run();
    await executor.executar().catch(() => {}); // o erro, se houver, fica em apple_erro
  }

  function desconectar() {
    soltarEventos();
    db.prepare(`DELETE FROM config WHERE chave IN (${CHAVES.map(() => '?').join(',')})`).run(...CHAVES);
  }

  async function sincronizar() {
    exigirConexao();
    if (!escolhido()) throw new ErroHttp(409, 'Escolha o calendário em Configurações.');
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
    estado, conectar, calendarios, escolher, desconectar, sincronizar, aposGravar, aposApagar,
    // Para o agendador de 5 minutos: só roda com tudo configurado e nunca lança.
    sincronizarSeConectado: () => (conectado() && escolhido() ? executor.executar() : null),
  };
}
