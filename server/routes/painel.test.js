import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';

describe('GET /api/painel', () => {
  it('monta cartões e próximos 7 dias', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const emAndamento = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site', etapa: 'andamento', prazo_entrega: '2026-09-28',
    })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Proposta', etapa: 'proposta', valor_total_centavos: 80000 });
    const parcelas = `/api/projetos/${emAndamento.id}/parcelas`;
    await ctx.http.post(parcelas).send({ valor_centavos: 1000, vencimento: '2026-09-10' });
    await ctx.http.post(parcelas).send({ valor_centavos: 2000, vencimento: '2026-09-30' });
    await ctx.http.post(`/api/projetos/${emAndamento.id}/tarefas`).send({ texto: 'Revisar', prazo: '2026-09-24' });
    await ctx.http.post('/api/conteudos').send({ titulo: 'Post', canal: 'instagram', tipo: 'post', data_planejada: '2026-09-25' });

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes).toEqual({
      a_receber_mes_centavos: 3000,
      atrasadas: { quantidade: 1, total_centavos: 1000 },
      em_andamento: 1,
      propostas: { quantidade: 1, total_centavos: 80000 },
    });
    expect(res.body.proximos.map((i) => i.tipo)).toEqual(['parcela', 'tarefa', 'conteudo', 'entrega', 'parcela']);
  });
});
