import { describe, it, expect } from 'vitest';
import { criarClienteCaldav, ErroCaldav } from './caldav.js';
import { icloudFalso } from '../test/icloudFalso.js';

const ICS = (uid, titulo = 'Reunião') => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${titulo}\r\nDTSTART:20261005T140000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const montar = (opcoes = {}) => {
  const icloud = icloudFalso();
  const cliente = criarClienteCaldav({ usuario: icloud.usuario, senha: icloud.senha, fetch: icloud.fetch, ...opcoes });
  return { icloud, cliente };
};

describe('descoberta', () => {
  it('acha o calendar-home do iCloud (que está em outro host) com autenticação Basic', async () => {
    const { icloud, cliente } = montar();
    expect(await cliente.descobrir()).toEqual({ calendarHome: 'https://p01-caldav.icloud.com/123/calendars/' });
    expect(icloud.chamadas('PROPFIND')).toHaveLength(2);
    expect(icloud.requisicoes[0].headers.Authorization).toBe(`Basic ${Buffer.from(`${icloud.usuario}:${icloud.senha}`).toString('base64')}`);
    expect(icloud.requisicoes[0].headers.Depth).toBe('0');
  });

  it('lista só os calendários de eventos', async () => {
    const { cliente } = montar();
    expect(await cliente.listarCalendarios()).toEqual([
      { href: 'https://p01-caldav.icloud.com/123/calendars/trabalho/', nome: 'Trabalho' },
      { href: 'https://p01-caldav.icloud.com/123/calendars/pessoal/', nome: 'Pessoal' },
    ]);
  });

  it('cria um calendário novo com MKCALENDAR e devolve o endereço', async () => {
    const { icloud, cliente } = montar();
    const href = await cliente.criarCalendario('CRM Madia');
    expect(href).toMatch(/^https:\/\/p01-caldav\.icloud\.com\/123\/calendars\/[\w-]+\/$/);
    expect(icloud.chamadas('MKCALENDAR')[0].corpo).toContain('CRM Madia');
    expect((await cliente.listarCalendarios()).map((c) => c.nome)).toContain('CRM Madia');
  });
});

describe('leitura', () => {
  it('pede a janela de datas e devolve href, etag e o ICS com as quebras de linha', async () => {
    const { icloud, cliente } = montar();
    const href = icloud.criarNoIphone(ICS('a1', 'A & B <c>'));
    const itens = await cliente.ler(icloud.calendarioTrabalho, { de: '2026-10-01', ate: '2026-10-31' });
    expect(itens).toEqual([{ href, etag: expect.stringMatching(/^"v\d+"$/), ics: ICS('a1', 'A & B <c>') }]);
    const pedido = icloud.chamadas('REPORT')[0];
    expect(pedido.corpo).toMatch(/time-range start="20260930T\d+Z" end="20261101T\d+Z"/);
    expect(pedido.headers.Depth).toBe('1');
  });

  it('calendário que não existe mais dá a mensagem certa', async () => {
    const { cliente } = montar();
    await expect(cliente.ler('https://p01-caldav.icloud.com/123/calendars/sumiu/', { de: '2026-10-01', ate: '2026-10-31' }))
      .rejects.toMatchObject({ message: 'O calendário escolhido não existe mais no iCloud.', status: 404 });
  });
});

describe('gravação', () => {
  it('evento novo usa If-None-Match e devolve href e etag', async () => {
    const { icloud, cliente } = montar();
    const r = await cliente.gravar(icloud.calendarioTrabalho, 'n1@crm-madia', ICS('n1@crm-madia'));
    expect(r.href).toBe(`${icloud.calendarioTrabalho}n1%40crm-madia.ics`);
    expect(r.etag).toMatch(/^"v\d+"$/);
    expect(icloud.chamadas('PUT')[0].headers['If-None-Match']).toBe('*');
    expect(icloud.chamadas('PUT')[0].headers['Content-Type']).toContain('text/calendar');
  });

  it('atualização usa If-Match com a etag e o endereço do recurso', async () => {
    const { icloud, cliente } = montar();
    const href = icloud.criarNoIphone(ICS('a1'));
    const etag = [...icloud.eventos().values()][0].etag;
    const r = await cliente.gravar(icloud.calendarioTrabalho, 'a1', ICS('a1', 'Novo'), { etag, recurso: href });
    expect(r.href).toBe(href);
    expect(icloud.chamadas('PUT')[0].headers['If-Match']).toBe(etag);
    expect(r.etag).not.toBe(etag);
  });

  it('etag velha dá 412', async () => {
    const { icloud, cliente } = montar();
    const href = icloud.criarNoIphone(ICS('a1'));
    await expect(cliente.gravar(icloud.calendarioTrabalho, 'a1', ICS('a1'), { etag: '"velha"', recurso: href })).rejects.toMatchObject({ status: 412 });
  });

  it('apaga com If-Match', async () => {
    const { icloud, cliente } = montar();
    const href = icloud.criarNoIphone(ICS('a1'));
    const etag = [...icloud.eventos().values()][0].etag;
    await cliente.apagar(href, etag);
    expect(icloud.chamadas('DELETE')[0].headers['If-Match']).toBe(etag);
    expect(icloud.eventos().size).toBe(0);
    await expect(cliente.apagar(href, etag)).rejects.toMatchObject({ status: 404 });
  });
});

describe('erros', () => {
  it('senha errada: mensagem curta e credencial:true', async () => {
    const icloud = icloudFalso();
    const cliente = criarClienteCaldav({ usuario: icloud.usuario, senha: 'errada', fetch: icloud.fetch });
    const erro = await cliente.descobrir().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroCaldav);
    expect(erro).toMatchObject({ message: 'Apple ID ou senha de app inválidos.', status: 401, credencial: true });
  });

  it('sem internet', async () => {
    const { icloud, cliente } = montar();
    icloud.falha.rede = true;
    await expect(cliente.descobrir()).rejects.toMatchObject({ message: 'Não foi possível falar com o iCloud. Verifique a internet.', status: 0, credencial: false });
  });

  it('outro status mostra o número', async () => {
    const { icloud, cliente } = montar();
    icloud.falha.status = 503;
    await expect(cliente.descobrir()).rejects.toMatchObject({ message: 'O iCloud respondeu 503.', status: 503 });
  });
});
