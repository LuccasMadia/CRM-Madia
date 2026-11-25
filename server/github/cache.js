// Cache em memória com validade; erros não são guardados.
export function criarCache(ttlMs, agora = Date.now) {
  const guardado = new Map();
  return {
    async obter(chave, produzir, { forcar = false } = {}) {
      const existente = guardado.get(chave);
      if (!forcar && existente && agora() - existente.em < ttlMs) return existente.valor;
      const valor = await produzir();
      guardado.set(chave, { em: agora(), valor });
      return valor;
    },
    limpar() { guardado.clear(); },
  };
}
