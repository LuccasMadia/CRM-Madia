import { repoProjetos } from '../repos/projetos.js';
import { criarClienteSupabase, ErroSupabase } from './cliente.js';
import { criarCache } from '../github/cache.js';
import { lerContas } from './contas.js';

const CINCO_MINUTOS = 5 * 60 * 1000;

// Tudo que o CRM lê do Supabase passa por aqui, conta por conta. Só leitura: nada é pausado, restaurado ou criado.
export function criarServicoSupabase({ db, fetch }) {
  const projetosDoCrm = repoProjetos(db);
  const cache = criarCache(CINCO_MINUTOS);
  const estado = () => {
    const contas = lerContas(db);
    return { conectado: contas.length > 0, contas: contas.map(({ id, email }) => ({ id, email })) };
  };

  // Uma conta com erro vai para `erros`; as outras continuam listando.
  async function projetos({ forcar = false } = {}) {
    const lista = [];
    const erros = [];
    for (const conta of lerContas(db)) {
      try {
        const deConta = await cache.obter(`projetos:${conta.id}`, () => criarClienteSupabase({ token: conta.token, fetch }).listarProjetos(), { forcar });
        lista.push(...deConta.map((p) => ({ ...p, conta: conta.email, conta_id: conta.id })));
      } catch (erro) {
        if (!(erro instanceof ErroSupabase)) throw erro;
        erros.push({ conta_id: conta.id, conta: conta.email, erro: erro.message });
      }
    }
    return { projetos: lista, erros };
  }

  // Projeto que sumiu vira encontrado:false; mas se alguma conta falhou não dá para afirmar isso, então o erro sobe.
  async function detalheProjeto(projeto, { forcar = false } = {}) {
    if (!projeto.supabase_ref) return { encontrado: false };
    const { projetos: lista, erros } = await projetos({ forcar });
    const achado = lista.find((p) => p.ref === projeto.supabase_ref);
    if (achado) return { encontrado: true, nome: achado.nome, regiao: achado.regiao, estado: achado.estado, link: achado.link, conta: achado.conta };
    if (erros.length) throw new ErroSupabase(`Conta ${erros[0].conta}: ${erros[0].erro}`);
    return { encontrado: false };
  }

  // Projetos reais (não fictícios, não perdidos) ligados a um projeto pausado em qualquer conta.
  async function alertas() {
    const pausados = new Set((await projetos()).projetos.filter((p) => p.estado === 'pausado').map((p) => p.ref));
    return projetosDoCrm.listar()
      .filter((p) => p.supabase_ref && pausados.has(p.supabase_ref) && !p.ficticio && p.etapa !== 'perdido')
      .map((p) => (p.etapa === 'entregue'
        ? { codigo: 'supabase_pausado_entregue', texto: `${p.titulo} já foi entregue e o Supabase está pausado`, link: `/projetos/${p.id}` }
        : { codigo: 'supabase_pausado', texto: `${p.titulo} está pausado no Supabase`, link: `/projetos/${p.id}` }));
  }

  return { estado, projetos, detalheProjeto, alertas, limparCache: () => cache.limpar() };
}
