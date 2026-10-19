import { repoHospedagens } from '../repos/hospedagens.js';
import { obterConfig } from '../repos/config.js';
import { criarExecutorUnico } from '../instagram/executor.js';
import { criarClienteVercel } from './vercel.js';
import { checarSite } from './checagem.js';

const FALHAS_PARA_FORA_DO_AR = 2;

export function criarMonitor({ db, fetch, agora = () => new Date() }) {
  const repo = repoHospedagens(db);

  // A Vercel já ter pausado o projeto (por nós ou à mão) explica o site fora do ar.
  async function vercelPausou(site) {
    const token = obterConfig(db, 'vercel_token');
    if (!token || !site.vercel_projeto_id) return false;
    try {
      return await criarClienteVercel({ token, fetch }).estaPausado(site.vercel_projeto_id);
    } catch {
      return false;
    }
  }

  async function checarUm(site) {
    const resultado = await checarSite({ url: site.url, fetch });
    // A checagem demora; o site pode ter sido pausado ou ter mudado de endereço nesse meio-tempo.
    const atual = repo.obter(site.projeto_id);
    if (!atual || atual.status === 'pausado' || atual.url !== site.url) return;

    const em = agora().toISOString();
    if (resultado.ok) {
      repo.atualizar(site.projeto_id, {
        status: 'no_ar',
        falhas_seguidas: 0,
        ultimo_motivo: null,
        ultima_checagem: em,
        ...(atual.status !== 'no_ar' ? { status_desde: em } : {}),
      });
      return;
    }

    const falhas = atual.falhas_seguidas + 1;
    const campos = { falhas_seguidas: falhas, ultimo_motivo: resultado.motivo, ultima_checagem: em };
    if (falhas >= FALHAS_PARA_FORA_DO_AR && atual.status !== 'fora_do_ar') {
      const pausou = await vercelPausou(atual);
      // A consulta à Vercel também é assíncrona: reler de novo antes de gravar.
      const de_novo = repo.obter(site.projeto_id);
      if (!de_novo || de_novo.status === 'pausado' || de_novo.url !== site.url) return;
      if (pausou) campos.status = 'pausado';
      else Object.assign(campos, { status: 'fora_do_ar', status_desde: em });
    }
    repo.atualizar(site.projeto_id, campos);
  }

  async function rodada() {
    await Promise.all(
      repo.listarMonitorados().map((site) =>
        checarUm(site).catch((erro) => console.error(`[monitor] falha ao checar projeto ${site.projeto_id}:`, erro)),
      ),
    );
  }

  const executor = criarExecutorUnico(rodada);
  return { checarTodos: () => executor.executar() };
}
