import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

const criarCliente = async (nome) => (await ctx.http.post('/api/clientes').send({ nome }).expect(201)).body;
const criarLoja = async (clienteId, dados) => (await ctx.http.post(`/api/clientes/${clienteId}/lojas`).send(dados).expect(201)).body;

describe('lojas do cliente', () => {
  it('cadastra, edita e remove lojas; responsável é opcional', async () => {
    const fotcell = await criarCliente('Fotcell');
    await criarLoja(fotcell.id, { nome: 'Vila Alegre', responsavel: 'Martins' });
    let lojas = await criarLoja(fotcell.id, { nome: 'Centro' });
    expect(lojas.map((l) => [l.nome, l.responsavel])).toEqual([['Centro', null], ['Vila Alegre', 'Martins']]);
    await ctx.http.post(`/api/clientes/${fotcell.id}/lojas`).send({ responsavel: 'x' }).expect(400);

    lojas = (await ctx.http.put(`/api/clientes/${fotcell.id}/lojas/${lojas[0].id}`).send({ responsavel: 'Ana' }).expect(200)).body;
    expect(lojas[0]).toMatchObject({ nome: 'Centro', responsavel: 'Ana' });
    expect((await ctx.http.get(`/api/clientes/${fotcell.id}`).expect(200)).body.lojas).toHaveLength(2);

    // loja de outro cliente não é encontrada por este
    const outro = await criarCliente('Outro');
    await ctx.http.delete(`/api/clientes/${outro.id}/lojas/${lojas[0].id}`).expect(404);
    lojas = (await ctx.http.delete(`/api/clientes/${fotcell.id}/lojas/${lojas[0].id}`).expect(200)).body;
    expect(lojas.map((l) => l.nome)).toEqual(['Vila Alegre']);
  });

  it('perfil do Google fica na loja; loja de outro cliente é recusada; apagar a loja mantém o perfil', async () => {
    const fotcell = await criarCliente('Fotcell');
    const outro = await criarCliente('Outro');
    const [vila] = await criarLoja(fotcell.id, { nome: 'Vila Alegre' });
    const [deOutro] = await criarLoja(outro.id, { nome: 'Loja do outro' });
    const gmn = { cliente_id: fotcell.id, titulo: 'GMN', servico: 'google_meu_negocio' };

    await ctx.http.post('/api/projetos').send({ ...gmn, loja_id: deOutro.id }).expect(400);
    const projeto = (await ctx.http.post('/api/projetos').send({ ...gmn, loja_id: vila.id }).expect(201)).body;
    expect(projeto).toMatchObject({ loja_id: vila.id, loja_nome: 'Vila Alegre' });
    await ctx.http.put(`/api/projetos/${projeto.id}`).send({ loja_id: deOutro.id }).expect(400);

    // trocar de cliente sem escolher loja solta a loja antiga
    const movido = (await ctx.http.put(`/api/projetos/${projeto.id}`).send({ cliente_id: outro.id }).expect(200)).body;
    expect(movido.loja_id).toBeNull();
    await ctx.http.put(`/api/projetos/${projeto.id}`).send({ cliente_id: fotcell.id, loja_id: vila.id }).expect(200);

    await ctx.http.delete(`/api/clientes/${fotcell.id}/lojas/${vila.id}`).expect(200);
    const depois = (await ctx.http.get(`/api/projetos/${projeto.id}`).expect(200)).body;
    expect(depois).toMatchObject({ cliente_id: fotcell.id, loja_id: null, loja_nome: null });
  });
});
