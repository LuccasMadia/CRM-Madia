import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';

describe('agenda (ICS)', () => {
  it('liga, serve tarefas e parcelas abertas e deixa de servir ao desligar ou regenerar', async () => {
    const { db, http, app } = criarContexto();
    db.prepare("INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, 'Padaria; Doce', 'x', 'x')").run();
    db.prepare("INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (1, 1, 'Site', 'x', 'x')").run();
    db.prepare("INSERT INTO tarefas (projeto_id, cliente_id, texto, prazo, criado_em, atualizado_em) VALUES (1, 1, 'Ligar, hoje', '2026-10-05', 'x', 'x')").run();
    db.prepare("INSERT INTO tarefas (projeto_id, cliente_id, texto, prazo, etapa, concluida, criado_em, atualizado_em) VALUES (1, 1, 'Feita', '2026-10-06', 'concluido', 1, 'x', 'x')").run();
    db.prepare("INSERT INTO parcelas (projeto_id, valor_centavos, vencimento, criado_em, atualizado_em) VALUES (1, 50000, '2026-10-10', 'x', 'x')").run();

    expect((await http.get('/api/agenda')).body).toEqual({ ativo: false, url: null });
    const { url } = (await http.post('/api/agenda')).body;
    const caminho = new URL(url).pathname;
    const r = await http.get(caminho).set('Host', 'crm.luccasmadia.com.br');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/calendar/);
    expect(r.text).toContain(String.raw`SUMMARY:Ligar\, hoje`);
    expect(r.text).toContain('DTSTART;VALUE=DATE:20261005');
    expect(r.text).toContain('SUMMARY:Receber');
    expect(r.text).not.toContain('Feita');

    await http.post('/api/agenda'); // link novo invalida o antigo
    expect((await http.get(caminho)).status).toBe(404);
    await http.delete('/api/agenda');
    expect((await http.get('/api/agenda')).body.ativo).toBe(false);
    void app;
  });
});
