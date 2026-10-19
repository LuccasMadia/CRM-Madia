import { createElement } from 'react';

export const ROTULO_STATUS = {
  desconhecido: 'Verificando…',
  no_ar: 'No ar',
  fora_do_ar: 'Fora do ar',
  pausado: 'Pausado por você',
};

const p2 = (n) => String(n).padStart(2, '0');

// Instante ISO -> "dd/MM HH:mm" no fuso local.
export function dataHoraCurta(iso) {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function textoStatus(h) {
  const status = h?.status ?? 'desconhecido';
  const desde = h?.status_desde ? ` desde ${dataHoraCurta(h.status_desde)}` : '';
  if (status === 'fora_do_ar' || status === 'pausado') return `${ROTULO_STATUS[status]}${desde}`;
  return ROTULO_STATUS[status] ?? ROTULO_STATUS.desconhecido;
}

// Sem JSX para o arquivo continuar .js.
export function BolinhaStatus({ status }) {
  const chave = ROTULO_STATUS[status] ? status : 'desconhecido';
  return createElement('span', { className: `status-site status-site--${chave}`, role: 'img', 'aria-label': ROTULO_STATUS[chave] });
}
