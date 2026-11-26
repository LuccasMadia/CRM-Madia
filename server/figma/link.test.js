import { describe, it, expect } from 'vitest';
import { codigoDoLinkFigma } from './link.js';

describe('codigoDoLinkFigma', () => {
  it.each([
    ['https://www.figma.com/design/AbC123/Site-Ana?node-id=1-2', 'AbC123'],
    ['https://figma.com/file/XyZ9/Nome/', 'XyZ9'],
    ['figma.com/board/Q1', 'Q1'],
    ['  https://www.figma.com/proto/Pr0to/Nome  ', 'Pr0to'],
  ])('extrai o código de %s', (link, codigo) => {
    expect(codigoDoLinkFigma(link)).toBe(codigo);
  });

  it.each(['https://example.com/design/AbC', 'https://www.figma.com/files/recent', '', 'texto qualquer'])('rejeita %j', (link) => {
    expect(codigoDoLinkFigma(link)).toBeNull();
  });
});
