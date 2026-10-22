import { describe, it, expect } from 'vitest';
import { MODOS_INICIO_MENSALIDADE, inicioMensalidade, mensalidadesDevidas, planejarMensalidadesAbertas, situacaoMensalidade, tipoDaMensalidade } from './mensalidade.js';

const base = {
  mensalidade_ativa: 1, mensalidade_dia_vencimento: 10, mensalidade_inicio_modo: 'entrega',
  data_inicio: '2026-07-01', data_entrega: '2026-08-15', mensalidade_inicio_data: '2026-09-05',
};

describe('inicioMensalidade', () => {
  it('lista os três modos na ordem da tela', () => {
    expect(MODOS_INICIO_MENSALIDADE).toEqual(['desenvolvimento', 'entrega', 'data']);
  });

  it('usa a data de cada modo', () => {
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'desenvolvimento' })).toBe('2026-07-01');
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'entrega' })).toBe('2026-08-15');
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'data' })).toBe('2026-09-05');
  });

  it('sem modo vale entrega; sem a data do modo, não começou', () => {
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: undefined })).toBe('2026-08-15');
    expect(inicioMensalidade({ ...base, data_entrega: null })).toBeNull();
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '' })).toBeNull();
  });
});

describe('mensalidadesDevidas', () => {
  it('a primeira vence na data do gatilho e as seguintes no dia escolhido, até o mês atual', () => {
    expect(mensalidadesDevidas(base, '2026-10-02')).toEqual(['2026-08-15', '2026-09-10', '2026-10-10']);
  });

  it('nada antes do início nem depois do mês de hoje', () => {
    expect(mensalidadesDevidas(base, '2026-07-31')).toEqual([]);
    expect(mensalidadesDevidas(base, '2026-08-01')).toEqual(['2026-08-15']);
  });

  it('dia 31 vira o último dia em meses curtos', () => {
    const p = { ...base, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-01-31', mensalidade_dia_vencimento: 31 };
    expect(mensalidadesDevidas(p, '2026-03-05')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('sem dia de vencimento usa o dia do início', () => {
    const p = { ...base, mensalidade_dia_vencimento: null };
    expect(mensalidadesDevidas(p, '2026-09-20')).toEqual(['2026-08-15', '2026-09-15']);
  });

  it('desativada ou sem início não gera nada', () => {
    expect(mensalidadesDevidas({ ...base, mensalidade_ativa: 0 }, '2026-10-02')).toEqual([]);
    expect(mensalidadesDevidas({ ...base, data_entrega: null }, '2026-10-02')).toEqual([]);
  });
});

describe('planejarMensalidadesAbertas', () => {
  const antes = { ...base, mensalidade_valor_centavos: 10000 };
  const parcela = (id, vencimento, extra = {}) => ({ id, vencimento, valor_centavos: 10000, pago_em: null, ...extra });
  const abertas = [parcela(1, '2026-08-15'), parcela(2, '2026-09-10'), parcela(3, '2026-10-10')];

  it('valor novo vale para as que ainda não venceram; atrasadas e pagas ficam como estão', () => {
    const lista = [...abertas, parcela(4, '2026-10-12', { pago_em: '2026-10-01' })];
    expect(planejarMensalidadesAbertas(lista, antes, { ...antes, mensalidade_valor_centavos: 15000 }, '2026-10-02')).toEqual([
      { acao: 'atualizar', id: 3, valor_centavos: 15000, vencimento: '2026-10-10' },
    ]);
  });

  it('dia novo muda o vencimento, menos o da 1ª (que vence no gatilho)', () => {
    const depois = { ...antes, mensalidade_dia_vencimento: 20 };
    expect(planejarMensalidadesAbertas(abertas, antes, depois, '2026-08-01')).toEqual([
      { acao: 'atualizar', id: 2, valor_centavos: 10000, vencimento: '2026-09-20' },
      { acao: 'atualizar', id: 3, valor_centavos: 10000, vencimento: '2026-10-20' },
    ]);
  });

  it('sem mudança não faz nada', () => {
    expect(planejarMensalidadesAbertas(abertas, antes, antes, '2026-08-01')).toEqual([]);
  });

  it('desligar só apaga as que não venceram, e só quando pedido', () => {
    const depois = { ...antes, mensalidade_ativa: 0, mensalidade_valor_centavos: 0 };
    expect(planejarMensalidadesAbertas(abertas, antes, depois, '2026-09-11')).toEqual([]);
    expect(planejarMensalidadesAbertas(abertas, antes, depois, '2026-09-11', { apagarAbertas: true })).toEqual([{ acao: 'remover', id: 3 }]);
  });
});

describe('tipoDaMensalidade', () => {
  it('GMN e placas pelo serviço; site pela categoria mais pesada', () => {
    expect(tipoDaMensalidade('google_meu_negocio')).toBe('gmn');
    expect(tipoDaMensalidade('placas_nfc')).toBe('placas');
    expect(tipoDaMensalidade('site_sistema', ['Site', 'SaaS'])).toBe('saas');
    expect(tipoDaMensalidade('site_sistema', ['sistema', 'Landing page'])).toBe('sistema');
    expect(tipoDaMensalidade('site_sistema', ['Landing page'])).toBe('site');
    expect(tipoDaMensalidade('site_sistema', [])).toBe('site');
  });
});

describe('situacaoMensalidade', () => {
  const projeto = { ...base, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-08-10' };
  const p = (id, vencimento, pago_em = null) => ({ id, vencimento, valor_centavos: 10000, pago_em });

  it('em dia: mostra a próxima e a última paga', () => {
    const s = situacaoMensalidade(projeto, [p(1, '2026-08-10', '2026-08-09'), p(2, '2026-09-10')], '2026-09-01');
    expect(s).toMatchObject({
      situacao: 'em_dia', atrasadas: 0, proxima: { id: 2, vencimento: '2026-09-10' },
      em_aberto: { id: 2 }, ultima_paga: { vencimento: '2026-08-10', pago_em: '2026-08-09' },
    });
  });

  it('atrasada: soma o que venceu e diz desde quando', () => {
    const s = situacaoMensalidade(projeto, [p(1, '2026-08-10'), p(2, '2026-09-10')], '2026-09-15');
    expect(s).toMatchObject({ situacao: 'atrasada', atrasadas: 2, atrasado_centavos: 20000, atrasada_desde: '2026-08-10', proxima: null, em_aberto: { id: 1 } });
  });

  it('aguardando enquanto não chega o início; desligada quando não cobra mais', () => {
    expect(situacaoMensalidade({ ...base, data_entrega: null }, [], '2026-09-15').situacao).toBe('aguardando');
    expect(situacaoMensalidade({ ...projeto, mensalidade_inicio_data: '2026-12-01' }, [], '2026-09-15').situacao).toBe('aguardando');
    expect(situacaoMensalidade({ ...projeto, mensalidade_ativa: 0 }, [p(1, '2026-08-10')], '2026-09-15').situacao).toBe('desligada');
  });
});
