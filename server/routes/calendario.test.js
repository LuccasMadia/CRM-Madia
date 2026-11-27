import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { icloudFalso } from '../test/icloudFalso.js';
import { eventoParaIcs } from '../calendario/ics-evento.js';
import { obterConfig } from '../repos/config.js';

const CHAVES = ['apple_usuario', 'apple_senha', 'apple_calendario_href', 'apple_calendario_nome', 'apple_ultima_sync', 'apple_erro'];
const noIphone = (uid, titulo) => eventoParaIcs({ uid, titulo, inicio: '2026-09-25T14:00', fim: '2026-09-25T15:00', dia_inteiro: 0 });

let ctx;
let icloud;
beforeEach(() => {
  icloud = icloudFalso();
  ctx = criarContexto({ hoje: '2026-09-23', fetch: icloud.fetch });
});

const conectar = () => ctx.http.put('/api/calendario/conexao').send({ usuario: icloud.usuario, senha: icloud.senha }).expect(200);
const escolher = (corpo = { href: icloud.calendarioTrabalho }) => ctx.http.put('/api/calendario/calendario').send(corpo).expect(200);
const tudoPronto = async () => { await conectar(); await escolher(); };
const evento = (dados = {}) => ({ titulo: 'Reunião', inicio: '2026-09-25T14:00', fim: '2026-09-25T15:00', ...dados });
const eventosNoIcloud = () => [...icloud.eventos().values()];

describe('conexão', () => {
  it('começa desconectado', async () => {
    expect((await ctx.http.get('/api/calendario').expect(200)).body).toEqual({ conectado: false, usuario: null, calendario: null, ultima_sync: null, erro: null });
  });

  it('conecta e guarda a senha sem devolvê-la em nenhuma resposta', async () => {
    const res = await conectar();
    expect(res.body).toEqual({ conectado: true, usuario: icloud.usuario, calendario: null, ultima_sync: null, erro: null });
    expect(obterConfig(ctx.db, 'apple_senha')).toBe(icloud.senha);
    for (const corpo of [res.body, (await ctx.http.get('/api/calendario')).body, (await ctx.http.get('/api/calendario/calendarios')).body]) {
      expect(JSON.stringify(corpo)).not.toContain(icloud.senha);
    }
  });

  it('senha inválida é recusada no campo senha e nada é guardado', async () => {
    const res = await ctx.http.put('/api/calendario/conexao').send({ usuario: icloud.usuario, senha: 'errada' }).expect(400);
    expect(res.body.erros[0]).toEqual({ campo: 'senha', mensagem: 'Apple ID ou senha de app inválidos.' });
    expect(obterConfig(ctx.db, 'apple_senha')).toBeNull();
  });

  it('iCloud fora do ar ao conectar dá 502 com a mensagem de internet', async () => {
    icloud.falha.rede = true;
    const res = await ctx.http.put('/api/calendario/conexao').send({ usuario: icloud.usuario, senha: icloud.senha }).expect(502);
    expect(res.body.erro).toBe('Não foi possível falar com o iCloud. Verifique a internet.');
  });

  it('exige usuário e senha', async () => {
    const res = await ctx.http.put('/api/calendario/conexao').send({}).expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['senha', 'usuario']);
  });
});

describe('calendários', () => {
  it('sem conexão dá 409', async () => {
    const res = await ctx.http.get('/api/calendario/calendarios').expect(409);
    expect(res.body.erro).toBe('Conecte o Apple Calendário em Configurações.');
  });

  it('lista os calendários de eventos e escolhe um', async () => {
    await conectar();
    expect((await ctx.http.get('/api/calendario/calendarios').expect(200)).body).toEqual([{ href: icloud.calendarioTrabalho, nome: 'Trabalho' }]);
    const res = await escolher();
    expect(res.body.calendario).toEqual({ href: icloud.calendarioTrabalho, nome: 'Trabalho' });
  });

  it('escolher um calendário que não existe é recusado no campo href', async () => {
    await conectar();
    const res = await ctx.http.put('/api/calendario/calendario').send({ href: 'https://p01-caldav.icloud.com/123/calendars/outro/' }).expect(400);
    expect(res.body.erros[0].campo).toBe('href');
  });

  it('pode criar o calendário "CRM Madia" e já escolhê-lo', async () => {
    await conectar();
    const res = await escolher({ criar: 'CRM Madia' });
    expect(res.body.calendario.nome).toBe('CRM Madia');
    expect(icloud.chamadas('MKCALENDAR')).toHaveLength(1);
    expect(res.body.calendario.href).toMatch(/^https:\/\/p01-caldav\.icloud\.com\/123\/calendars\//);
  });

  it('exige href ou criar', async () => {
    await conectar();
    await ctx.http.put('/api/calendario/calendario').send({}).expect(400);
  });
});

describe('sincronizar', () => {
  it('sem conexão ou sem calendário escolhido dá 409', async () => {
    expect((await ctx.http.post('/api/calendario/sincronizar').expect(409)).body.erro).toBe('Conecte o Apple Calendário em Configurações.');
    await conectar();
    expect((await ctx.http.post('/api/calendario/sincronizar').expect(409)).body.erro).toBe('Escolha o calendário em Configurações.');
  });

  it('traz os eventos do iPhone e guarda a hora da sincronização', async () => {
    await tudoPronto();
    icloud.criarNoIphone(noIphone('a1', 'Dentista'));
    const res = await ctx.http.post('/api/calendario/sincronizar').expect(200);
    expect(res.body).toEqual({ lidos: 1, enviados: 0, conflitos: 0 });
    expect((await ctx.http.get('/api/eventos')).body.map((e) => [e.titulo, e.origem])).toEqual([['Dentista', 'apple']]);
    expect((await ctx.http.get('/api/calendario')).body.ultima_sync).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('falha do iCloud dá 502 e o erro aparece no estado', async () => {
    await tudoPronto();
    icloud.falha.rede = true;
    const res = await ctx.http.post('/api/calendario/sincronizar').expect(502);
    expect(res.body.erro).toBe('Não foi possível falar com o iCloud. Verifique a internet.');
    expect((await ctx.http.get('/api/calendario')).body.erro).toBe('Não foi possível falar com o iCloud. Verifique a internet.');
  });
});

describe('eventos com o iCloud ligado', () => {
  it('criar, editar e apagar acontecem também no iCloud', async () => {
    await tudoPronto();
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado).toMatchObject({ pendente: 0, href: expect.stringContaining('.ics'), etag: expect.stringMatching(/^"v\d+"$/) });
    expect(eventosNoIcloud()).toHaveLength(1);
    expect(eventosNoIcloud()[0].ics).toContain('SUMMARY:Reunião');

    const editado = (await ctx.http.put(`/api/eventos/${criado.id}`).send({ titulo: 'Reunião com Ana' }).expect(200)).body;
    expect(editado.titulo).toBe('Reunião com Ana');
    expect(eventosNoIcloud()[0].ics).toContain('SUMMARY:Reunião com Ana');

    await ctx.http.delete(`/api/eventos/${criado.id}`).expect(204);
    expect(eventosNoIcloud()).toHaveLength(0);
    expect((await ctx.http.get('/api/eventos')).body).toEqual([]);
  });

  it('iCloud fora do ar: o evento é criado no CRM como pendente e sobe na próxima sincronização', async () => {
    await tudoPronto();
    icloud.falha.rede = true;
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado.pendente).toBe(1);
    icloud.falha.rede = false;
    expect((await ctx.http.post('/api/calendario/sincronizar').expect(200)).body).toMatchObject({ enviados: 1 });
    expect((await ctx.http.get('/api/eventos')).body[0]).toMatchObject({ id: criado.id, pendente: 0 });
    expect(eventosNoIcloud()).toHaveLength(1);
  });

  it('senha revogada no meio do caminho não derruba a criação do evento', async () => {
    await tudoPronto();
    ctx.db.prepare("UPDATE config SET valor = 'revogada' WHERE chave = 'apple_senha'").run();
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado.pendente).toBe(1);
    expect((await ctx.http.get('/api/calendario')).body.erro).toBe('Apple ID ou senha de app inválidos.');
  });

  it('eventos criados antes de escolher o calendário sobem quando ele é escolhido', async () => {
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado.pendente).toBe(0);
    await tudoPronto();
    expect(eventosNoIcloud()).toHaveLength(1);
    expect((await ctx.http.get('/api/eventos')).body[0]).toMatchObject({ id: criado.id, pendente: 0, href: expect.stringContaining('.ics') });
  });
});

describe('trocar de calendário e desconectar', () => {
  it('trocar de calendário tira os eventos do iPhone e reenvia os do CRM para o novo', async () => {
    await tudoPronto();
    icloud.criarNoIphone(noIphone('a1', 'Do iPhone'));
    await ctx.http.post('/api/calendario/sincronizar').expect(200);
    const meu = (await ctx.http.post('/api/eventos').send(evento({ titulo: 'Meu' })).expect(201)).body;
    await escolher({ criar: 'CRM Madia' });
    const lista = (await ctx.http.get('/api/eventos')).body;
    expect(lista.map((e) => e.titulo)).toEqual(['Meu']);
    expect(lista[0]).toMatchObject({ id: meu.id, pendente: 0 });
    const novo = [...icloud.calendarios].find(([, c]) => c.nome === 'CRM Madia')[1];
    expect(novo.eventos.size).toBe(1);
  });

  it('desconectar apaga as chaves apple_*, tira os eventos do iPhone e mantém os do CRM como locais', async () => {
    await tudoPronto();
    icloud.criarNoIphone(noIphone('a1', 'Do iPhone'));
    await ctx.http.post('/api/calendario/sincronizar').expect(200);
    await ctx.http.post('/api/eventos').send(evento({ titulo: 'Meu' })).expect(201);
    const res = await ctx.http.delete('/api/calendario/conexao').expect(200);
    expect(res.body).toEqual({ conectado: false, usuario: null, calendario: null, ultima_sync: null, erro: null });
    for (const chave of CHAVES) expect(obterConfig(ctx.db, chave)).toBeFalsy();
    const lista = (await ctx.http.get('/api/eventos')).body;
    expect(lista.map((e) => [e.titulo, e.href, e.pendente])).toEqual([['Meu', null, 0]]);
    expect(eventosNoIcloud()).toHaveLength(2); // nada é apagado no iCloud ao desconectar
  });

  it('o backup não leva as chaves apple_*', async () => {
    const { copiarBanco } = await import('./backup.js');
    const { DatabaseSync } = await import('node:sqlite');
    const { rmSync } = await import('node:fs');
    await tudoPronto();
    await ctx.http.post('/api/calendario/sincronizar').expect(200);
    const copia = copiarBanco(ctx.db);
    try {
      const lida = new DatabaseSync(copia, { readOnly: true });
      const chaves = lida.prepare('SELECT chave FROM config').all().map((r) => r.chave);
      lida.close();
      for (const chave of CHAVES) expect(chaves).not.toContain(chave);
    } finally {
      rmSync(copia, { force: true });
    }
  });
});
