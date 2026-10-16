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
  return {
    executar() {
      if (!atual) atual = chamar(fn).finally(() => { atual = null; });
      return atual;
    },
    emAndamento: () => atual !== null,
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
