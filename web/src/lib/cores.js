// Cor fixa de cada empresa nas etiquetas: sai do id do cliente, então a mesma empresa
// tem sempre a mesma cor. Verde, vermelho e turquesa ficam de fora porque já têm significado.
const CORES_EMPRESA = ['azul', 'violeta', 'rosa', 'laranja', 'ceu', 'lima', 'fucsia', 'ambar'];

export const corDaEmpresa = (clienteId) => `var(--tag-${CORES_EMPRESA[Math.abs(Number(clienteId) || 0) % CORES_EMPRESA.length]})`;
