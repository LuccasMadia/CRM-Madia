const DIA_MS = 24 * 60 * 60 * 1000;

// Situação da validade de um token. `validade` é AAAA-MM-DD (só o dia importa; aceita data com hora).
// dias = quantos dias faltam (ok/vence) ou quantos passaram (venceu). Sem data informada: null.
export function situacaoValidade(validade, hoje, limiteDias = 7) {
  const dia = String(validade ?? '').slice(0, 10);
  if (!dia) return null;
  const faltam = Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / DIA_MS);
  if (Number.isNaN(faltam)) return null;
  if (faltam < 0) return { estado: 'venceu', dias: -faltam };
  return { estado: faltam <= limiteDias ? 'vence' : 'ok', dias: faltam };
}
