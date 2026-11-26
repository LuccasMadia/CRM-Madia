import { obterConfig } from '../repos/config.js';
import { repoProjetos } from '../repos/projetos.js';
import { criarClienteSupabase } from './cliente.js';
import { criarCache } from '../github/cache.js';

const CINCO_MINUTOS = 5 * 60 * 1000;

// Tudo que o CRM lê do Supabase passa por aqui. Só leitura: nada é pausado, restaurado ou criado.
export function criarServicoSupabase({ db, fetch }) {
  const projetosDoCrm = repoProjetos(db);
  const cache = criarCache(CINCO_MINUTOS);
  const token = () => obterConfig(db, 'supabase_token');
  const estado = () => ({ conectado: Boolean(token()) });
  const projetos = ({ forcar = false } = {}) => cache.obter('projetos', () => criarClienteSupabase({ token: token(), fetch }).listarProjetos(), { forcar });

  // Projeto que sumiu da conta vira encontrado:false, não erro.
  async function detalheProjeto(projeto, { forcar = false } = {}) {
    if (!projeto.supabase_ref) return { encontrado: false };
    const achado = (await projetos({ forcar })).find((p) => p.ref === projeto.supabase_ref);
    if (!achado) return { encontrado: false };
    return { encontrado: true, nome: achado.nome, regiao: achado.regiao, estado: achado.estado, link: achado.link };
  }

  // Projetos reais (não fictícios, não perdidos) ligados a um projeto pausado no Supabase.
  async function alertas() {
    const pausados = new Set((await projetos()).filter((p) => p.estado === 'pausado').map((p) => p.ref));
    return projetosDoCrm.listar()
      .filter((p) => p.supabase_ref && pausados.has(p.supabase_ref) && !p.ficticio && p.etapa !== 'perdido')
      .map((p) => (p.etapa === 'entregue'
        ? { codigo: 'supabase_pausado_entregue', texto: `${p.titulo} já foi entregue e o Supabase está pausado`, link: `/projetos/${p.id}` }
        : { codigo: 'supabase_pausado', texto: `${p.titulo} está pausado no Supabase`, link: `/projetos/${p.id}` }));
  }

  return { estado, projetos, detalheProjeto, alertas, limparCache: () => cache.limpar() };
}
