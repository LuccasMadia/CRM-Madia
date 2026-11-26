import { obterConfig } from '../repos/config.js';
import { criarClienteFigma, ErroFigma } from './cliente.js';
import { criarCache } from '../github/cache.js';

const DEZ_MINUTOS = 10 * 60 * 1000;

// Tudo que o CRM lê do Figma passa por aqui. Só leitura.
export function criarServicoFigma({ db, fetch }) {
  const cache = criarCache(DEZ_MINUTOS);
  const token = () => obterConfig(db, 'figma_token');
  const estado = () => ({ conectado: Boolean(token()), usuario: obterConfig(db, 'figma_usuario') ?? null });

  // Arquivo apagado ou sem acesso vira encontrado:false, não erro.
  async function detalheProjeto(projeto, { forcar = false } = {}) {
    if (!projeto.figma_arquivo) return { encontrado: false };
    try {
      const dados = await cache.obter(`arquivo:${projeto.figma_arquivo}`, () => criarClienteFigma({ token: token(), fetch }).arquivo(projeto.figma_arquivo), { forcar });
      return { encontrado: true, ...dados };
    } catch (erro) {
      if (erro instanceof ErroFigma && erro.status === 404) return { encontrado: false };
      throw erro;
    }
  }

  return { estado, detalheProjeto, limparCache: () => cache.limpar() };
}
