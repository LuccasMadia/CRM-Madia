import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { icloudFalso } from '../test/icloudFalso.js';
import { eventoParaIcs } from '../calendario/ics-evento.js';
import { obterConfig } from '../repos/config.js';

const CHAVES = [
  'apple_usuario', 'apple_senha', 'apple_calendario_href', 'apple_calendario_nome', 'apple_calendarios', 'apple_calendario_padrao',
  'apple_calendarios_ocultos', 'apple_ultima_sync', 'apple_erro',
];
const noIphone = (uid, titulo) => eventoParaIcs({ uid, titulo, inicio: '2026-09-25T14:00', fim: '2026-09-25T15:00', dia_inteiro: 0 });

let ctx;
let icloud;
beforeEach(() => {
  icloud = icloudFalso();
  ctx = criarContexto({ hoje: '2026-09-23', fetch: icloud.fetch });
});

const conectar = () => ctx.http.put('/api/calendario/conexao').send({ usuario: icloud.usuario, senha: icloud.senha }).expect(200);
const evento = (dados = {}) => ({ titulo: 'Reunião', inicio: '2026-09-25T14:00', fim: '2026-09-25T15:00', ...dados });
const eventosNoIcloud = (href = icloud.calendarioTrabalho) => [...icloud.eventosDe(href).values()];
const cal = (href, nome, cor, visivel = true) => ({ href, nome, cor: expect.stringMatching(/^#[0-9a-f]{6}$/i), visivel });

describe('conexão', () => {
  it('começa desconectado', async () => {
    expect((await ctx.http.get('/api/calendario').expect(200)).body).toEqual({ conectado: false, usuario: null, calendarios: [], padrao: null, ultima_sync: null, erro: null });
  });

  it('conecta, sincroniza todos os calendários de eventos e guarda a senha sem devolvê-la em nenhuma resposta', async () => {
    icloud.criarNoIphone(noIphone('a1', 'Dentista'), 'trabalho');
    icloud.criarNoIphone(noIphone('b1', 'Aniversário'), 'pessoal');
    icloud.criarNoIphone(noIphone('l1', 'Lembrete'), 'lembretes');
    const res = await conectar();
    expect(res.body).toEqual({
      conectado: true, usuario: icloud.usuario, padrao: icloud.calendarioTrabalho, ultima_sync: expect.stringMatching(/^\d{4}-/), erro: null,
      calendarios: [cal(icloud.calendarioTrabalho, 'Trabalho'), cal(icloud.calendarioPessoal, 'Pessoal')],
    });
    expect(new Set(res.body.calendarios.map((c) => c.cor)).size).toBe(2);
    expect(obterConfig(ctx.db, 'apple_senha')).toBe(icloud.senha);
    expect((await ctx.http.get('/api/eventos')).body.map((e) => [e.titulo, e.calendario_href])).toEqual([['Dentista', icloud.calendarioTrabalho], ['Aniversário', icloud.calendarioPessoal]]);
    for (const corpo of [res.body, (await ctx.http.get('/api/calendario')).body]) expect(JSON.stringify(corpo)).not.toContain(icloud.senha);
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

  it('eventos criados antes de conectar sobem para o calendário padrão', async () => {
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado.pendente).toBe(0);
    await conectar();
    expect(eventosNoIcloud()).toHaveLength(1);
    expect((await ctx.http.get('/api/eventos')).body[0]).toMatchObject({ id: criado.id, pendente: 0, calendario_href: icloud.calendarioTrabalho, href: expect.stringContaining('.ics') });
  });
});

describe('calendários: esconder, padrão e criar', () => {
  it('sem conexão dá 409', async () => {
    const res = await ctx.http.put('/api/calendario/ocultos').send({ ocultos: [] }).expect(409);
    expect(res.body.erro).toBe('Conecte o Apple Calendário em Configurações.');
    await ctx.http.put('/api/calendario/padrao').send({ href: icloud.calendarioPessoal }).expect(409);
    await ctx.http.post('/api/calendario/calendarios').send({ nome: 'X' }).expect(409);
  });

  it('esconder um calendário só tira da tela: ele continua sincronizando', async () => {
    await conectar();
    const res = await ctx.http.put('/api/calendario/ocultos').send({ ocultos: [icloud.calendarioPessoal, 'https://outro/'] }).expect(200);
    expect(res.body.calendarios.map((c) => [c.nome, c.visivel])).toEqual([['Trabalho', true], ['Pessoal', false]]);
    icloud.criarNoIphone(noIphone('b1', 'Aniversário'), 'pessoal');
    await ctx.http.post('/api/calendario/sincronizar').expect(200);
    expect((await ctx.http.get('/api/eventos')).body.map((e) => e.titulo)).toEqual(['Aniversário']);
    const volta = await ctx.http.put('/api/calendario/ocultos').send({ ocultos: [] }).expect(200);
    expect(volta.body.calendarios.every((c) => c.visivel)).toBe(true);
  });

  it('ocultos precisa ser uma lista de textos', async () => {
    await conectar();
    const res = await ctx.http.put('/api/calendario/ocultos').send({ ocultos: 'x' }).expect(400);
    expect(res.body.erros[0].campo).toBe('ocultos');
  });

  it('escolhe o calendário padrão e o evento novo sobe para ele', async () => {
    await conectar();
    const res = await ctx.http.put('/api/calendario/padrao').send({ href: icloud.calendarioPessoal }).expect(200);
    expect(res.body.padrao).toBe(icloud.calendarioPessoal);
    await ctx.http.post('/api/eventos').send(evento()).expect(201);
    expect(eventosNoIcloud(icloud.calendarioPessoal)).toHaveLength(1);
    expect(eventosNoIcloud(icloud.calendarioTrabalho)).toHaveLength(0);
  });

  it('padrão que não existe é recusado no campo href', async () => {
    await conectar();
    const res = await ctx.http.put('/api/calendario/padrao').send({ href: 'https://p01-caldav.icloud.com/123/calendars/outro/' }).expect(400);
    expect(res.body.erros[0].campo).toBe('href');
  });

  it('cria o calendário "CRM Madia", que passa a ser o padrão', async () => {
    await conectar();
    const res = await ctx.http.post('/api/calendario/calendarios').send({ nome: 'CRM Madia' }).expect(200);
    expect(icloud.chamadas('MKCALENDAR')).toHaveLength(1);
    expect(res.body.calendarios.map((c) => c.nome)).toEqual(['Trabalho', 'Pessoal', 'CRM Madia']);
    expect(res.body.calendarios[2].href).toBe(res.body.padrao);
  });

  it('criar calendário exige o nome', async () => {
    await conectar();
    await ctx.http.post('/api/calendario/calendarios').send({}).expect(400);
  });
});

describe('sincronizar', () => {
  it('sem conexão dá 409', async () => {
    expect((await ctx.http.post('/api/calendario/sincronizar').expect(409)).body.erro).toBe('Conecte o Apple Calendário em Configurações.');
  });

  it('traz os eventos do iPhone e guarda a hora da sincronização', async () => {
    await conectar();
    icloud.criarNoIphone(noIphone('a1', 'Dentista'));
    const res = await ctx.http.post('/api/calendario/sincronizar').expect(200);
    expect(res.body).toEqual({ lidos: 1, enviados: 0, conflitos: 0 });
    expect((await ctx.http.get('/api/eventos')).body.map((e) => [e.titulo, e.origem])).toEqual([['Dentista', 'apple']]);
    expect((await ctx.http.get('/api/calendario')).body.ultima_sync).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('um calendário novo criado no iPhone entra sozinho na próxima sincronização', async () => {
    await conectar();
    icloud.calendarios.set(`${icloud.CASA}viagens/`, { nome: 'Viagens', componentes: ['VEVENT'], eventos: new Map() });
    await ctx.http.post('/api/calendario/sincronizar').expect(200);
    expect((await ctx.http.get('/api/calendario')).body.calendarios.map((c) => c.nome)).toEqual(['Trabalho', 'Pessoal', 'Viagens']);
  });

  it('falha do iCloud dá 502 e o erro aparece no estado', async () => {
    await conectar();
    icloud.falha.rede = true;
    const res = await ctx.http.post('/api/calendario/sincronizar').expect(502);
    expect(res.body.erro).toBe('Não foi possível falar com o iCloud. Verifique a internet.');
    expect((await ctx.http.get('/api/calendario')).body.erro).toBe('Não foi possível falar com o iCloud. Verifique a internet.');
  });
});

describe('eventos com o iCloud ligado', () => {
  it('criar, editar e apagar acontecem também no iCloud', async () => {
    await conectar();
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado).toMatchObject({ pendente: 0, calendario_href: icloud.calendarioTrabalho, href: expect.stringContaining('.ics'), etag: expect.stringMatching(/^"v\d+"$/) });
    expect(eventosNoIcloud()).toHaveLength(1);
    expect(eventosNoIcloud()[0].ics).toContain('SUMMARY:Reunião');

    const editado = (await ctx.http.put(`/api/eventos/${criado.id}`).send({ titulo: 'Reunião com Ana' }).expect(200)).body;
    expect(editado.titulo).toBe('Reunião com Ana');
    expect(eventosNoIcloud()[0].ics).toContain('SUMMARY:Reunião com Ana');

    await ctx.http.delete(`/api/eventos/${criado.id}`).expect(204);
    expect(eventosNoIcloud()).toHaveLength(0);
    expect((await ctx.http.get('/api/eventos')).body).toEqual([]);
  });

  it('o evento novo pode escolher o calendário; ao editar ele continua no mesmo', async () => {
    await conectar();
    const criado = (await ctx.http.post('/api/eventos').send(evento({ calendario_href: icloud.calendarioPessoal })).expect(201)).body;
    expect(criado.calendario_href).toBe(icloud.calendarioPessoal);
    expect(eventosNoIcloud(icloud.calendarioPessoal)).toHaveLength(1);
    const editado = (await ctx.http.put(`/api/eventos/${criado.id}`).send({ titulo: 'Outro', calendario_href: icloud.calendarioTrabalho }).expect(200)).body;
    expect(editado.calendario_href).toBe(icloud.calendarioPessoal);
    expect(eventosNoIcloud(icloud.calendarioTrabalho)).toHaveLength(0);
  });

  it('calendário que não existe é recusado no campo calendario_href', async () => {
    await conectar();
    const res = await ctx.http.post('/api/eventos').send(evento({ calendario_href: 'https://x/nao-existe/' })).expect(400);
    expect(res.body.erros[0]).toEqual({ campo: 'calendario_href', mensagem: 'Calendário não encontrado' });
  });

  it('iCloud fora do ar: o evento é criado no CRM como pendente e sobe na próxima sincronização', async () => {
    await conectar();
    icloud.falha.rede = true;
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado.pendente).toBe(1);
    icloud.falha.rede = false;
    expect((await ctx.http.post('/api/calendario/sincronizar').expect(200)).body).toMatchObject({ enviados: 1 });
    expect((await ctx.http.get('/api/eventos')).body[0]).toMatchObject({ id: criado.id, pendente: 0 });
    expect(eventosNoIcloud()).toHaveLength(1);
  });

  it('senha revogada no meio do caminho não derruba a criação do evento', async () => {
    await conectar();
    ctx.db.prepare("UPDATE config SET valor = 'revogada' WHERE chave = 'apple_senha'").run();
    const criado = (await ctx.http.post('/api/eventos').send(evento()).expect(201)).body;
    expect(criado.pendente).toBe(1);
    expect((await ctx.http.get('/api/calendario')).body.erro).toBe('Apple ID ou senha de app inválidos.');
  });
});

describe('desconectar', () => {
  it('apaga as chaves apple_*, tira os eventos do iPhone e mantém os do CRM como locais', async () => {
    await conectar();
    icloud.criarNoIphone(noIphone('a1', 'Do iPhone'));
    await ctx.http.post('/api/calendario/sincronizar').expect(200);
    await ctx.http.post('/api/eventos').send(evento({ titulo: 'Meu' })).expect(201);
    const res = await ctx.http.delete('/api/calendario/conexao').expect(200);
    expect(res.body).toEqual({ conectado: false, usuario: null, calendarios: [], padrao: null, ultima_sync: null, erro: null });
    for (const chave of CHAVES) expect(obterConfig(ctx.db, chave)).toBeFalsy();
    const lista = (await ctx.http.get('/api/eventos')).body;
    expect(lista.map((e) => [e.titulo, e.href, e.calendario_href, e.pendente])).toEqual([['Meu', null, null, 0]]);
    expect(eventosNoIcloud()).toHaveLength(2); // nada é apagado no iCloud ao desconectar
  });

  it('o backup não leva as chaves apple_*', async () => {
    const { copiarBanco } = await import('./backup.js');
    const { DatabaseSync } = await import('node:sqlite');
    const { rmSync } = await import('node:fs');
    await conectar();
    await ctx.http.put('/api/calendario/ocultos').send({ ocultos: [icloud.calendarioPessoal] }).expect(200);
    await ctx.http.put('/api/calendario/padrao').send({ href: icloud.calendarioPessoal }).expect(200);
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
