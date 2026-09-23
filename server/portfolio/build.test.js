import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { construirPortfolio } from './build.js';

describe('construirPortfolio', () => {
  it('gera o JSON no formato do site e a lista de cópias', () => {
    const itens = [
      {
        slug: 'canecas', titulo_publico: 'Canecas', descricao_publica: 'Sistema', stack: ['Python'],
        status_publico: 'Em funcionamento', live_url: null, code_url: 'https://github.com/x',
        imagens: [{ id: 7, arquivo: 'uuid-a.PNG' }, { id: 8, arquivo: 'uuid-b.webp' }],
        case_study: [{ titulo: 'Início', descricao: null, imagem_id: 8 }],
      },
      {
        slug: 'popy', titulo_publico: 'Popy', descricao_publica: 'Landing', stack: ['Next.js'],
        status_publico: null, live_url: 'https://popy.app', code_url: null,
        imagens: [{ id: 9, arquivo: 'uuid-c.jpg' }], case_study: [],
      },
    ];
    const { json, copias } = construirPortfolio({ itens, projectsDelivered: 4, uploadsDir: '/up', agora: 'T' });

    expect(json).toEqual({
      generatedAt: 'T',
      stats: { projectsDelivered: 4 },
      projects: [
        {
          id: 'canecas', title: 'Canecas', description: 'Sistema', stack: ['Python'], status: 'Em funcionamento',
          codeUrl: 'https://github.com/x',
          images: ['/projects/canecas/01.png', '/projects/canecas/02.webp'],
          caseStudy: [{ titulo: 'Início', imagem: '/projects/canecas/02.webp', descricao: '' }],
        },
        {
          id: 'popy', title: 'Popy', description: 'Landing', stack: ['Next.js'], liveUrl: 'https://popy.app',
          images: ['/projects/popy/01.jpg'],
        },
      ],
    });
    expect(copias).toEqual([
      { origem: path.join('/up', 'uuid-a.PNG'), destino: 'canecas/01.png' },
      { origem: path.join('/up', 'uuid-b.webp'), destino: 'canecas/02.webp' },
      { origem: path.join('/up', 'uuid-c.jpg'), destino: 'popy/01.jpg' },
    ]);
  });
});
