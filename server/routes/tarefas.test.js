import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let projeto;
beforeEach(async () => {
  ctx = criarContexto();
  const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
  projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
});

const url = () => `/api/projetos/${projeto.id}/tarefas`;

describe('tarefas', () => {
  it('cria no fim da lista, conclui e reordena', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' }).expect(201)).body;
    const b = (await ctx.http.post(url()).send({ texto: 'B', prazo: '2026-09-30' }).expect(201)).body;
    expect([a.ordem, b.ordem]).toEqual([0, 1]);

    const concluida = await ctx.http.put(`/api/tarefas/${a.id}`).send({ concluida: true }).expect(200);
    expect(concluida.body.concluida).toBe(1);

    await ctx.http.put(`${url()}/ordem`).send({ ids: [b.id, a.id] }).expect(200);
    expect((await ctx.http.get(url())).body.map((t) => t.texto)).toEqual(['B', 'A']);
  });

  it('recusa reordenação com ids faltando ou de outro projeto', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    await ctx.http.post(url()).send({ texto: 'B' });
    const res = await ctx.http.put(`${url()}/ordem`).send({ ids: [a.id] }).expect(400);
    expect(res.body.erros[0].campo).toBe('ids');
    await ctx.http.put(`${url()}/ordem`).send({}).expect(400);
  });

  it('exige texto e exclui', async () => {
    await ctx.http.post(url()).send({ texto: '' }).expect(400);
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    await ctx.http.delete(`/api/tarefas/${a.id}`).expect(204);
    await ctx.http.delete(`/api/tarefas/${a.id}`).expect(404);
  });
});

describe('tarefas no quadro', () => {
  it('nasce em "a fazer" e a etapa acompanha o concluída nos dois sentidos', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    expect([a.etapa, a.concluida]).toEqual(['a_fazer', 0]);

    const aguardando = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'aguardando_cliente' }).expect(200)).body;
    expect([aguardando.etapa, aguardando.concluida]).toEqual(['aguardando_cliente', 0]);

    const feita = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'concluido' })).body;
    expect(feita.concluida).toBe(1);

    const reaberta = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ concluida: false })).body;
    expect([reaberta.etapa, reaberta.concluida]).toEqual(['a_fazer', 0]);

    await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'fazendo' });
    const soTexto = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ texto: 'A2', concluida: false })).body;
    expect(soTexto.etapa).toBe('fazendo');

    await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'outra' }).expect(400);
    await ctx.http.put('/api/tarefas/999').send({ etapa: 'fazendo' }).expect(404);
  });

  it('ao mudar de coluna vai para o fim dela; sobe e desce só entre as da mesma coluna', async () => {
    const criar = async (texto, etapa) => (await ctx.http.post(url()).send({ texto, etapa })).body;
    const t1 = await criar('T1', 'fazendo');
    const t2 = await criar('T2');
    const t3 = await criar('T3', 'fazendo');
    await criar('T4');

    await ctx.http.put(`/api/tarefas/${t2.id}`).send({ etapa: 'fazendo' });
    const daColuna = async (etapa) => (await ctx.http.get(url())).body.filter((t) => t.etapa === etapa).map((t) => t.texto);
    expect(await daColuna('fazendo')).toEqual(['T1', 'T3', 'T2']);

    await ctx.http.put(`/api/tarefas/${t2.id}/posicao`).send({ direcao: 'cima' }).expect(200);
    expect(await daColuna('fazendo')).toEqual(['T1', 'T2', 'T3']);
    await ctx.http.put(`/api/tarefas/${t1.id}/posicao`).send({ direcao: 'cima' }).expect(200);
    await ctx.http.put(`/api/tarefas/${t3.id}/posicao`).send({ direcao: 'baixo' }).expect(200);
    expect(await daColuna('fazendo')).toEqual(['T1', 'T2', 'T3']);
    expect(await daColuna('a_fazer')).toEqual(['T4']);

    await ctx.http.put(`/api/tarefas/${t1.id}/posicao`).send({ direcao: 'lado' }).expect(400);
    await ctx.http.put('/api/tarefas/999/posicao').send({ direcao: 'cima' }).expect(404);
  });

  it('quadro geral traz o nome do projeto, filtra por projeto e deixa de fora os perdidos', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const outro = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'App' })).body;
    const perdido = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Perdido', etapa: 'perdido' })).body;
    await ctx.http.post(url()).send({ texto: 'Do site' });
    await ctx.http.post(`/api/projetos/${outro.id}/tarefas`).send({ texto: 'Do app', etapa: 'fazendo' });
    await ctx.http.post(`/api/projetos/${perdido.id}/tarefas`).send({ texto: 'Some' });

    const todas = (await ctx.http.get('/api/tarefas').expect(200)).body;
    expect(todas.map((t) => [t.cliente_nome, t.projeto_titulo, t.texto, t.etapa])).toEqual([
      ['Bia', 'App', 'Do app', 'fazendo'],
      ['Ana', 'Site', 'Do site', 'a_fazer'],
    ]);
    const filtradas = (await ctx.http.get(`/api/tarefas?projeto_id=${outro.id}`)).body;
    expect(filtradas.map((t) => t.texto)).toEqual(['Do app']);
  });
});

describe('tarefas internas (sem projeto)', () => {
  it('cria sem projeto, entra no fim das internas e muda de coluna e de posição', async () => {
    const a = (await ctx.http.post('/api/tarefas').send({ texto: 'Testar repo' }).expect(201)).body;
    const b = (await ctx.http.post('/api/tarefas').send({ texto: 'Organizar backup', etapa: 'fazendo' }).expect(201)).body;
    expect([a.projeto_id, a.ordem, a.etapa, b.ordem, b.concluida]).toEqual([null, 0, 'a_fazer', 1, 0]);
    await ctx.http.post('/api/tarefas').send({ texto: '' }).expect(400);

    await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'fazendo' }).expect(200);
    await ctx.http.put(`/api/tarefas/${a.id}/posicao`).send({ direcao: 'cima' }).expect(200);
    const internas = (await ctx.http.get('/api/tarefas?sem_projeto=1')).body;
    expect(internas.map((t) => [t.texto, t.etapa, t.projeto_titulo])).toEqual([
      ['Testar repo', 'fazendo', null],
      ['Organizar backup', 'fazendo', null],
    ]);
  });

  it('aparecem no fim do quadro geral, mas não no filtro de um projeto nem no Início', async () => {
    await ctx.http.post('/api/tarefas').send({ texto: 'Interna' });
    await ctx.http.post(url()).send({ texto: 'Do site' });

    expect((await ctx.http.get('/api/tarefas')).body.map((t) => t.texto)).toEqual(['Do site', 'Interna']);
    expect((await ctx.http.get(`/api/tarefas?projeto_id=${projeto.id}`)).body.map((t) => t.texto)).toEqual(['Do site']);
    const painel = (await ctx.http.get('/api/painel')).body.tarefas_por_projeto;
    expect([...painel.reais, ...painel.ficticios].flatMap((p) => p.tarefas.map((t) => t.texto))).toEqual(['Do site']);
  });
});

describe('tarefa completa', () => {
  it('nasce com o tipo do serviço do projeto, a empresa do projeto e as datas de etapa', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A', descricao: 'Ver com o cliente', prioridade: 'alta' }).expect(201)).body;
    expect(a).toMatchObject({
      tipo: 'site_sistema', cliente_id: projeto.cliente_id, cliente_nome: 'Ana', projeto_titulo: 'Site', prioridade: 'alta',
      descricao: 'Ver com o cliente', tem_descricao: 1, etapa_desde: '2026-09-23', concluida_em: null,
      checklist_total: 0, checklist_feitos: 0, comentarios_total: 0, checklist: [], comentarios: [],
    });
    const interna = (await ctx.http.post('/api/tarefas').send({ texto: 'Testar repo' })).body;
    expect([interna.tipo, interna.prioridade, interna.cliente_id]).toEqual(['interno', 'normal', null]);
    await ctx.http.post('/api/tarefas').send({ texto: 'X', tipo: 'outro' }).expect(400);
    await ctx.http.post('/api/tarefas').send({ texto: 'X', prioridade: 'maxima' }).expect(400);
  });

  it('pode ter só a empresa, sem projeto; com projeto a empresa é sempre a do projeto', async () => {
    const house = (await ctx.http.post('/api/clientes').send({ nome: 'House' })).body;
    const cobrar = (await ctx.http.post('/api/tarefas').send({ texto: 'Receber placa', cliente_id: house.id, tipo: 'cobranca' }).expect(201)).body;
    expect([cobrar.cliente_id, cobrar.cliente_nome, cobrar.projeto_id, cobrar.tipo]).toEqual([house.id, 'House', null, 'cobranca']);

    // ligar ao projeto puxa a empresa do projeto
    const noProjeto = (await ctx.http.put(`/api/tarefas/${cobrar.id}`).send({ projeto_id: projeto.id }).expect(200)).body;
    expect([noProjeto.projeto_id, noProjeto.cliente_id]).toEqual([projeto.id, projeto.cliente_id]);
    // projeto de outra empresa junto com a empresa: recusa
    await ctx.http.put(`/api/tarefas/${cobrar.id}`).send({ projeto_id: projeto.id, cliente_id: house.id }).expect(400);
    // trocar só a empresa tira do projeto
    const trocou = (await ctx.http.put(`/api/tarefas/${cobrar.id}`).send({ cliente_id: house.id }).expect(200)).body;
    expect([trocou.projeto_id, trocou.cliente_id]).toEqual([null, house.id]);
    // na criação dentro do projeto, a empresa mandada é ignorada
    const doProjeto = (await ctx.http.post(url()).send({ texto: 'B', cliente_id: house.id }).expect(201)).body;
    expect(doProjeto.cliente_id).toBe(projeto.cliente_id);
    await ctx.http.post('/api/tarefas').send({ texto: 'C', cliente_id: 999 }).expect(400);
    await ctx.http.post('/api/tarefas').send({ texto: 'C', projeto_id: 999 }).expect(400);

    // projeto que muda de cliente leva a tarefa junto
    await ctx.http.put(`/api/projetos/${projeto.id}`).send({ cliente_id: house.id }).expect(200);
    expect((await ctx.http.get(`/api/tarefas/${doProjeto.id}`)).body.cliente_nome).toBe('House');
  });

  it('guarda desde quando está na etapa e quando foi concluída', async () => {
    let dia = '2026-09-23';
    const c = criarContexto({ hoje: () => dia });
    const ana = (await c.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const p = (await c.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'Site' })).body;
    const a = (await c.http.post(`/api/projetos/${p.id}/tarefas`).send({ texto: 'A' })).body;
    dia = '2026-09-25';
    const aguardando = (await c.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'aguardando_cliente' })).body;
    expect([aguardando.etapa_desde, aguardando.concluida_em]).toEqual(['2026-09-25', null]);
    dia = '2026-09-27';
    // mudar outra coisa não reinicia a contagem
    expect((await c.http.put(`/api/tarefas/${a.id}`).send({ texto: 'A2' })).body.etapa_desde).toBe('2026-09-25');
    const feita = (await c.http.put(`/api/tarefas/${a.id}`).send({ concluida: true })).body;
    expect([feita.etapa, feita.etapa_desde, feita.concluida_em]).toEqual(['concluido', '2026-09-27', '2026-09-27']);
    const reaberta = (await c.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'fazendo' })).body;
    expect(reaberta.concluida_em).toBeNull();
  });

  it('filtra por empresa, tipo, prioridade e sem projeto, e traz as contagens', async () => {
    const house = (await ctx.http.post('/api/clientes').send({ nome: 'House' })).body;
    const a = (await ctx.http.post(url()).send({ texto: 'Do site', prioridade: 'urgente', descricao: '  ' })).body;
    await ctx.http.post('/api/tarefas').send({ texto: 'Cobrar House', cliente_id: house.id, tipo: 'cobranca' });
    await ctx.http.post('/api/tarefas').send({ texto: 'Interna' });
    await ctx.http.post(`/api/tarefas/${a.id}/checklist`).send({ texto: 'Um' });
    const dois = (await ctx.http.post(`/api/tarefas/${a.id}/checklist`).send({ texto: 'Dois' })).body;
    await ctx.http.put(`/api/tarefas/checklist/${dois.id}`).send({ feito: true });
    await ctx.http.post(`/api/tarefas/${a.id}/comentarios`).send({ texto: 'Falei com a Ana' });

    const textos = async (q) => (await ctx.http.get(`/api/tarefas${q}`).expect(200)).body.map((t) => t.texto);
    expect(await textos(`?cliente_id=${house.id}`)).toEqual(['Cobrar House']);
    expect(await textos('?tipo=cobranca')).toEqual(['Cobrar House']);
    expect(await textos('?tipo=interno')).toEqual(['Interna']);
    expect(await textos('?prioridade=urgente')).toEqual(['Do site']);
    expect(await textos('?sem_projeto=1')).toEqual(['Cobrar House', 'Interna']);
    expect(await textos(`?sem_projeto=1&cliente_id=${house.id}`)).toEqual(['Cobrar House']);
    await ctx.http.get('/api/tarefas?tipo=outro').expect(400);
    await ctx.http.get('/api/tarefas?prioridade=outra').expect(400);

    const doSite = (await ctx.http.get('/api/tarefas')).body.find((t) => t.id === a.id);
    // descrição só com espaços não conta
    expect(doSite).toMatchObject({ checklist_total: 2, checklist_feitos: 1, comentarios_total: 1, tem_descricao: 0 });
  });

  it('checklist: cria no fim, marca, renomeia, reordena e apaga', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    const um = (await ctx.http.post(`/api/tarefas/${a.id}/checklist`).send({ texto: 'Um' }).expect(201)).body;
    const dois = (await ctx.http.post(`/api/tarefas/${a.id}/checklist`).send({ texto: 'Dois' }).expect(201)).body;
    expect([um.ordem, dois.ordem, um.feito]).toEqual([0, 1, 0]);
    await ctx.http.post(`/api/tarefas/${a.id}/checklist`).send({ texto: '' }).expect(400);

    expect((await ctx.http.put(`/api/tarefas/checklist/${um.id}`).send({ feito: true }).expect(200)).body.feito).toBe(1);
    expect((await ctx.http.put(`/api/tarefas/checklist/${um.id}`).send({ texto: 'Um!' })).body).toMatchObject({ texto: 'Um!', feito: 1 });
    await ctx.http.put(`/api/tarefas/checklist/${um.id}`).send({ texto: '' }).expect(400);

    const reordenado = (await ctx.http.put(`/api/tarefas/${a.id}/checklist/ordem`).send({ ids: [dois.id, um.id] }).expect(200)).body;
    expect(reordenado.map((i) => i.texto)).toEqual(['Dois', 'Um!']);
    await ctx.http.put(`/api/tarefas/${a.id}/checklist/ordem`).send({ ids: [dois.id] }).expect(400);

    await ctx.http.delete(`/api/tarefas/checklist/${dois.id}`).expect(204);
    await ctx.http.delete(`/api/tarefas/checklist/${dois.id}`).expect(404);
    expect((await ctx.http.get(`/api/tarefas/${a.id}`)).body.checklist.map((i) => i.texto)).toEqual(['Um!']);
  });

  it('comentários: linha do tempo do mais antigo para o mais novo, e dá para apagar', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    const c1 = (await ctx.http.post(`/api/tarefas/${a.id}/comentarios`).send({ texto: 'Mandei o orçamento' }).expect(201)).body;
    await ctx.http.post(`/api/tarefas/${a.id}/comentarios`).send({ texto: 'Ele respondeu' });
    await ctx.http.post(`/api/tarefas/${a.id}/comentarios`).send({ texto: ' ' }).expect(400);
    await ctx.http.post('/api/tarefas/999/comentarios').send({ texto: 'X' }).expect(404);
    expect(c1.criado_em).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const detalhe = (await ctx.http.get(`/api/tarefas/${a.id}`).expect(200)).body;
    expect(detalhe.comentarios.map((c) => c.texto)).toEqual(['Mandei o orçamento', 'Ele respondeu']);
    await ctx.http.delete(`/api/tarefas/comentarios/${c1.id}`).expect(204);
    await ctx.http.delete(`/api/tarefas/comentarios/${c1.id}`).expect(404);
    expect((await ctx.http.get(`/api/tarefas/${a.id}`)).body.comentarios.map((c) => c.texto)).toEqual(['Ele respondeu']);
    await ctx.http.get('/api/tarefas/999').expect(404);
  });
});
