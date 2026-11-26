const ALTURA = 48;
const LARGURA_BARRA = 6;
const FOLGA = 2;

// Barras de commits por semana (até 52). Só leitura; a cor segue o tema.
export function CommitsPorSemana({ semanas, calculando }) {
  if (calculando) return <p className="commits__aviso">Calculando commits…</p>;
  const total = semanas.reduce((soma, s) => soma + s.total, 0);
  if (!total) return <p className="commits__aviso">Nenhum commit nos últimos 12 meses.</p>;
  const maior = Math.max(...semanas.map((s) => s.total));
  const largura = semanas.length * (LARGURA_BARRA + FOLGA) - FOLGA;
  return (
    <svg
      className="commits" viewBox={`0 0 ${largura} ${ALTURA}`} width="100%" role="img"
      aria-label={`Commits por semana nos últimos 12 meses: ${total}`} preserveAspectRatio="none"
    >
      {semanas.map((s, i) => {
        const altura = s.total ? Math.max(3, Math.round((s.total / maior) * ALTURA)) : 1;
        return (
          <rect key={s.semana} x={i * (LARGURA_BARRA + FOLGA)} y={ALTURA - altura} width={LARGURA_BARRA} height={altura} rx="1.5"
            className={s.total ? 'commits__barra' : 'commits__barra commits__barra--vazia'}>
            <title>{`Semana de ${s.semana}: ${s.total}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
