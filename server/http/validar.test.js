import { describe, it, expect } from 'vitest';
import { validar } from './validar.js';
import { ErroValidacao } from './erros.js';

const REGRAS = {
  nome: { tipo: 'texto', obrigatorio: true },
  valor: { tipo: 'inteiro', min: 0, padrao: 0 },
  data: { tipo: 'data' },
  ativo: { tipo: 'bool' },
  etapa: { tipo: 'enum', valores: ['a', 'b'], padrao: 'a' },
  stack: { tipo: 'lista' },
  slug: { tipo: 'slug' },
};

function errosDe(fn) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroValidacao);
    return e.erros;
  }
  throw new Error('não lançou');
}

describe('validar', () => {
  it('normaliza valores válidos', () => {
    expect(
      validar(
        { nome: '  Ana ', valor: 10, data: '2026-09-23', ativo: true, etapa: 'b', stack: [' React ', ''], slug: 'meu-site', extra: 'x' },
        REGRAS,
      ),
    ).toEqual({ nome: 'Ana', valor: 10, data: '2026-09-23', ativo: 1, etapa: 'b', stack: '["React"]', slug: 'meu-site' });
  });

  it('converte vazio em null ou no padrão', () => {
    expect(validar({ nome: 'A', valor: '', data: '', ativo: null, etapa: '', stack: null }, REGRAS)).toEqual({
      nome: 'A', valor: 0, data: null, ativo: 0, etapa: 'a', stack: '[]',
    });
  });

  it('acusa obrigatório ausente (exceto em modo parcial)', () => {
    expect(errosDe(() => validar({}, REGRAS))).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
    expect(validar({}, REGRAS, { parcial: true })).toEqual({});
    expect(errosDe(() => validar({ nome: '  ' }, REGRAS, { parcial: true }))).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
  });

  it('acusa tipos inválidos com o campo certo', () => {
    const erros = errosDe(() =>
      validar({ nome: 'A', valor: -1, data: '2026-02-30', ativo: 'sim', etapa: 'z', stack: 'React', slug: 'Com Espaço' }, REGRAS),
    );
    expect(erros.map((e) => e.campo)).toEqual(['valor', 'data', 'ativo', 'etapa', 'stack', 'slug']);
  });

  it('rejeita número não inteiro', () => {
    expect(errosDe(() => validar({ nome: 'A', valor: 1.5 }, REGRAS))[0].campo).toBe('valor');
  });

  it('aplica limite máximo em inteiro', () => {
    const REGRAS_MAX = { n: { tipo: 'inteiro', max: 5 } };
    expect(validar({ n: 5 }, REGRAS_MAX)).toEqual({ n: 5 });
    expect(errosDe(() => validar({ n: 6 }, REGRAS_MAX))).toEqual([{ campo: 'n', mensagem: 'Deve ser no máximo 5' }]);
  });
});
