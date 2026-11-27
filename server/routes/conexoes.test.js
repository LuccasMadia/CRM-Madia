import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { definirConfig } from '../repos/config.js';
import { somarDias } from '../domain/datas.js';

const HOJE = '2026-09-23';
const dias = (n) => somarDias(HOJE, n);

// fetch falso por serviço: 200, um status (401, 500) ou 'rede'. Supabase responde por token.
function mundo() {
  const estado = { github: 200, figma: 200, vercel: 200, supabase: { sbp_a: 200, sbp_b: 200 } };
  const fetch = async (url, init = {}) => {
    const u = String(url);
    const servico = u.includes('github') ? 'github' : u.includes('figma') ? 'figma' : u.includes('vercel') ? 'vercel' : 'supabase';
    const token = String(init.headers?.Authorization ?? '').replace('Bearer ', '');
    const alvo = servico === 'supabase' ? estado.supabase[token] : estado[servico];
    if (alvo === 'rede') throw new Error('sem internet');
    const corpo = { github: { login: 'lucas' }, figma: { handle: 'lucas' }, vercel: { projects: [] }, supabase: [] }[servico];
    return new Response(alvo === 200 ? JSON.stringify(corpo) : '{}', { status: alvo, headers: { 'Content-Type': 'application/json' } });
  };
  return { estado, fetch };
}

let ctx;
let m;
beforeEach(() => {
  m = mundo();
  ctx = criarContexto({ hoje: HOJE, fetch: m.fetch });
});
const alertas = async () => (await ctx.http.get('/api/conexoes/atencao').expect(200)).body.alertas;
const lista = async (q = '') => (await ctx.http.get(`/api/conexoes${q}`).expect(200)).body;
const conectar = (chave, valor = 'tok_1234567890') => definirConfig(ctx.db, chave, valor);
const contasSupabase = (contas) => definirConfig(ctx.db, 'supabase_contas', JSON.stringify(contas));

describe('GET /conexoes', () => {
  it('sem nenhuma conexão não lista nada e não alerta', async () => {
    expect(await lista()).toEqual([]);
    expect(await alertas()).toEqual([]);
  });

  it('serviço com token válido aparece sem falha e sem alerta', async () => {
    conectar('github_token');
    const [gh] = await lista();
    expect(gh).toMatchObject({ servico: 'github', nome: 'GitHub', falhou: false, validade: null, editavel: true });
    expect(await alertas()).toEqual([]);
  });

  it.each([['github_token', 'GitHub', 'github'], ['figma_token', 'Figma', 'figma'], ['vercel_token', 'Vercel', 'vercel']])('%s com 401 vira "parou de funcionar" (perigo)', async (chave, nome, servico) => {
    conectar(chave);
    m.estado[servico] = 401;
    const a = await alertas();
    expect(a).toEqual([{ codigo: 'token_falhou', tom: 'perigo', texto: `Token do ${nome} parou de funcionar`, para: '/configuracoes' }]);
    expect((await lista())[0]).toMatchObject({ falhou: true, mensagem: expect.stringContaining('inválido') });
  });

  it.each([['rede'], [500]])('falha %s não conta como token ruim', async (falha) => {
    conectar('github_token');
    m.estado.github = falha;
    expect(await alertas()).toEqual([]);
    expect((await lista())[0].falhou).toBe(false);
  });

  it('colar um token novo limpa o alerta de falha logo', async () => {
    conectar('github_token', 'token_velho_123');
    m.estado.github = 401;
    expect(await alertas()).toHaveLength(1);
    m.estado.github = 200;
    conectar('github_token', 'token_novo_4567');
    expect(await alertas()).toEqual([]);
  });

  it('Supabase: só a conta revogada alerta, com o e-mail no texto; a outra segue', async () => {
    contasSupabase([{ id: 1, email: 'ana@exemplo.com', token: 'sbp_a' }, { id: 2, email: 'bia@exemplo.com', token: 'sbp_b' }]);
    m.estado.supabase.sbp_b = 403;
    const a = await alertas();
    expect(a).toEqual([{ codigo: 'token_falhou', tom: 'perigo', texto: 'Token do Supabase (bia@exemplo.com) parou de funcionar', para: '/configuracoes' }]);
    const itens = await lista();
    expect(itens.map((i) => [i.conta, i.falhou])).toEqual([['ana@exemplo.com', false], ['bia@exemplo.com', true]]);
    expect(JSON.stringify(itens)).not.toContain('sbp_');
  });
});

describe('validade', () => {
  it('vence em 5 dias é atenção; hoje diz "vence hoje"; passada é perigo; 30 dias não alerta', async () => {
    conectar('github_token');
    conectar('github_validade', dias(5));
    expect(await alertas()).toEqual([{ codigo: 'token_vence', tom: 'atencao', texto: 'Token do GitHub vence em 5 dias', para: '/configuracoes' }]);
    conectar('github_validade', HOJE);
    expect((await alertas())[0].texto).toBe('Token do GitHub vence hoje');
    conectar('github_validade', dias(-2));
    expect(await alertas()).toEqual([{ codigo: 'token_venceu', tom: 'perigo', texto: 'Token do GitHub venceu há 2 dias', para: '/configuracoes' }]);
    conectar('github_validade', dias(30));
    expect(await alertas()).toEqual([]);
  });

  it('falhou e venceu juntos mostram só o de falha', async () => {
    conectar('figma_token');
    conectar('figma_validade', dias(-1));
    m.estado.figma = 401;
    expect((await alertas()).map((a) => a.codigo)).toEqual(['token_falhou']);
  });

  it('Instagram usa a validade que já existe, sem permitir editar', async () => {
    conectar('instagram_token');
    conectar('instagram_token_expira_em', `${dias(3)}T10:00:00.000Z`);
    const [ig] = await lista();
    expect(ig).toMatchObject({ servico: 'instagram', nome: 'Instagram', editavel: false, validade: dias(3), validade_estado: 'vence', dias: 3 });
    expect(await alertas()).toEqual([{ codigo: 'token_vence', tom: 'atencao', texto: 'Token do Instagram vence em 3 dias', para: '/configuracoes' }]);
  });

  it('Supabase guarda a validade por conta', async () => {
    contasSupabase([{ id: 1, email: 'ana@exemplo.com', token: 'sbp_a' }, { id: 2, email: 'bia@exemplo.com', token: 'sbp_b' }]);
    await ctx.http.put('/api/conexoes/validade').send({ servico: 'supabase', conta_id: 2, validade: dias(2) }).expect(200);
    expect(await alertas()).toEqual([{ codigo: 'token_vence', tom: 'atencao', texto: 'Token do Supabase (bia@exemplo.com) vence em 2 dias', para: '/configuracoes' }]);
  });

  it('conta removida some dos alertas', async () => {
    contasSupabase([{ id: 1, email: 'ana@exemplo.com', token: 'sbp_a', validade: dias(1) }]);
    expect(await alertas()).toHaveLength(1);
    await ctx.http.delete('/api/supabase/contas/1').expect(200);
    expect(await alertas()).toEqual([]);
  });
});

describe('PUT /conexoes/validade', () => {
  it('grava e limpa a validade e devolve a lista', async () => {
    conectar('github_token');
    const res = (await ctx.http.put('/api/conexoes/validade').send({ servico: 'github', validade: dias(20) }).expect(200)).body;
    expect(res[0]).toMatchObject({ servico: 'github', validade: dias(20), validade_estado: 'ok', dias: 20 });
    const limpo = (await ctx.http.put('/api/conexoes/validade').send({ servico: 'github', validade: '' }).expect(200)).body;
    expect(limpo[0].validade).toBeNull();
  });

  it('recusa data inválida, serviço desconhecido, Instagram e conta de Supabase inexistente', async () => {
    conectar('github_token');
    for (const validade of ['2026-02-30', 'abc', '26/11/2026']) {
      const res = await ctx.http.put('/api/conexoes/validade').send({ servico: 'github', validade }).expect(400);
      expect(res.body.erros[0].campo).toBe('validade');
    }
    await ctx.http.put('/api/conexoes/validade').send({ servico: 'gmail', validade: dias(1) }).expect(400);
    const ig = await ctx.http.put('/api/conexoes/validade').send({ servico: 'instagram', validade: dias(1) }).expect(400);
    expect(ig.body.erro).toBe('O Instagram renova a validade sozinho.');
    contasSupabase([{ id: 1, email: 'ana@exemplo.com', token: 'sbp_a' }]);
    await ctx.http.put('/api/conexoes/validade').send({ servico: 'supabase', conta_id: 9, validade: dias(1) }).expect(404);
    await ctx.http.put('/api/conexoes/validade').send({ servico: 'supabase', validade: dias(1) }).expect(404);
  });

  it('serviço não conectado não aceita validade', async () => {
    await ctx.http.put('/api/conexoes/validade').send({ servico: 'figma', validade: dias(5) }).expect(409);
  });
});

describe('backup', () => {
  it('as validades dos tokens ficam fora da cópia', async () => {
    const { copiarBanco } = await import('./backup.js');
    const { DatabaseSync } = await import('node:sqlite');
    const { rmSync } = await import('node:fs');
    conectar('github_validade', dias(5));
    conectar('corte_prazo_dias', '7');
    const copia = copiarBanco(ctx.db);
    try {
      const lida = new DatabaseSync(copia, { readOnly: true });
      const chaves = lida.prepare('SELECT chave FROM config').all().map((r) => r.chave);
      lida.close();
      expect(chaves).not.toContain('github_validade');
      expect(chaves).toContain('corte_prazo_dias');
    } finally {
      rmSync(copia, { force: true });
    }
  });
});
