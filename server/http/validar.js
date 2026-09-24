import { ErroHttp, ErroValidacao } from './erros.js';
import { dataValida } from '../domain/datas.js';

export function validar(corpo, regras, { parcial = false } = {}) {
  const dados = corpo ?? {};
  const saida = {};
  const erros = [];
  for (const [campo, regra] of Object.entries(regras)) {
    if (!(campo in dados)) {
      if (!parcial && regra.obrigatorio) erros.push({ campo, mensagem: 'Obrigatório' });
      continue;
    }
    const resultado = normalizar(dados[campo], regra);
    if (resultado.erro) erros.push({ campo, mensagem: resultado.erro });
    else saida[campo] = resultado.valor;
  }
  if (erros.length) throw new ErroValidacao(erros);
  return saida;
}

function normalizar(valor, regra) {
  const vazio = valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
  if (vazio) {
    if (regra.obrigatorio) return { erro: 'Obrigatório' };
    if (regra.tipo === 'lista') return { valor: '[]' };
    if (regra.tipo === 'bool') return { valor: 0 };
    return { valor: regra.padrao ?? null };
  }
  switch (regra.tipo) {
    case 'texto':
      return typeof valor === 'string' ? { valor: valor.trim() } : { erro: 'Deve ser texto' };
    case 'inteiro':
      if (!Number.isInteger(valor)) return { erro: 'Deve ser um número inteiro' };
      if (regra.min !== undefined && valor < regra.min) return { erro: `Deve ser no mínimo ${regra.min}` };
      if (regra.max !== undefined && valor > regra.max) return { erro: `Deve ser no máximo ${regra.max}` };
      return { valor };
    case 'data':
      return dataValida(valor) ? { valor } : { erro: 'Data inválida (use AAAA-MM-DD)' };
    case 'bool':
      return typeof valor === 'boolean' || valor === 0 || valor === 1
        ? { valor: valor ? 1 : 0 }
        : { erro: 'Deve ser verdadeiro ou falso' };
    case 'enum':
      return regra.valores.includes(valor) ? { valor } : { erro: `Valor inválido: ${valor}` };
    case 'lista':
      return Array.isArray(valor) && valor.every((v) => typeof v === 'string')
        ? { valor: JSON.stringify(valor.map((v) => v.trim()).filter(Boolean)) }
        : { erro: 'Deve ser uma lista de textos' };
    case 'slug':
      return typeof valor === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(valor)
        ? { valor }
        : { erro: 'Use só letras minúsculas, números e hífens' };
    default:
      throw new Error(`Tipo de regra desconhecido: ${regra.tipo}`);
  }
}

export function lerId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErroHttp(404, 'Registro não encontrado');
  return id;
}
