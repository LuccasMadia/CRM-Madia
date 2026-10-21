import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { definirConfig, obterConfig } from '../repos/config.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-10-21' });
});

const obter = async () => (await ctx.http.get('/api/tabela-precos').expect(200)).body;
const porTipo = (servicos, tipo) => servicos.find((s) => s.tipo === tipo);

describe('/api/tabela-precos', () => {
  it('lista os 9 serviços, o pacote e o desconto; GMN vem da config', async () => {
    definirConfig(ctx.db, 'preco_servico_google_meu_negocio_centavos', '30000');
    const { servicos, pacotes, desconto_combo_pct, contato_whatsapp } = await obter();
    expect(servicos).toHaveLength(9);
    expect(servicos.map((s) => s.ordem)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(porTipo(servicos, 'gmn_config').valor_unico_centavos).toBe(30000);
    expect(pacotes).toHaveLength(1);
    expect(pacotes[0]).toMatchObject({ nome: 'Presença Local' });
    expect(pacotes[0].itens).toHaveLength(3);
    expect(desconto_combo_pct).toBe(10);
    expect(contato_whatsapp).toBeNull();
  });

  it('editar o valor do GMN grava na config e não na linha', async () => {
    const gmn = porTipo((await obter()).servicos, 'gmn_config');
    await ctx.http.put(`/api/tabela-precos/servicos/${gmn.id}`).send({ valor_unico_centavos: 25000 }).expect(200);
    expect(obterConfig(ctx.db, 'preco_servico_google_meu_negocio_centavos')).toBe('25000');
    expect((await ctx.http.get('/api/config').expect(200)).body.preco_servico_google_meu_negocio_centavos).toBe(25000);
    expect(ctx.db.prepare('SELECT valor_unico_centavos AS v FROM tabela_servicos WHERE id = ?').get(gmn.id).v).toBeNull();
    expect(porTipo((await obter()).servicos, 'gmn_config').valor_unico_centavos).toBe(25000);
  });

  it('ignora valores que não valem para placa e GMN', async () => {
    const { servicos } = await obter();
    const placa = porTipo(servicos, 'placa');
    const gmn = porTipo(servicos, 'gmn_config');
    const a = (await ctx.http.put(`/api/tabela-precos/servicos/${placa.id}`)
      .send({ valor_unico_centavos: 999, valor_mensal_centavos: 999, frase: 'Nova' }).expect(200)).body;
    expect(a).toMatchObject({ frase: 'Nova', valor_unico_centavos: null, valor_mensal_centavos: null });
    const b = (await ctx.http.put(`/api/tabela-precos/servicos/${gmn.id}`).send({ valor_mensal_centavos: 999 }).expect(200)).body;
    expect(b.valor_mensal_centavos).toBeNull();
  });

  it('cria, edita, desativa e reordena serviço', async () => {
    const novo = (await ctx.http.post('/api/tabela-precos/servicos')
      .send({ nome: ' Logo ', frase: 'Marca', valor_unico_centavos: 50000, hospedagem: 'nao_se_aplica' }).expect(201)).body;
    expect(novo).toMatchObject({ nome: 'Logo', tipo: 'comum', ordem: 9, ativo: 1, valor_unico_centavos: 50000 });
    await ctx.http.post('/api/tabela-precos/servicos').send({ frase: 'sem nome' }).expect(400);

    const editado = (await ctx.http.put(`/api/tabela-precos/servicos/${novo.id}`)
      .send({ valor_unico_centavos: 70000, ativo: false }).expect(200)).body;
    expect(editado).toMatchObject({ nome: 'Logo', valor_unico_centavos: 70000, ativo: 0 });

    const ids = (await obter()).servicos.map((s) => s.id).reverse();
    await ctx.http.put('/api/tabela-precos/servicos/ordem').send({ ids }).expect(204);
    expect((await obter()).servicos.map((s) => s.id)).toEqual(ids);
    await ctx.http.put('/api/tabela-precos/servicos/ordem').send({ ids: ids.slice(1) }).expect(400);
  });

  it('não apaga serviço usado em orçamento nem os serviços fixos', async () => {
    const { servicos } = await obter();
    const novo = (await ctx.http.post('/api/tabela-precos/servicos').send({ nome: 'Logo', valor_unico_centavos: 100 }).expect(201)).body;
    const cliente = ctx.db.prepare("INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES ('X', 'a', 'a')").run();
    const orc = ctx.db.prepare("INSERT INTO orcamentos (cliente_id, data, criado_em, atualizado_em) VALUES (?, '2026-10-21', 'a', 'a')")
      .run(cliente.lastInsertRowid);
    ctx.db.prepare(
      "INSERT INTO orcamento_itens (orcamento_id, servico_id, nome, ordem, criado_em, atualizado_em) VALUES (?, ?, 'Logo', 0, 'a', 'a')",
    ).run(orc.lastInsertRowid, novo.id);
    const r = await ctx.http.delete(`/api/tabela-precos/servicos/${novo.id}`).expect(409);
    expect(r.body.erro).toBe('Este serviço já foi usado. Desative em vez de apagar.');
    for (const tipo of ['placa', 'gmn_config', 'hospedagem']) {
      await ctx.http.delete(`/api/tabela-precos/servicos/${porTipo(servicos, tipo).id}`).expect(409);
    }
    const livre = (await ctx.http.post('/api/tabela-precos/servicos').send({ nome: 'Livre' }).expect(201)).body;
    await ctx.http.delete(`/api/tabela-precos/servicos/${livre.id}`).expect(204);
    await ctx.http.delete(`/api/tabela-precos/servicos/${livre.id}`).expect(404);
  });

  it('salva pacote com itens e substitui os itens no PUT', async () => {
    const { servicos } = await obter();
    const [a, b] = servicos;
    const criado = (await ctx.http.post('/api/tabela-precos/pacotes')
      .send({ nome: 'Combo', itens: [{ servico_id: a.id, opcional: false, quantidade: 1 }, { servico_id: b.id, opcional: true, quantidade: 2 }] })
      .expect(201)).body;
    expect(criado.itens).toHaveLength(2);
    expect(criado.itens[1]).toMatchObject({ servico_id: b.id, opcional: 1, quantidade: 2 });

    const editado = (await ctx.http.put(`/api/tabela-precos/pacotes/${criado.id}`)
      .send({ nome: 'Combo 2', itens: [{ servico_id: b.id }] }).expect(200)).body;
    expect(editado.nome).toBe('Combo 2');
    expect(editado.itens).toHaveLength(1);
    expect(editado.itens[0]).toMatchObject({ servico_id: b.id, opcional: 0, quantidade: 1 });
    expect((await obter()).pacotes).toHaveLength(2);

    await ctx.http.post('/api/tabela-precos/pacotes').send({ nome: 'Ruim', itens: [{ servico_id: 99999 }] }).expect(400);
    await ctx.http.delete(`/api/tabela-precos/pacotes/${criado.id}`).expect(204);
    await ctx.http.delete(`/api/tabela-precos/pacotes/${criado.id}`).expect(404);
    expect((await obter()).pacotes).toHaveLength(1);
  });

  it('valida desconto entre 0 e 100 e grava o WhatsApp', async () => {
    await ctx.http.put('/api/tabela-precos/config').send({ desconto_combo_pct: 101 }).expect(400);
    await ctx.http.put('/api/tabela-precos/config').send({ desconto_combo_pct: -1 }).expect(400);
    await ctx.http.put('/api/tabela-precos/config').send({ desconto_combo_pct: 15, contato_whatsapp: ' (11) 99999-0000 ' }).expect(200);
    let t = await obter();
    expect(t.desconto_combo_pct).toBe(15);
    expect(t.contato_whatsapp).toBe('(11) 99999-0000');
    await ctx.http.put('/api/tabela-precos/config').send({ contato_whatsapp: '' }).expect(200);
    t = await obter();
    expect(t.contato_whatsapp).toBeNull();
    expect(t.desconto_combo_pct).toBe(15);
    await ctx.http.put('/api/tabela-precos/config').send({ desconto_combo_pct: 0 }).expect(200);
    expect((await obter()).desconto_combo_pct).toBe(0);
  });
});
