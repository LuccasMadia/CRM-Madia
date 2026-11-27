import { describe, it, expect } from 'vitest';
import { openDb } from '../db/connection.js';
import { definirConfig, obterConfig } from '../repos/config.js';
import { repoEventos } from '../repos/eventos.js';
import { icloudFalso } from '../test/icloudFalso.js';
import { eventoParaIcs } from './ics-evento.js';
import { criarSync } from './sync.js';
import { lerCalendarios } from './calendarios.js';

const ev = (uid, titulo, inicio = '2026-10-05T14:00') => eventoParaIcs({ uid, titulo, inicio, fim: inicio.replace('14:00', '15:00'), dia_inteiro: 0 });
const semanal = (uid) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Semanal\r\nDTSTART:20261005T100000\r\nDTEND:20261005T110000\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

function montar() {
  const icloud = icloudFalso();
  const db = openDb(':memory:');
  definirConfig(db, 'apple_usuario', icloud.usuario);
  definirConfig(db, 'apple_senha', icloud.senha);
  const eventos = repoEventos(db);
  const sync = criarSync({ db, fetch: icloud.fetch, hoje: () => '2026-10-01' });
  const local = (dados = {}) => eventos.criar({ titulo: 'Local', inicio: '2026-10-08T09:00', fim: '2026-10-08T10:00', uid: `${Math.random().toString(36).slice(2)}@crm-madia`, ...dados });
  return { icloud, db, eventos, sync, local };
}
const todos = (eventos) => eventos.listar();

describe('sincronizar', () => {
  it('duas vezes seguidas não duplica nem escreve nada no iCloud', async () => {
    const { icloud, eventos, sync } = montar();
    icloud.criarNoIphone(ev('a1', 'Dentista'));
    icloud.criarNoIphone(ev('b1', 'Dentista 2', '2026-10-06T14:00'));
    icloud.criarNoIphone(ev('l1', 'Lembrete'), 'lembretes');
    expect(await sync.sincronizar()).toEqual({ lidos: 2, enviados: 0, conflitos: 0 });
    const ids = todos(eventos).map((e) => e.id);
    expect(todos(eventos).map((e) => [e.uid, e.origem, e.pendente])).toEqual([['a1', 'apple', 0], ['b1', 'apple', 0]]);
    expect(todos(eventos).every((e) => e.href && e.etag)).toBe(true);
    expect(await sync.sincronizar()).toEqual({ lidos: 2, enviados: 0, conflitos: 0 });
    expect(todos(eventos).map((e) => e.id)).toEqual(ids);
    expect(icloud.chamadas('PUT')).toHaveLength(0);
    expect(icloud.chamadas('DELETE')).toHaveLength(0);
  });

  it('evento alterado no iPhone atualiza o mesmo registro e mantém cliente e projeto', async () => {
    const { icloud, db, eventos, sync } = montar();
    const href = icloud.criarNoIphone(ev('a1', 'Dentista'));
    await sync.sincronizar();
    const [antes] = todos(eventos);
    db.prepare("INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES ('Ana', 'x', 'x')").run();
    eventos.atualizar(antes.id, { cliente_id: 1 });
    icloud.alterarNoIphone(href, ev('a1', 'Dentista 15h', '2026-10-05T15:00'));
    icloud.criarNoIphone(ev('c1', 'Novo', '2026-10-07T08:00'));
    await sync.sincronizar();
    expect(todos(eventos).map((e) => [e.uid, e.titulo, e.inicio])).toEqual([['a1', 'Dentista 15h', '2026-10-05T15:00'], ['c1', 'Novo', '2026-10-07T08:00']]);
    expect(eventos.obter(antes.id)).toMatchObject({ cliente_id: 1, etag: expect.not.stringMatching(antes.etag) });
  });

  it('o que sumiu do iCloud: origem apple sai; origem crm fica pendente e sobe de novo', async () => {
    const { icloud, eventos, sync, local } = montar();
    const hrefApple = icloud.criarNoIphone(ev('a1', 'Do iPhone'));
    const meu = local();
    expect(await sync.gravarEvento(meu.id)).toEqual({ estado: 'ok' });
    await sync.sincronizar();
    icloud.removerNoIphone(hrefApple);
    icloud.removerNoIphone(eventos.obter(meu.id).href);

    await sync.sincronizar();
    expect(todos(eventos).map((e) => e.uid)).toEqual([meu.uid]);
    expect(eventos.obter(meu.id)).toMatchObject({ pendente: 1, href: null, etag: null });

    expect(await sync.sincronizar()).toMatchObject({ enviados: 1 });
    expect(eventos.obter(meu.id)).toMatchObject({ pendente: 0, href: expect.stringContaining('.ics') });
    expect(icloud.eventos().size).toBe(1);
  });

  it('não apaga do CRM o que está fora da janela lida', async () => {
    const { eventos, sync } = montar();
    const longe = eventos.criar({ titulo: 'Em 2028', inicio: '2028-01-10T10:00', fim: '2028-01-10T11:00', uid: 'longe', origem: 'apple', href: 'https://x/longe.ics', etag: '"1"' });
    await sync.sincronizar();
    expect(eventos.obter(longe.id)).not.toBeNull();
  });

  it('recorrente semanal vira ocorrências somente leitura, sem duplicar nem subir', async () => {
    const { icloud, eventos, sync } = montar();
    icloud.criarNoIphone(semanal('r1'));
    await sync.sincronizar();
    const primeira = todos(eventos);
    expect(primeira.length).toBeGreaterThan(20);
    expect(primeira.every((e) => e.recorrente === 1 && e.uid.startsWith('r1#') && e.origem === 'apple')).toBe(true);
    await sync.sincronizar();
    expect(todos(eventos)).toHaveLength(primeira.length);
    expect(icloud.chamadas('PUT')).toHaveLength(0);
  });

  it('senha inválida guarda o erro; sucesso limpa o erro e guarda a hora da sincronização', async () => {
    const { icloud, db, sync } = montar();
    definirConfig(db, 'apple_senha', 'errada');
    await expect(sync.sincronizar()).rejects.toMatchObject({ credencial: true });
    expect(obterConfig(db, 'apple_erro')).toBe('Apple ID ou senha de app inválidos.');
    expect(obterConfig(db, 'apple_ultima_sync')).toBeNull();
    definirConfig(db, 'apple_senha', icloud.senha);
    await sync.sincronizar();
    expect(obterConfig(db, 'apple_erro')).toBeFalsy();
    expect(obterConfig(db, 'apple_ultima_sync')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sem conexão configurada não faz nada', async () => {
    const { icloud, db, sync } = montar();
    db.prepare("DELETE FROM config WHERE chave = 'apple_senha'").run();
    await expect(sync.sincronizar()).rejects.toThrow('Apple Calendário não conectado.');
    expect(icloud.requisicoes).toHaveLength(0);
  });
});

describe('vários calendários', () => {
  it('lê todos os calendários de eventos (não o de lembretes) e guarda de qual cada evento veio', async () => {
    const { icloud, db, eventos, sync } = montar();
    icloud.criarNoIphone(ev('a1', 'Reunião'), 'trabalho');
    icloud.criarNoIphone(ev('b1', 'Aniversário', '2026-10-06T14:00'), 'pessoal');
    icloud.criarNoIphone(ev('l1', 'Lembrete'), 'lembretes');
    expect(await sync.sincronizar()).toEqual({ lidos: 2, enviados: 0, conflitos: 0 });
    expect(todos(eventos).map((e) => [e.uid, e.calendario_href])).toEqual([['a1', icloud.calendarioTrabalho], ['b1', icloud.calendarioPessoal]]);
    expect(lerCalendarios(db)).toEqual([
      { href: icloud.calendarioTrabalho, nome: 'Trabalho' },
      { href: icloud.calendarioPessoal, nome: 'Pessoal' },
    ]);
  });

  it('evento novo sobe para o calendário padrão: o Madia Consultoria se existir, senão o primeiro', async () => {
    const { icloud, eventos, sync, local } = montar();
    const a = local();
    await sync.gravarEvento(a.id);
    expect(eventos.obter(a.id).calendario_href).toBe(icloud.calendarioTrabalho);
    expect(icloud.eventosDe(icloud.calendarioTrabalho).size).toBe(1);

    await sync.sincronizar(); // grava a lista dos calendários
    icloud.calendarios.set(`${icloud.CASA}crm/`, { nome: 'Madia Consultoria', componentes: ['VEVENT'], eventos: new Map() });
    await sync.sincronizar();
    const b = local();
    await sync.gravarEvento(b.id);
    expect(eventos.obter(b.id).calendario_href).toBe(`${icloud.CASA}crm/`);
  });

  it('evento criado já apontando para um calendário sobe para ele e a edição continua nele', async () => {
    const { icloud, eventos, sync, local } = montar();
    await sync.sincronizar();
    const meu = local({ calendario_href: icloud.calendarioPessoal });
    await sync.gravarEvento(meu.id);
    expect(icloud.eventosDe(icloud.calendarioPessoal).size).toBe(1);
    expect(icloud.eventosDe(icloud.calendarioTrabalho).size).toBe(0);
    eventos.atualizar(meu.id, { titulo: 'Editado' });
    await sync.gravarEvento(meu.id);
    expect([...icloud.eventosDe(icloud.calendarioPessoal).values()][0].ics).toContain('SUMMARY:Editado');
  });

  it('evento movido de calendário no iPhone muda de calendário no CRM, sem duplicar nem perder o vínculo', async () => {
    const { icloud, db, eventos, sync } = montar();
    const href = icloud.criarNoIphone(ev('a1', 'Reunião'), 'trabalho');
    await sync.sincronizar();
    const [salvo] = todos(eventos);
    db.prepare("INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES ('Ana', 'x', 'x')").run();
    eventos.atualizar(salvo.id, { cliente_id: 1 });
    icloud.removerNoIphone(href);
    icloud.criarNoIphone(ev('a1', 'Reunião'), 'pessoal');
    await sync.sincronizar();
    expect(todos(eventos)).toHaveLength(1);
    expect(eventos.obter(salvo.id)).toMatchObject({ cliente_id: 1, calendario_href: icloud.calendarioPessoal });
  });

  it('calendário que sumiu do iCloud: sai o que veio dele e o que foi criado aqui sobe de novo para o padrão', async () => {
    const { icloud, eventos, sync, local } = montar();
    icloud.criarNoIphone(ev('b1', 'Aniversário'), 'pessoal');
    const meu = local({ calendario_href: icloud.calendarioPessoal });
    await sync.sincronizar();
    await sync.gravarEvento(meu.id);
    icloud.calendarios.delete(icloud.calendarioPessoal);
    await sync.sincronizar();
    expect(todos(eventos).map((e) => e.uid)).toEqual([meu.uid]);
    expect(eventos.obter(meu.id)).toMatchObject({ calendario_href: icloud.calendarioTrabalho, pendente: 0 });
    expect(icloud.eventosDe(icloud.calendarioTrabalho).size).toBe(1);
  });

  it('sem nenhum calendário de eventos na conta o evento fica pendente, sem erro', async () => {
    const { icloud, eventos, sync, local } = montar();
    icloud.calendarios.delete(icloud.calendarioTrabalho);
    icloud.calendarios.delete(icloud.calendarioPessoal);
    const meu = local();
    expect(await sync.gravarEvento(meu.id)).toEqual({ estado: 'sem_calendario' });
    expect(eventos.obter(meu.id).pendente).toBe(1);
    expect(await sync.sincronizar()).toEqual({ lidos: 0, enviados: 0, conflitos: 0 });
  });
});

describe('gravarEvento', () => {
  it('evento novo sobe com If-None-Match e guarda href e etag', async () => {
    const { icloud, eventos, sync, local } = montar();
    const meu = local({ titulo: 'Reunião' });
    expect(await sync.gravarEvento(meu.id)).toEqual({ estado: 'ok' });
    expect(eventos.obter(meu.id)).toMatchObject({ pendente: 0, href: expect.stringContaining('.ics'), etag: expect.stringMatching(/^"v\d+"$/) });
    expect(icloud.chamadas('PUT')[0].headers['If-None-Match']).toBe('*');
    expect(icloud.chamadas('PUT')[0].corpo).toContain('SUMMARY:Reunião');
  });

  it('falha de rede deixa pendente e o próximo sync reenvia', async () => {
    const { icloud, eventos, sync, local } = montar();
    const meu = local();
    icloud.falha.rede = true;
    expect(await sync.gravarEvento(meu.id)).toEqual({ estado: 'rede' });
    expect(eventos.obter(meu.id).pendente).toBe(1);
    icloud.falha.rede = false;
    expect(await sync.sincronizar()).toMatchObject({ enviados: 1, conflitos: 0 });
    expect(eventos.obter(meu.id)).toMatchObject({ pendente: 0 });
    expect(icloud.eventos().size).toBe(1);
  });

  it('conflito de etag (412): vale a versão do iCloud', async () => {
    const { icloud, eventos, sync } = montar();
    const href = icloud.criarNoIphone(ev('a1', 'Original'));
    await sync.sincronizar();
    const [salvo] = todos(eventos);
    eventos.atualizar(salvo.id, { titulo: 'Meu título' });
    icloud.alterarNoIphone(href, ev('a1', 'Título do iPhone'));
    expect(await sync.gravarEvento(salvo.id)).toEqual({ estado: 'conflito' });
    expect(eventos.obter(salvo.id)).toMatchObject({ titulo: 'Título do iPhone', pendente: 0 });
  });

  it('conflito encontrado pelo sync: conta e aplica a versão do iCloud', async () => {
    const { icloud, eventos, sync } = montar();
    const href = icloud.criarNoIphone(ev('a1', 'Original'));
    await sync.sincronizar();
    const [salvo] = todos(eventos);
    eventos.atualizar(salvo.id, { titulo: 'Meu título', pendente: 1 });
    icloud.alterarNoIphone(href, ev('a1', 'iPhone 2'));
    expect(await sync.sincronizar()).toMatchObject({ conflitos: 1 });
    expect(eventos.obter(salvo.id)).toMatchObject({ titulo: 'iPhone 2', pendente: 0 });
  });

  it('edição do evento que veio do iPhone sobe com If-Match', async () => {
    const { icloud, eventos, sync } = montar();
    icloud.criarNoIphone(ev('a1', 'Original'));
    await sync.sincronizar();
    const [salvo] = todos(eventos);
    eventos.atualizar(salvo.id, { titulo: 'Editado no CRM' });
    expect(await sync.gravarEvento(salvo.id)).toEqual({ estado: 'ok' });
    expect(icloud.chamadas('PUT')[0].headers['If-Match']).toBe(salvo.etag);
    expect([...icloud.eventos().values()][0].ics).toContain('SUMMARY:Editado no CRM');
  });

  it('sem conexão configurada não tenta e devolve sem_conexao', async () => {
    const { icloud, db, sync, local } = montar();
    db.prepare("DELETE FROM config WHERE chave = 'apple_senha'").run();
    expect(await sync.gravarEvento(local().id)).toEqual({ estado: 'sem_conexao' });
    expect(icloud.requisicoes).toHaveLength(0);
  });
});

describe('apagarEvento', () => {
  async function comEventoSincronizado() {
    const m = montar();
    const href = m.icloud.criarNoIphone(ev('a1', 'Original'));
    await m.sync.sincronizar();
    const [salvo] = todos(m.eventos);
    return { ...m, href, salvo };
  }

  it('apaga no iCloud com a etag e depois do CRM', async () => {
    const { icloud, eventos, sync, salvo } = await comEventoSincronizado();
    eventos.marcarApagado(salvo.id);
    expect(await sync.apagarEvento(salvo.id)).toEqual({ estado: 'ok' });
    expect(icloud.chamadas('DELETE')[0].headers['If-Match']).toBe(salvo.etag);
    expect(icloud.eventos().size).toBe(0);
    expect(eventos.obter(salvo.id)).toBeNull();
  });

  it('sem internet fica marcado e o próximo sync apaga', async () => {
    const { icloud, eventos, sync, salvo } = await comEventoSincronizado();
    eventos.marcarApagado(salvo.id);
    icloud.falha.rede = true;
    expect(await sync.apagarEvento(salvo.id)).toEqual({ estado: 'rede' });
    expect(eventos.obter(salvo.id).apagado).toBe(1);
    icloud.falha.rede = false;
    await sync.sincronizar();
    expect(eventos.obter(salvo.id)).toBeNull();
    expect(icloud.eventos().size).toBe(0);
  });

  it('já não existe no iCloud: sai do CRM de vez', async () => {
    const { icloud, eventos, sync, salvo, href } = await comEventoSincronizado();
    eventos.marcarApagado(salvo.id);
    icloud.removerNoIphone(href);
    expect(await sync.apagarEvento(salvo.id)).toEqual({ estado: 'ok' });
    expect(eventos.obter(salvo.id)).toBeNull();
  });

  it('alterado no iPhone enquanto isso (412): o evento volta com a versão do iCloud', async () => {
    const { icloud, eventos, sync, salvo, href } = await comEventoSincronizado();
    eventos.marcarApagado(salvo.id);
    icloud.alterarNoIphone(href, ev('a1', 'Mudou no iPhone'));
    expect(await sync.apagarEvento(salvo.id)).toEqual({ estado: 'conflito' });
    expect(eventos.obter(salvo.id)).toMatchObject({ apagado: 0, titulo: 'Mudou no iPhone' });
    expect(icloud.eventos().size).toBe(1);
  });
});
