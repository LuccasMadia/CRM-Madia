import { repoHospedagens } from '../repos/hospedagens.js';
import { obterConfig } from '../repos/config.js';
import { criarExecutorUnico } from '../instagram/executor.js';
import { criarClienteVercel } from './vercel.js';
import { checarSite } from './checagem.js';

const FALHAS_PARA_FORA_DO_AR = 2;

export function criarMonitor({ db, fetch, agora = () => new Date() }) {
  const repo = repoHospedagens(db);

  const clienteVercel = () => {
    const token = obterConfig(db, 'vercel_token');
    return token ? criarClienteVercel({ token, fetch }) : null;
  };

  // A Vercel já ter pausado o projeto (por nós ou à mão) explica o site fora do ar.
  // Devolve true/false, ou 'sem_rede' quando nem a Vercel foi alcançada (provável queda da nossa internet).
  async function vercelPausou(site) {
    const cliente = clienteVercel();
    if (!cliente || !site.vercel_projeto_id) return false;
    try {
      return await cliente.estaPausado(site.vercel_projeto_id);
    } catch (erro) {
      return erro?.status === 0 ? 'sem_rede' : false;
    }
  }

  async function aplicar(site, resultado, { descartarEscalada }) {
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
    if (falhas >= FALHAS_PARA_FORA_DO_AR && atual.status !== 'fora_do_ar' && !descartarEscalada) {
      const pausou = await vercelPausou(atual);
      // A consulta à Vercel também é assíncrona: reler de novo antes de gravar.
      const de_novo = repo.obter(site.projeto_id);
      if (!de_novo || de_novo.status === 'pausado' || de_novo.url !== site.url) return;
      if (pausou === true) Object.assign(campos, { status: 'pausado', status_desde: em });
      else if (pausou === false) Object.assign(campos, { status: 'fora_do_ar', status_desde: em });
      // 'sem_rede': não dá para saber; segue contando falhas sem alarmar.
    }
    repo.atualizar(site.projeto_id, campos);
  }

  // Pausas feitas fora do CRM (direto na Vercel) podem ser desfeitas lá: quando o projeto
  // volta a estar ativo, o monitoramento normal recomeça. As pausas do próprio CRM não são tocadas.
  async function reconciliarPausas() {
    const cliente = clienteVercel();
    if (!cliente) return;
    for (const site of repo.listarPausadosForaDoCrm()) {
      try {
        if ((await cliente.estaPausado(site.vercel_projeto_id)) !== false) continue;
        const atual = repo.obter(site.projeto_id);
        if (atual?.status !== 'pausado' || repo.pausadoPeloCrm(site.projeto_id)) continue;
        repo.atualizar(site.projeto_id, { status: 'desconhecido', status_desde: null, falhas_seguidas: 0 });
      } catch (erro) {
        console.error(`[monitor] falha ao reconciliar projeto ${site.projeto_id}:`, erro?.message);
      }
    }
  }

  async function rodada() {
    const sites = repo.listarMonitorados();
    const checados = await Promise.all(
      sites.map((site) =>
        checarSite({ url: site.url, fetch })
          .then((resultado) => ({ site, resultado }))
          .catch((erro) => {
            console.error(`[monitor] falha ao checar projeto ${site.projeto_id}:`, erro);
            return null;
          }),
      ),
    ).then((lista) => lista.filter(Boolean));

    // Com 2+ sites, todos falhando por rede (sem nenhum 5xx) aponta para a nossa conexão, não para os sites.
    const descartarEscalada = checados.length >= 2 && checados.every(({ resultado }) => !resultado.ok && resultado.rede);

    await Promise.all(
      checados.map(({ site, resultado }) =>
        aplicar(site, resultado, { descartarEscalada }).catch((erro) =>
          console.error(`[monitor] falha ao checar projeto ${site.projeto_id}:`, erro),
        ),
      ),
    );
    await reconciliarPausas();
  }

  const executor = criarExecutorUnico(rodada);
  return { checarTodos: () => executor.executar(), checarAgora: () => executor.reiniciar() };
}
