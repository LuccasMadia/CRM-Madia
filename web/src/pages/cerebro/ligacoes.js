// Vizinhos de cada ponto, nos dois sentidos: a tarefa aponta para o projeto, e o projeto também "vê" a tarefa.
export function montarVizinhos(pontos) {
  const vizinhos = new Map();
  const ligar = (a, b) => {
    if (!vizinhos.has(a)) vizinhos.set(a, new Set());
    vizinhos.get(a).add(b);
  };
  for (const { id, ligacoes = [] } of pontos) {
    for (const outro of ligacoes) {
      ligar(id, outro);
      ligar(outro, id);
    }
  }
  return vizinhos;
}

// Linhas a desenhar a partir de um ponto: os vizinhos diretos e, passando por um projeto, o resto do projeto
// (tarefa → projeto → cliente, parcelas, site). Não atravessa cliente, senão um projeto acenderia os outros projetos do cliente.
export function ligadosA(id, vizinhos) {
  const linhas = [];
  const acesos = new Set([id]);
  for (const v of vizinhos.get(id) ?? []) {
    linhas.push([id, v]);
    acesos.add(v);
    if (!v.startsWith('projeto:')) continue;
    for (const w of vizinhos.get(v) ?? []) {
      if (acesos.has(w)) continue;
      linhas.push([v, w]);
      acesos.add(w);
    }
  }
  return { linhas, acesos };
}
