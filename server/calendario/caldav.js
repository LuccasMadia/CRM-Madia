// Cliente CalDAV mínimo (PROPFIND, REPORT, PUT, DELETE, MKCALENDAR) para o iCloud. Sem biblioteca; XML lido com regex tolerante.
import { randomUUID } from 'node:crypto';

const RAIZ = 'https://caldav.icloud.com/';
const DIA = 24 * 60 * 60 * 1000;
const SEM_REDE = 'Não foi possível falar com o iCloud. Verifique a internet.';

export class ErroCaldav extends Error {
  constructor(mensagem, { status = 0, credencial = false } = {}) {
    super(mensagem);
    this.status = status;
    this.credencial = credencial;
  }
}

// --- XML ---
const PREFIXO = '(?:[\\w-]+:)?';
const decodificar = (t) => t
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const respostas = (xml) => [...xml.matchAll(new RegExp(`<${PREFIXO}response(?=[\\s>])[^>]*>([\\s\\S]*?)</${PREFIXO}response>`, 'g'))].map((m) => m[1]);
const conteudo = (xml, nome, aparar = true) => {
  const m = new RegExp(`<${PREFIXO}${nome}(?=[\\s>])[^>]*>([\\s\\S]*?)</${PREFIXO}${nome}>`).exec(xml);
  return m ? (aparar ? decodificar(m[1]).trim() : decodificar(m[1])) : null;
};
const hrefDentro = (xml, nome) => {
  const dentro = conteudo(xml, nome);
  return dentro === null ? null : conteudo(dentro, 'href');
};
// Elemento vazio ou com atributos (o iCloud escreve <calendar xmlns="..."/>); `calendar` não casa com `calendar-data`.
const temElemento = (xml, nome) => new RegExp(`<${PREFIXO}${nome}(?:\\s[^>]*)?/?>`).test(xml);

const basico = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

export function criarClienteCaldav({ usuario, senha, fetch = globalThis.fetch, timeoutMs = 20_000 }) {
  const autorizacao = `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`;
  let casa = null;

  async function pedir(metodo, url, { headers = {}, corpo, mensagem404 } = {}) {
    let resposta;
    try {
      resposta = await fetch(url, { method: metodo, headers: { Authorization: autorizacao, ...headers }, body: corpo, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ErroCaldav(SEM_REDE);
    }
    if (resposta.ok) return resposta;
    if (resposta.status === 401) throw new ErroCaldav('Apple ID ou senha de app inválidos.', { status: 401, credencial: true });
    if (resposta.status === 404 && mensagem404) throw new ErroCaldav(mensagem404, { status: 404 });
    throw new ErroCaldav(`O iCloud respondeu ${resposta.status}.`, { status: resposta.status });
  }

  const propfind = (url, profundidade, props) => pedir('PROPFIND', url, {
    headers: { Depth: profundidade, 'Content-Type': 'application/xml; charset=utf-8' },
    corpo: `<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop>${props}</D:prop></D:propfind>`,
  }).then((r) => r.text());

  async function descobrir() {
    if (casa) return { calendarHome: casa };
    const raiz = await propfind(RAIZ, '0', '<D:current-user-principal/>');
    const principal = hrefDentro(raiz, 'current-user-principal');
    if (!principal) throw new ErroCaldav('O iCloud não devolveu a conta. Confira o Apple ID e a senha de app.');
    const dados = await propfind(new URL(principal, RAIZ).href, '0', '<C:calendar-home-set/>');
    const home = hrefDentro(dados, 'calendar-home-set');
    if (!home) throw new ErroCaldav('O iCloud não devolveu os calendários da conta.');
    casa = new URL(home, RAIZ).href;
    return { calendarHome: casa };
  }

  async function listarCalendarios() {
    const { calendarHome } = await descobrir();
    const xml = await propfind(calendarHome, '1', '<D:displayname/><D:resourcetype/><C:supported-calendar-component-set/>');
    return respostas(xml)
      .filter((r) => temElemento(r, 'calendar') && (!/supported-calendar-component-set/.test(r) || /name=["']VEVENT["']/.test(r)))
      .map((r) => ({ href: new URL(conteudo(r, 'href'), calendarHome).href, nome: conteudo(r, 'displayname') || 'Sem nome' }));
  }

  async function criarCalendario(nome) {
    const { calendarHome } = await descobrir();
    const href = `${calendarHome}${randomUUID().toUpperCase()}/`;
    await pedir('MKCALENDAR', href, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      corpo: `<?xml version="1.0" encoding="utf-8"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>${escapar(nome)}</D:displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></D:prop></D:set></C:mkcalendar>`,
    });
    return href;
  }

  // Eventos que tocam [de, ate] (AAAA-MM-DD); a janela pedida ao iCloud tem um dia de folga para cada lado (fuso).
  async function ler(href, { de, ate }) {
    const inicio = basico(Date.parse(`${de}T00:00:00Z`) - DIA);
    const fim = basico(Date.parse(`${ate}T00:00:00Z`) + DIA);
    const resposta = await pedir('REPORT', href, {
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      mensagem404: 'O calendário escolhido não existe mais no iCloud.',
      corpo: `<?xml version="1.0" encoding="utf-8"?><C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:getetag/><C:calendar-data/></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="${inicio}" end="${fim}"/></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`,
    });
    return respostas(await resposta.text())
      .map((r) => ({ href: new URL(conteudo(r, 'href'), href).href, etag: conteudo(r, 'getetag'), ics: conteudo(r, 'calendar-data', false) }))
      .filter((e) => e.ics);
  }

  // Evento novo: PUT em `${calendario}${uid}.ics` com If-None-Match (nunca sobrescreve). Existente: `recurso` + `etag` (If-Match).
  async function gravar(calendario, uid, ics, { etag = null, recurso = null } = {}) {
    const href = recurso ?? `${calendario}${encodeURIComponent(uid)}.ics`;
    const condicao = recurso || etag ? (etag ? { 'If-Match': etag } : {}) : { 'If-None-Match': '*' };
    const resposta = await pedir('PUT', href, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...condicao }, corpo: ics });
    return { href, etag: resposta.headers.get('etag') };
  }

  async function apagar(href, etag = null) {
    await pedir('DELETE', href, { headers: etag ? { 'If-Match': etag } : {} });
  }

  return { descobrir, listarCalendarios, criarCalendario, ler, gravar, apagar };
}
