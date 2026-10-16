import { hojeISO } from '../../lib/datas.js';

const numero = (n) => n.toLocaleString('pt-BR');

function diasAtras(dias) {
  const d = new Date(`${hojeISO()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function Linha({ serie }) {
  if (serie.length < 2) return null;
  const valores = serie.map((p) => p.seguidores);
  const min = Math.min(...valores);
  const faixa = Math.max(...valores) - min || 1;
  const pontos = valores.map((v, i) => `${(i / (valores.length - 1)) * 100},${36 - ((v - min) / faixa) * 32}`).join(' ');
  return (
    <svg className="resumo-crescimento__linha" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pontos} fill="none" stroke="var(--primaria)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ResumoCrescimento({ serie }) {
  if (!serie?.length) return null;
  const atual = serie.at(-1).seguidores;
  const limite = diasAtras(30);
  const base = (serie.find((p) => p.dia >= limite) ?? serie[0]).seguidores;
  const diferenca = atual - base;
  return (
    <section className="cartao resumo-crescimento" aria-label="Crescimento">
      <div>
        <p className="resumo-crescimento__total">{numero(atual)} seguidores</p>
        <p className="kanban__meta">{diferenca >= 0 ? '+' : ''}{numero(diferenca)} em 30 dias</p>
      </div>
      <Linha serie={serie} />
    </section>
  );
}
