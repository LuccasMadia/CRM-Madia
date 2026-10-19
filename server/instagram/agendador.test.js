import { describe, it, expect, vi } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { ErroHttp, ErroValidacao } from '../http/erros.js';
import { verificarAgendados } from './agendador.js';

const AGORA = new Date('2026-10-19T12:00:00.000Z');
const ha = (minutos) => new Date(AGORA.getTime() - minutos * 60_000).toISOString();

function criarAgendado(db, { estado = 'agendado', agendadoPara }) {
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO conteudos (tipo, titulo, estado, agendado_para, criado_em, atualizado_em) VALUES ('post', 'T', ?, ?, 'x', 'x')",
    )
    .run(estado, agendadoPara);
  return Number(lastInsertRowid);
}

const linha = (db, id) => db.prepare('SELECT estado, publicacao_erro FROM conteudos WHERE id = ?').get(id);

function preparar(publicador) {
  const { db } = criarContexto({ publicador });
  return db;
}

describe('verificarAgendados', () => {
  it('chama iniciar para quem passou do horário dentro da tolerância', () => {
    const publicador = { iniciar: vi.fn() };
    const db = preparar(publicador);
    const id = criarAgendado(db, { agendadoPara: ha(2) });

    verificarAgendados({ db, agora: AGORA, publicador });

    expect(publicador.iniciar).toHaveBeenCalledWith(id);
    expect(linha(db, id).estado).toBe('agendado');
  });

  it('chama iniciar quando o atraso é exatamente a tolerância', () => {
    const publicador = { iniciar: vi.fn() };
    const db = preparar(publicador);
    const id = criarAgendado(db, { agendadoPara: ha(10) });

    verificarAgendados({ db, agora: AGORA, publicador });

    expect(publicador.iniciar).toHaveBeenCalledWith(id);
  });

  it('marca como atrasado quem passou da tolerância e não chama iniciar', () => {
    const publicador = { iniciar: vi.fn() };
    const db = preparar(publicador);
    const id = criarAgendado(db, { agendadoPara: ha(11) });

    verificarAgendados({ db, agora: AGORA, publicador });

    expect(linha(db, id).estado).toBe('atrasado');
    expect(publicador.iniciar).not.toHaveBeenCalled();
  });

  it('não mexe em agendado no futuro', () => {
    const publicador = { iniciar: vi.fn() };
    const db = preparar(publicador);
    const id = criarAgendado(db, { agendadoPara: new Date(AGORA.getTime() + 60_000).toISOString() });

    verificarAgendados({ db, agora: AGORA, publicador });

    expect(linha(db, id).estado).toBe('agendado');
    expect(publicador.iniciar).not.toHaveBeenCalled();
  });

  it('ignora posts que não estão agendados, mesmo com horário passado', () => {
    const publicador = { iniciar: vi.fn() };
    const db = preparar(publicador);
    const id = criarAgendado(db, { estado: 'pronto', agendadoPara: ha(2) });

    verificarAgendados({ db, agora: AGORA, publicador });

    expect(linha(db, id).estado).toBe('pronto');
    expect(publicador.iniciar).not.toHaveBeenCalled();
  });

  it('engole 409 sem propagar', () => {
    const publicador = { iniciar: vi.fn(() => { throw new ErroHttp(409, 'ocupado'); }) };
    const db = preparar(publicador);
    criarAgendado(db, { agendadoPara: ha(2) });

    expect(() => verificarAgendados({ db, agora: AGORA, publicador })).not.toThrow();
  });

  it('marca como falhou com as mensagens de validação quando o post não é mais válido', () => {
    const publicador = {
      iniciar: vi.fn(() => {
        throw new ErroValidacao([
          { campo: 'publicacao', mensagem: 'Falta a mídia.' },
          { campo: 'publicacao', mensagem: 'Legenda longa demais.' },
        ]);
      }),
    };
    const db = preparar(publicador);
    const id = criarAgendado(db, { agendadoPara: ha(2) });

    verificarAgendados({ db, agora: AGORA, publicador });

    expect(linha(db, id)).toEqual({ estado: 'falhou', publicacao_erro: 'Falta a mídia. Legenda longa demais.' });
  });

  it('erro inesperado vai para o log e não impede os próximos posts', () => {
    const erro = new Error('banco caiu');
    const publicador = {
      iniciar: vi.fn((id) => {
        if (id === 1) throw erro;
      }),
    };
    const db = preparar(publicador);
    criarAgendado(db, { agendadoPara: ha(2) });
    const segundo = criarAgendado(db, { agendadoPara: ha(3) });
    const log = vi.fn();

    verificarAgendados({ db, agora: AGORA, publicador, log });

    expect(log).toHaveBeenCalledWith(erro);
    expect(publicador.iniciar).toHaveBeenCalledWith(segundo);
  });
});
