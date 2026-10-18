const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

const chamar = (fn) => {
  try {
    return Promise.resolve(fn());
  } catch (erro) {
    return Promise.reject(erro);
  }
};

// Garante uma sincronização por vez: quem chama durante uma execução
// recebe a mesma promise em vez de disparar outra.
export function criarExecutorUnico(fn) {
  let atual = null;
  let proxima = null;
  const iniciar = () => {
    const execucao = chamar(fn).finally(() => {
      if (atual === execucao) atual = null;
    });
    atual = execucao;
    return execucao;
  };
  return {
    executar: () => proxima ?? atual ?? iniciar(),
    // Para quando os dados mudaram no meio (ex.: token novo): a execução em
    // andamento termina e outra começa logo depois; chamadas seguidas a compartilham.
    reiniciar() {
      if (!atual) return iniciar();
      proxima ??= atual.catch(() => {}).then(() => {
        proxima = null;
        return iniciar();
      });
      return proxima;
    },
    emAndamento: () => atual !== null || proxima !== null,
  };
}

export function iniciarPeriodico(
  executar,
  { intervaloMs = SEIS_HORAS_MS, setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval, log = console.error } = {},
) {
  const rodar = () => chamar(executar).catch((erro) => log(`Sincronização do Instagram falhou: ${erro.message}`));
  rodar();
  const id = setInterval(rodar, intervaloMs);
  return () => clearInterval(id);
}
