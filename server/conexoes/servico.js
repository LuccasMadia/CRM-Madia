import { obterConfig } from '../repos/config.js';
import { criarCache } from '../github/cache.js';
import { criarClienteGithub } from '../github/cliente.js';
import { criarClienteFigma } from '../figma/cliente.js';
import { criarClienteVercel } from '../hospedagem/vercel.js';
import { criarClienteSupabase } from '../supabase/cliente.js';
import { lerContas } from '../supabase/contas.js';
import { situacaoValidade } from './validade.js';

const DEZ_MINUTOS = 10 * 60 * 1000;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Junta o estado de todas as conexões com token: se a chave ainda funciona e quando vence.
// Só 401/403 conta como "parou de funcionar"; sem internet ou erro do serviço não alerta.
export function criarServicoConexoes({ db, fetch, hoje }) {
  const cache = criarCache(DEZ_MINUTOS);

  async function checar(chave, verificar, forcar) {
    return cache.obter(chave, async () => {
      try {
        await verificar();
        return { falhou: false };
      } catch (erro) {
        return erro?.tokenInvalido ? { falhou: true, mensagem: erro.message } : { falhou: false };
      }
    }, { forcar });
  }

  function fontes() {
    const cfg = (chave) => obterConfig(db, chave);
    const lista = [
      { servico: 'github', nome: 'GitHub', token: cfg('github_token'), validade: cfg('github_validade'), editavel: true, verificar: (token) => criarClienteGithub({ token, fetch }).usuario() },
      { servico: 'figma', nome: 'Figma', token: cfg('figma_token'), validade: cfg('figma_validade'), editavel: true, verificar: (token) => criarClienteFigma({ token, fetch }).usuario() },
      { servico: 'vercel', nome: 'Vercel', token: cfg('vercel_token'), validade: cfg('vercel_validade'), editavel: true, verificar: (token) => criarClienteVercel({ token, fetch }).listarProjetos() },
      { servico: 'instagram', nome: 'Instagram', token: cfg('instagram_token'), validade: cfg('instagram_token_expira_em'), editavel: false, verificar: null },
    ];
    for (const conta of lerContas(db)) {
      lista.push({
        servico: 'supabase', nome: 'Supabase', conta_id: conta.id, conta: conta.email, token: conta.token, validade: conta.validade ?? null, editavel: true,
        verificar: (token) => criarClienteSupabase({ token, fetch }).listarProjetos(),
      });
    }
    return lista.filter((f) => f.token);
  }

  async function listar({ forcar = false } = {}) {
    const itens = [];
    for (const f of fontes()) {
      const checagem = f.verificar ? await checar(`${f.servico}:${f.conta_id ?? ''}:${f.token.slice(-8)}`, () => f.verificar(f.token), forcar) : { falhou: false };
      const situacao = situacaoValidade(f.validade, hoje());
      itens.push({
        servico: f.servico, nome: f.nome, ...(f.conta_id ? { conta_id: f.conta_id, conta: f.conta } : {}),
        validade: f.validade ? String(f.validade).slice(0, 10) : null, validade_estado: situacao?.estado ?? null, dias: situacao?.dias ?? null,
        editavel: f.editavel, falhou: checagem.falhou, mensagem: checagem.mensagem ?? null,
      });
    }
    return itens;
  }

  async function alertas({ forcar = false } = {}) {
    const resultado = [];
    for (const c of await listar({ forcar })) {
      const quem = `Token do ${c.nome}${c.conta ? ` (${c.conta})` : ''}`;
      if (c.falhou) resultado.push({ codigo: 'token_falhou', tom: 'perigo', texto: `${quem} parou de funcionar`, para: '/configuracoes' });
      else if (c.validade_estado === 'venceu') resultado.push({ codigo: 'token_venceu', tom: 'perigo', texto: `${quem} venceu há ${plural(c.dias, 'dia', 'dias')}`, para: '/configuracoes' });
      else if (c.validade_estado === 'vence') {
        const quando = c.dias === 0 ? 'vence hoje' : `vence em ${plural(c.dias, 'dia', 'dias')}`;
        resultado.push({ codigo: 'token_vence', tom: 'atencao', texto: `${quem} ${quando}`, para: '/configuracoes' });
      }
    }
    return resultado;
  }

  return { listar, alertas };
}
