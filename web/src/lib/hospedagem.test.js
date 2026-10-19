import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ROTULO_STATUS, textoStatus, BolinhaStatus } from './hospedagem.js';

const desde = new Date(2026, 10, 19, 14, 32).toISOString();

describe('hospedagem', () => {
  it('textoStatus para cada status', () => {
    expect(textoStatus({ status: 'fora_do_ar', status_desde: desde })).toBe('Fora do ar desde 19/11 14:32');
    expect(textoStatus({ status: 'no_ar', status_desde: desde })).toBe('No ar');
    expect(textoStatus({ status: 'pausado', status_desde: new Date(2026, 10, 20, 14, 5).toISOString() })).toBe('Pausado por você desde 20/11 14:05');
    expect(textoStatus({ status: 'desconhecido' })).toBe('Verificando…');
    expect(textoStatus(null)).toBe('Verificando…');
  });

  it('BolinhaStatus tem classe e rótulo', () => {
    render(createElement(BolinhaStatus, { status: 'fora_do_ar' }));
    const el = screen.getByLabelText(ROTULO_STATUS.fora_do_ar);
    expect(el).toHaveClass('status-site', 'status-site--fora_do_ar');
  });
});
