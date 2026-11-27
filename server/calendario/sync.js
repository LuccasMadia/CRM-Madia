import { obterConfig, definirConfig } from '../repos/config.js';
import { repoEventos } from '../repos/eventos.js';
import { criarClienteCaldav, ErroCaldav } from './caldav.js';
import { eventoParaIcs, icsParaEventos } from './ics-evento.js';
import { calendarioPadrao, lerCalendarios, salvarCalendarios } from './calendarios.js';

const DIA = 24 * 60 * 60 * 1000;
const somarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);

// Sincronização com o iCloud. O UID é a identidade: nunca se cria um evento com UID já conhecido, e o CRM só escreve
// ou apaga no iCloud o que ele mesmo criou ou o que o Lucca alterou/apagou pela tela. Em conflito (412) vale o iCloud.
export function criarSync({ db, fetch, hoje }) {
  const eventos = repoEventos(db);
  const cfg = (chave) => obterConfig(db, chave);

  function conexao() {
    const usuario = cfg('apple_usuario');
    const senha = cfg('apple_senha');
    if (!usuario || !senha) return null;
    return { cliente: criarClienteCaldav({ usuario, senha, fetch }) };
  }
  const janelaPadrao = () => ({ de: somarDias(hoje(), -30), ate: somarDias(hoje(), 180) });

  // 'ok' | 'conflito' | 'rede' (| 'sem_calendario' no envio); qualquer outro erro (senha, 5xx) sobe.
  async function tentar(operacao) {
    try {
      await operacao();
      return 'ok';
    } catch (erro) {
      if (!(erro instanceof ErroCaldav)) throw erro;
      if (erro.status === 412) return 'conflito';
      if (erro.status === 0) return 'rede';
      throw erro;
    }
  }

  async function enviar({ cliente }, evento) {
    if (!evento.calendario_href && !calendarioPadrao(db)) {
      // Ainda não conhecemos os calendários da conta (primeiro evento depois de conectar).
      const lista = await tentar(async () => salvarCalendarios(db, await cliente.listarCalendarios()));
      if (lista === 'rede') {
        eventos.atualizar(evento.id, { pendente: 1 });
        return 'rede';
      }
    }
    const calendario = evento.calendario_href ?? calendarioPadrao(db)?.href;
    if (!calendario) {
      eventos.atualizar(evento.id, { pendente: 1 }); // a conta não tem calendário de eventos: espera um aparecer
      return 'sem_calendario';
    }
    let resultado;
    const estado = await tentar(async () => {
      resultado = await cliente.gravar(calendario, evento.uid, eventoParaIcs(evento), { etag: evento.etag, recurso: evento.href });
    });
    if (estado === 'ok') eventos.atualizar(evento.id, { href: resultado.href, etag: resultado.etag, calendario_href: calendario, pendente: 0 });
    if (estado === 'rede') eventos.atualizar(evento.id, { pendente: 1 });
    if (estado === 'conflito') eventos.atualizar(evento.id, { pendente: 0 });
    return estado;
  }

  async function apagarLa({ cliente }, evento) {
    if (!evento.href) { eventos.apagarDefinitivo(evento.id); return 'ok'; }
    let naoExiste = false;
    const estado = await tentar(async () => {
      try {
        await cliente.apagar(evento.href, evento.etag);
      } catch (erro) {
        if (erro instanceof ErroCaldav && erro.status === 404) naoExiste = true;
        else throw erro;
      }
    });
    if (estado === 'ok' || naoExiste) { eventos.apagarDefinitivo(evento.id); return 'ok'; }
    if (estado === 'conflito') eventos.atualizar(evento.id, { apagado: 0 }); // mudou no iCloud: o evento volta com a versão de lá
    return estado;
  }

  // Calendário que sumiu do iCloud: o que veio dele sai do CRM; o que foi criado aqui volta a ser pendente para o calendário padrão.
  function soltarSumidos(calendarios) {
    if (!calendarios.length) return; // lista vazia é mais provável ser um engano do que a conta sem nenhum calendário
    const existentes = new Set(calendarios.map((c) => c.href));
    for (const e of db.prepare('SELECT * FROM eventos WHERE calendario_href IS NOT NULL').all().map((l) => ({ ...l }))) {
      if (existentes.has(e.calendario_href)) continue;
      if (e.origem === 'apple' || e.apagado) eventos.apagarDefinitivo(e.id);
      else eventos.atualizar(e.id, { href: null, etag: null, calendario_href: null, pendente: 1 });
    }
  }

  // Lê a janela de todos os calendários: insere o que é novo, atualiza o que mudou (pela etag), acompanha o que
  // mudou de calendário (o UID é o mesmo) e trata o que sumiu.
  async function ler({ cliente }, calendarios, { de, ate }) {
    const vistos = new Set();
    let lidos = 0;
    for (const calendario of calendarios) {
      for (const item of await cliente.ler(calendario.href, { de, ate })) {
        for (const lido of icsParaEventos(item.ics, { de, ate })) {
          lidos += 1;
          vistos.add(lido.uid);
          const dados = { titulo: lido.titulo, inicio: lido.inicio, fim: lido.fim, dia_inteiro: lido.dia_inteiro, local: lido.local, notas: lido.notas, recorrente: lido.recorrente, href: item.href, etag: item.etag, calendario_href: calendario.href };
          const existente = eventos.porUid(lido.uid);
          if (!existente) eventos.criar({ ...dados, uid: lido.uid, origem: 'apple', pendente: 0 });
          else if (!existente.apagado && (existente.etag !== item.etag || existente.href !== item.href)) eventos.atualizar(existente.id, { ...dados, pendente: 0 });
        }
      }
    }
    // Só olha o que está inteiro dentro da janela lida: o que está fora não foi pedido ao iCloud.
    const dentro = db.prepare(
      'SELECT * FROM eventos WHERE href IS NOT NULL AND apagado = 0 AND substr(inicio, 1, 10) >= ? AND substr(coalesce(fim, inicio), 1, 10) <= ?',
    ).all(de, ate);
    for (const e of dentro) {
      if (vistos.has(e.uid)) continue;
      if (e.origem === 'apple') eventos.apagarDefinitivo(e.id);
      else eventos.atualizar(e.id, { pendente: 1, href: null, etag: null }); // criado aqui e sumiu de lá: sobe de novo
    }
    return lidos;
  }

  async function sincronizar({ de, ate } = {}) {
    const conectado = conexao();
    if (!conectado) throw new Error('Apple Calendário não conectado.');
    const janela = de && ate ? { de, ate } : janelaPadrao();
    try {
      const calendarios = await conectado.cliente.listarCalendarios();
      salvarCalendarios(db, calendarios);
      soltarSumidos(calendarios);
      let enviados = 0;
      let conflitos = 0;
      let semRede = false;
      for (const e of db.prepare('SELECT * FROM eventos WHERE apagado = 1').all().map((l) => ({ ...l }))) {
        if (semRede) break;
        const estado = await apagarLa(conectado, e);
        if (estado === 'conflito') conflitos += 1;
        if (estado === 'rede') semRede = true;
      }
      for (const e of db.prepare('SELECT * FROM eventos WHERE pendente = 1 AND apagado = 0 AND recorrente = 0').all().map((l) => ({ ...l }))) {
        if (semRede) break;
        const estado = await enviar(conectado, e);
        if (estado === 'ok') enviados += 1;
        if (estado === 'conflito') conflitos += 1;
        if (estado === 'rede') semRede = true;
      }
      const lidos = await ler(conectado, calendarios, janela); // sem internet, falha aqui com a mensagem certa
      definirConfig(db, 'apple_ultima_sync', new Date().toISOString());
      db.prepare("DELETE FROM config WHERE chave = 'apple_erro'").run();
      return { lidos, enviados, conflitos };
    } catch (erro) {
      if (erro instanceof ErroCaldav) definirConfig(db, 'apple_erro', erro.message);
      throw erro;
    }
  }

  // Grava já um evento criado ou editado pela tela. Nunca lança por falta de internet: fica pendente.
  async function gravarEvento(id) {
    const conectado = conexao();
    const evento = eventos.obter(id);
    if (!conectado) return { estado: 'sem_conexao' };
    if (!evento || evento.apagado) return { estado: 'ok' };
    if (evento.recorrente) return { estado: 'somente_leitura' };
    const estado = await enviar(conectado, evento);
    if (estado === 'conflito') await ler(conectado, lerCalendarios(db), janelaPadrao());
    return { estado };
  }

  async function apagarEvento(id) {
    const conectado = conexao();
    const evento = eventos.obter(id);
    if (!conectado) return { estado: 'sem_conexao' };
    if (!evento) return { estado: 'ok' };
    const estado = await apagarLa(conectado, evento);
    if (estado === 'conflito') await ler(conectado, lerCalendarios(db), janelaPadrao());
    return { estado };
  }

  return { sincronizar, gravarEvento, apagarEvento };
}
