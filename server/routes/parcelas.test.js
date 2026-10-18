import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let projeto;
beforeEach(async () => {
  ctx = criarContexto({ hoje: '2026-09-23' });
  const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
  projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', valor_total_centavos: 10000 })).body;
});

const nova = (dados) => ctx.http.post(`/api/projetos/${projeto.id}/parcelas`).send(dados);

describe('parcelas', () => {
  it('cria, lista com estado e resumo', async () => {
    await nova({ descricao: 'Entrada', valor_centavos: 5000, vencimento: '2026-09-10' }).expect(201);
    await nova({ descricao: 'Final', valor_centavos: 3000, vencimento: '2026-10-10' }).expect(201);
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.estado)).toEqual(['atrasada', 'pendente']);
    expect(res.body.resumo).toMatchObject({ atrasado_centavos: 5000, pendente_centavos: 3000, nao_parcelado_centavos: 2000 });
  });

  it('valida valor positivo e vencimento', async () => {
    const res = await nova({ valor_centavos: 0 }).expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['valor_centavos', 'vencimento']);
  });

  it('marca como paga e desfaz', async () => {
    const p = (await nova({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    expect((await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: '2026-09-23' }).expect(200)).body.estado).toBe('paga');
    expect((await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: null }).expect(200)).body.estado).toBe('atrasada');
  });

  it('lista geral filtra por estado e mês', async () => {
    await nova({ valor_centavos: 5000, vencimento: '2026-09-10' });
    await nova({ valor_centavos: 3000, vencimento: '2026-10-10' });
    const atrasadas = await ctx.http.get('/api/parcelas?estado=atrasada').expect(200);
    expect(atrasadas.body).toHaveLength(1);
    expect(atrasadas.body[0]).toMatchObject({ projeto_titulo: 'Site', cliente_nome: 'Ana' });
    expect((await ctx.http.get('/api/parcelas?mes=2026-10').expect(200)).body).toHaveLength(1);
    await ctx.http.get('/api/parcelas?mes=outubro').expect(400);
  });

  it('financeiro mensal soma o recebido', async () => {
    const p = (await nova({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: '2026-09-15' });
    const res = await ctx.http.get('/api/financeiro/mensal?ano=2026').expect(200);
    expect(res.body[8]).toEqual({ mes: '2026-09', recebido_centavos: 5000 });
  });

  it('exclui e 404 em projeto inexistente', async () => {
    const p = (await nova({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    await ctx.http.delete(`/api/parcelas/${p.id}`).expect(204);
    await ctx.http.get('/api/projetos/999/parcelas').expect(404);
  });

  it('ignora projeto fictício na lista geral e no financeiro mensal', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const ficticio = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Case fictício', ficticio: true })).body;
    const p = (await ctx.http.post(`/api/projetos/${ficticio.id}/parcelas`).send({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: '2026-09-15' });

    const lista = await ctx.http.get('/api/parcelas').expect(200);
    expect(lista.body.some((x) => x.projeto_id === ficticio.id)).toBe(false);

    const mensal = await ctx.http.get('/api/financeiro/mensal?ano=2026').expect(200);
    expect(mensal.body[8]).toEqual({ mes: '2026-09', recebido_centavos: 0 });

    const doProjeto = await ctx.http.get(`/api/projetos/${ficticio.id}/parcelas`).expect(200);
    expect(doProjeto.body.parcelas).toHaveLength(1);
  });
});

describe('parcelamento em lote', () => {
  it('gera N parcelas mensais com descrição numerada', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 3, valor_centavos: 50000, primeira_vencimento: '2026-04-10' })
      .expect(201);
    expect(res.body.map((p) => [p.descricao, p.vencimento, p.valor_centavos, p.estado])).toEqual([
      ['Parcela 1/3', '2026-04-10', 50000, 'atrasada'],
      ['Parcela 2/3', '2026-05-10', 50000, 'atrasada'],
      ['Parcela 3/3', '2026-06-10', 50000, 'atrasada'],
    ]);
    const lista = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(lista.body.parcelas).toHaveLength(3);
  });

  it('ajusta parcelas para o fim do mês quando o dia não existe', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 2, valor_centavos: 10000, primeira_vencimento: '2026-01-31' })
      .expect(201);
    expect(res.body.map((p) => p.vencimento)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('valida quantidade, valor e data', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 0, valor_centavos: 0, primeira_vencimento: 'x' })
      .expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['primeira_vencimento', 'quantidade', 'valor_centavos']);
  });

  it('rejeita quantidade acima do limite', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 61, valor_centavos: 100, primeira_vencimento: '2026-04-10' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'quantidade', mensagem: 'Deve ser no máximo 60' }]);
  });

  it('404 em projeto inexistente', async () => {
    await ctx.http
      .post('/api/projetos/999/parcelas/lote')
      .send({ quantidade: 1, valor_centavos: 100, primeira_vencimento: '2026-04-10' })
      .expect(404);
  });
});

describe('mensalidade automática', () => {
  async function ativarMensalidade(valor = 20000, dia = 10, inicio = '2026-09-10') {
    await ctx.http
      .put(`/api/projetos/${projeto.id}`)
      .send({
        mensalidade_ativa: true, mensalidade_valor_centavos: valor, mensalidade_dia_vencimento: dia,
        mensalidade_inicio_modo: 'data', mensalidade_inicio_data: inicio,
      })
      .expect(200);
  }

  it('gera a parcela do mês atual na primeira consulta e não duplica', async () => {
    await ativarMensalidade();
    const res1 = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res1.body.parcelas).toHaveLength(1);
    expect(res1.body.parcelas[0]).toMatchObject({ descricao: 'Mensalidade', valor_centavos: 20000, vencimento: '2026-09-10' });
    const res2 = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res2.body.parcelas).toHaveLength(1);
  });

  it('preenche os meses que ficaram para trás, começando na data do gatilho', async () => {
    await ativarMensalidade(20000, 10, '2026-07-20');
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.vencimento)).toEqual(['2026-07-20', '2026-08-10', '2026-09-10']);
  });

  it('mês que já tem mensalidade (mesmo em outro dia) não ganha outra; nada é apagado ao mudar o início', async () => {
    await ctx.http.post(`/api/projetos/${projeto.id}/parcelas`).send({ valor_centavos: 20000, vencimento: '2026-08-03' }).expect(201);
    ctx.db.prepare('UPDATE parcelas SET mensalidade = 1 WHERE projeto_id = ?').run(projeto.id);
    await ativarMensalidade(20000, 10, '2026-07-20');
    await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    await ativarMensalidade(20000, 10, '2026-09-01');
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.vencimento)).toEqual(['2026-07-20', '2026-08-03', '2026-09-10']);
  });

  it('antecipar o início preenche só os meses novos, sem mexer nos que já existem', async () => {
    await ativarMensalidade(20000, 10, '2026-08-10');
    const antes = (await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200)).body.parcelas;
    expect(antes.map((p) => p.vencimento)).toEqual(['2026-08-10', '2026-09-10']);
    await ativarMensalidade(20000, 10, '2026-06-15');
    const depois = (await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200)).body.parcelas;
    expect(depois.map((p) => p.vencimento)).toEqual(['2026-06-15', '2026-07-10', '2026-08-10', '2026-09-10']);
    expect(depois.filter((p) => ['2026-08-10', '2026-09-10'].includes(p.vencimento)).map((p) => p.id))
      .toEqual(antes.map((p) => p.id));
  });

  describe('pausar e retomar a mensalidade de um site', () => {
    let dia;
    let ctxPausa;
    let site;
    const mensal = { mensalidade_valor_centavos: 20000, mensalidade_dia_vencimento: 5 };
    // Corpo igual ao que a Visão geral envia: sempre manda o modo e a data guardados.
    const comoATela = (ativa) => ({
      ...mensal, mensalidade_ativa: ativa, mensalidade_dia_vencimento: ativa ? 5 : null,
      mensalidade_inicio_modo: 'entrega', mensalidade_inicio_data: null,
    });
    const vencimentos = async () => (await ctxPausa.http.get(`/api/projetos/${site.id}/parcelas`).expect(200)).body.parcelas.map((p) => p.vencimento);

    beforeEach(async () => {
      dia = '2026-06-20';
      ctxPausa = criarContexto({ hoje: () => dia });
      const cli = (await ctxPausa.http.post('/api/clientes').send({ nome: 'Ana' })).body;
      site = (await ctxPausa.http.post('/api/projetos').send({ cliente_id: cli.id, titulo: 'Site', data_entrega: '2026-06-05' })).body;
      await ctxPausa.http.put(`/api/projetos/${site.id}`).send(comoATela(true)).expect(200);
      expect(await vencimentos()).toEqual(['2026-06-05']);
      await ctxPausa.http.put(`/api/projetos/${site.id}`).send(comoATela(false)).expect(200);
      dia = '2026-09-23';
    });

    it('retomar pela tela não cobra os meses pausados: volta a cobrar a partir de hoje', async () => {
      const res = await ctxPausa.http.put(`/api/projetos/${site.id}`).send(comoATela(true)).expect(200);
      expect(res.body).toMatchObject({ mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-09-23' });
      expect(await vencimentos()).toEqual(['2026-06-05', '2026-09-23']);
    });

    it('retomar sem mandar o modo também começa hoje', async () => {
      await ctxPausa.http.put(`/api/projetos/${site.id}`).send({ ...mensal, mensalidade_ativa: true }).expect(200);
      expect(await vencimentos()).toEqual(['2026-06-05', '2026-09-23']);
    });

    it('retomar escolhendo outro início respeita a escolha', async () => {
      await ctxPausa.http.put(`/api/projetos/${site.id}`)
        .send({ ...mensal, mensalidade_ativa: true, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-08-05' }).expect(200);
      expect(await vencimentos()).toEqual(['2026-06-05', '2026-08-05', '2026-09-05']);
    });
  });

  it('ligar pela primeira vez num site entregue começa na entrega', async () => {
    await ctx.http.put(`/api/projetos/${projeto.id}`).send({ data_entrega: '2026-08-05' }).expect(200);
    const res = await ctx.http.put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 100, mensalidade_dia_vencimento: 5, mensalidade_inicio_modo: 'entrega' })
      .expect(200);
    expect(res.body).toMatchObject({ mensalidade_inicio_modo: 'entrega' });
    expect((await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`)).body.parcelas.map((p) => p.vencimento)).toEqual(['2026-08-05', '2026-09-05']);
  });

  it('modo entrega sem data de entrega ainda não cobra', async () => {
    await ctx.http.put(`/api/projetos/${projeto.id}`)
      .send({ mensalidade_ativa: true, mensalidade_valor_centavos: 100, mensalidade_dia_vencimento: 5, mensalidade_inicio_modo: 'entrega' })
      .expect(200);
    expect((await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`)).body.parcelas).toEqual([]);
  });

  it('o Financeiro gera as mensalidades sem abrir o projeto', async () => {
    await ativarMensalidade();
    const lista = (await ctx.http.get('/api/parcelas').expect(200)).body;
    expect(lista.filter((p) => p.projeto_id === projeto.id).map((p) => p.vencimento)).toEqual(['2026-09-10']);
  });

  it('não gera quando a mensalidade está desativada', async () => {
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas).toHaveLength(0);
  });

  it('desativar para de gerar novas parcelas, mas mantém as já criadas', async () => {
    await ativarMensalidade();
    await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    await ctx.http.put(`/api/projetos/${projeto.id}`).send({ mensalidade_ativa: false }).expect(200);
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas).toHaveLength(1);
  });

  it('ajusta o dia de vencimento para o fim de um mês curto', async () => {
    const ctxFevereiro = criarContexto({ hoje: '2026-02-15' });
    const cli = (await ctxFevereiro.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const proj = (await ctxFevereiro.http.post('/api/projetos').send({ cliente_id: cli.id, titulo: 'App' })).body;
    await ctxFevereiro.http
      .put(`/api/projetos/${proj.id}`)
      .send({
        mensalidade_ativa: true, mensalidade_valor_centavos: 10000, mensalidade_dia_vencimento: 31,
        mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-01-31',
      })
      .expect(200);
    const res = await ctxFevereiro.http.get(`/api/projetos/${proj.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.vencimento)).toEqual(['2026-01-31', '2026-02-28']);
  });
});

describe('GET /api/parcelas por serviço', () => {
  it('inclui servico e cliente_id e filtra por ?servico=', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const site = (await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'Site' })).body;
    await ctx.http.post(`/api/projetos/${site.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-10-01' });
    await ctx.http.post('/api/projetos').send({
      cliente_id: ana.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', valor_total_centavos: 2000, vencimento: '2026-10-02',
    }).expect(201);

    const todas = (await ctx.http.get('/api/parcelas').expect(200)).body;
    expect(todas.map((p) => [p.servico, p.cliente_id])).toEqual([['site_sistema', ana.id], ['google_meu_negocio', ana.id]]);
    const gmn = (await ctx.http.get('/api/parcelas?servico=google_meu_negocio').expect(200)).body;
    expect(gmn.map((p) => p.valor_centavos)).toEqual([2000]);
    await ctx.http.get('/api/parcelas?servico=nada').expect(400);
  });
});
