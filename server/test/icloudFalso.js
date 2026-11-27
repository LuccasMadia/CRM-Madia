// Servidor CalDAV do iCloud falso, em memória, para os testes: descoberta (principal → calendar-home), lista de calendários,
// REPORT, PUT com If-Match/If-None-Match (412), DELETE e MKCALENDAR. Expõe o que um iPhone faria (criar/alterar/remover).
const RAIZ = 'https://caldav.icloud.com/';
const PRINCIPAL = 'https://caldav.icloud.com/123/principal/';
const CASA = 'https://p01-caldav.icloud.com/123/calendars/';

const xml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
const multistatus = (respostas) => `<?xml version="1.0" encoding="UTF-8"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${respostas.join('')}</D:multistatus>`;
const resposta = (status, corpo = null, headers = {}) => new Response(status === 204 || corpo === null ? null : corpo, { status, headers });
const uidDe = (ics) => /^UID:(.+)$/m.exec(ics.replace(/\r/g, ''))[1].trim();

export function icloudFalso({ usuario = 'eu@icloud.com', senha = 'abcd-efgh-ijkl-mnop' } = {}) {
  const calendarios = new Map([
    [`${CASA}trabalho/`, { nome: 'Trabalho', componentes: ['VEVENT'], eventos: new Map() }],
    [`${CASA}lembretes/`, { nome: 'Lembretes', componentes: ['VTODO'], eventos: new Map() }],
  ]);
  const requisicoes = [];
  const falha = { rede: false, status: null };
  let versao = 0;
  const novoEtag = () => `"v${(versao += 1)}"`;
  const auth = `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`;
  const calendarioDe = (url) => [...calendarios].find(([href]) => url.startsWith(href));

  const fetch = async (entrada, init = {}) => {
    const url = new URL(String(entrada));
    const metodo = (init.method ?? 'GET').toUpperCase();
    const corpo = init.body === undefined ? '' : String(init.body);
    const headers = init.headers ?? {};
    requisicoes.push({ metodo, url, corpo, headers });
    if (falha.rede) throw new Error('ECONNRESET');
    if (falha.status) return resposta(falha.status, '');
    if (headers.Authorization !== auth) return resposta(401, '');

    if (metodo === 'PROPFIND' && url.href === RAIZ) {
      return resposta(207, multistatus([`<D:response><D:href>/</D:href><D:propstat><D:prop><D:current-user-principal><D:href>/123/principal/</D:href></D:current-user-principal></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`]));
    }
    if (metodo === 'PROPFIND' && url.href === PRINCIPAL) {
      return resposta(207, multistatus([`<D:response><D:href>/123/principal/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>https://p01-caldav.icloud.com:443/123/calendars/</D:href></C:calendar-home-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`]));
    }
    if (metodo === 'PROPFIND' && url.href === CASA) {
      const linhas = [`<D:response><D:href>/123/calendars/</D:href><D:propstat><D:prop><D:displayname>Home</D:displayname><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
        `<D:response><D:href>/123/calendars/inbox/</D:href><D:propstat><D:prop><D:displayname>Entrada</D:displayname><D:resourcetype><D:collection/><C:schedule-inbox/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`];
      for (const [href, c] of calendarios) {
        const comps = c.componentes.map((n) => `<comp name='${n}' xmlns='urn:ietf:params:xml:ns:caldav'/>`).join('');
        linhas.push(`<D:response><D:href>${new URL(href).pathname}</D:href><D:propstat><D:prop><D:displayname>${xml(c.nome)}</D:displayname><D:resourcetype><D:collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></D:resourcetype><C:supported-calendar-component-set>${comps}</C:supported-calendar-component-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`);
      }
      return resposta(207, multistatus(linhas));
    }
    if (metodo === 'MKCALENDAR') {
      const nome = /<(?:\w+:)?displayname>([^<]*)</.exec(corpo)?.[1] ?? 'Novo';
      calendarios.set(url.href, { nome, componentes: ['VEVENT'], eventos: new Map() });
      return resposta(201, '');
    }

    const encontrado = calendarioDe(url.href);
    if (metodo === 'REPORT') {
      if (!encontrado) return resposta(404, '');
      const respostas = [...encontrado[1].eventos].map(([href, e]) => `<D:response><D:href>${new URL(href).pathname}</D:href><D:propstat><D:prop><D:getetag>${xml(e.etag)}</D:getetag><C:calendar-data>${xml(e.ics)}</C:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`);
      return resposta(207, multistatus(respostas));
    }
    if (!encontrado) return resposta(404, '');
    const eventos = encontrado[1].eventos;
    const atual = eventos.get(url.href);
    if (metodo === 'PUT') {
      if (headers['If-None-Match'] === '*' && atual) return resposta(412, '');
      if (headers['If-Match'] && (!atual || atual.etag !== headers['If-Match'])) return resposta(412, '');
      const etag = novoEtag();
      eventos.set(url.href, { etag, ics: corpo });
      return resposta(atual ? 204 : 201, '', { ETag: etag });
    }
    if (metodo === 'DELETE') {
      if (!atual) return resposta(404, '');
      if (headers['If-Match'] && atual.etag !== headers['If-Match']) return resposta(412, '');
      eventos.delete(url.href);
      return resposta(204);
    }
    return resposta(405, '');
  };

  const trabalho = () => calendarios.get(`${CASA}trabalho/`).eventos;
  return {
    fetch, requisicoes, usuario, senha, falha, calendarios, CASA,
    calendarioTrabalho: `${CASA}trabalho/`,
    // O que um iPhone faria:
    criarNoIphone(ics, calendario = 'trabalho') {
      const href = `${CASA}${calendario}/${uidDe(ics)}.ics`;
      calendarios.get(`${CASA}${calendario}/`).eventos.set(href, { etag: novoEtag(), ics });
      return href;
    },
    alterarNoIphone(href, ics) { trabalho().set(href, { etag: novoEtag(), ics }); },
    removerNoIphone(href) { trabalho().delete(href); },
    eventos: trabalho,
    chamadas: (metodo) => requisicoes.filter((r) => r.metodo === metodo),
  };
}
