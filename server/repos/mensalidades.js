import { emTransacao, linha } from './crud.js';
import { repoParcelas } from './parcelas.js';
import { mensalidadesDevidas } from '../domain/mensalidade.js';
import { mesDe } from '../domain/datas.js';

// Cria só as mensalidades que faltam: um mês que já tem mensalidade (em qualquer dia) é pulado; nada é apagado.
export function gerarMensalidades(db, projeto, hoje) {
  const devidas = mensalidadesDevidas(projeto, hoje);
  if (!devidas.length) return 0;
  const parcelas = repoParcelas(db);
  const mesesComMensalidade = new Set(parcelas.listar({ projeto_id: projeto.id, mensalidade: 1 }).map((p) => mesDe(p.vencimento)));
  let criadas = 0;
  for (const vencimento of devidas) {
    if (mesesComMensalidade.has(mesDe(vencimento))) continue;
    parcelas.criar({ projeto_id: projeto.id, descricao: 'Mensalidade', valor_centavos: projeto.mensalidade_valor_centavos, vencimento, mensalidade: 1 });
    mesesComMensalidade.add(mesDe(vencimento));
    criadas++;
  }
  return criadas;
}

export function gerarTodasMensalidades(db, hoje) {
  const ativos = db.prepare('SELECT * FROM projetos WHERE mensalidade_ativa = 1').all().map(linha);
  return emTransacao(db, () => ativos.reduce((total, projeto) => total + gerarMensalidades(db, projeto, hoje), 0));
}
