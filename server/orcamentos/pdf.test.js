import { describe, it, expect } from 'vitest';
import { modeloDocumento, gerarPdf } from './pdf.js';

const norm = (v) => JSON.parse(JSON.stringify(v).replace(/\u00a0|\u202f/g, ' '));

const filinto = {
  numero: 7, data: '2026-10-21', validade_dias: 15, pagamento: 'a combinar', prazo: 'a combinar',
  observacao: null, desconto_pct: 10, cliente_nome: 'Filinto Sorvetes',
  itens: [
    { nome: 'Placa NFC de avaliação', frase: 'Encosta o celular e abre a avaliação no Google', quantidade: 1, valor_unico_centavos: 8000, valor_mensal_centavos: 0 },
    { nome: 'Configuração do Google Meu Negócio', frase: 'Perfil completo no Google Maps, com fotos, horários e categorias', quantidade: 1, valor_unico_centavos: 25000, valor_mensal_centavos: 0 },
    { nome: 'Cardápio digital B2B', frase: 'Catálogo para revendedores, com pedido pelo WhatsApp', quantidade: 1, valor_unico_centavos: 150000, valor_mensal_centavos: 0 },
  ],
  totais: {
    subtotal_unico_centavos: 183000 + 0, desconto_centavos: 18300, total_unico_centavos: 164700,
    mensalidades: [{ nome: 'Hospedagem e suporte do cardápio', valor_centavos: 15000 }], total_mensal_centavos: 15000,
  },
};

describe('modeloDocumento', () => {
  it('modelo do Filinto', () => {
    const m = norm(modeloDocumento(filinto, { whatsapp: null }));
    expect(m).toEqual({
      cabecalho: {
        marca: 'Madia Consultoria', sub: 'por Luccas Madia · luccasmadia.com.br',
        numero: 'Orçamento nº 007', data: '21/10/2026', validade: 'Válido por 15 dias',
      },
      para: 'Filinto Sorvetes',
      itens: [
        { nome: 'Placa NFC de avaliação', frase: 'Encosta o celular e abre a avaliação no Google', valor: 'R$ 80,00' },
        { nome: 'Configuração do Google Meu Negócio', frase: 'Perfil completo no Google Maps, com fotos, horários e categorias', valor: 'R$ 250,00' },
        { nome: 'Cardápio digital B2B', frase: 'Catálogo para revendedores, com pedido pelo WhatsApp', valor: 'R$ 1.500,00' },
      ],
      desconto: { rotulo: 'Desconto combo (10%)', valor: '- R$ 183,00' },
      total_unico: 'R$ 1.647,00',
      mensalidades: [{ nome: 'Hospedagem e suporte do cardápio', valor: 'R$ 150,00/mês' }],
      rodape: ['Forma de pagamento: a combinar · Prazo: a combinar', '@madia.consultoria'],
    });
  });

  it('sem desconto e só mensalidade', () => {
    const m = norm(modeloDocumento({
      ...filinto,
      itens: [{ nome: 'Hospedagem', frase: '', quantidade: 1, valor_unico_centavos: 0, valor_mensal_centavos: 15000 }],
      totais: { subtotal_unico_centavos: 0, desconto_centavos: 0, total_unico_centavos: 0, mensalidades: [{ nome: 'Hospedagem', valor_centavos: 15000 }], total_mensal_centavos: 15000 },
    }, { whatsapp: '(11) 99999-0000' }));
    expect(m.desconto).toBeNull();
    expect(m.total_unico).toBe('R$ 0,00');
    expect(m.itens[0].valor).toBe('R$ 150,00/mês');
    expect(m.rodape[1]).toBe('WhatsApp (11) 99999-0000 · @madia.consultoria');
  });

  it('placa × 3, observação e rodapé sem WhatsApp', () => {
    const m = norm(modeloDocumento({
      ...filinto, observacao: 'Entrega em 5 dias',
      itens: [{ nome: 'Placa NFC', frase: 'x', quantidade: 3, valor_unico_centavos: 21000, valor_mensal_centavos: 0 }],
    }, { whatsapp: null }));
    expect(m.itens[0].nome).toBe('Placa NFC × 3');
    expect(m.rodape).toEqual([
      'Forma de pagamento: a combinar · Prazo: a combinar', '@madia.consultoria', 'Entrega em 5 dias',
    ]);
  });
});

describe('gerarPdf', () => {
  it('gerarPdf devolve um PDF', async () => {
    const buffer = await gerarPdf(modeloDocumento(filinto, { whatsapp: null }));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('gera mesmo com orçamento vazio', async () => {
    const vazio = { ...filinto, itens: [], totais: { subtotal_unico_centavos: 0, desconto_centavos: 0, total_unico_centavos: 0, mensalidades: [], total_mensal_centavos: 0 } };
    const buffer = await gerarPdf(modeloDocumento(vazio, { whatsapp: null }));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
