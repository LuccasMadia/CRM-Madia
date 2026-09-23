import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function criarPortfolioFalso() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'crm-pf-'));
  mkdirSync(path.join(repo, '.git'));
  writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}');
  mkdirSync(path.join(repo, 'src/assets/projects/a'), { recursive: true });
  mkdirSync(path.join(repo, 'src/assets/projects/b'), { recursive: true });
  mkdirSync(path.join(repo, 'src/data'), { recursive: true });
  writeFileSync(path.join(repo, 'src/assets/projects/a/a-00.png'), 'imagem-a0');
  writeFileSync(path.join(repo, 'src/assets/projects/a/a-01.png'), 'imagem-a1');
  writeFileSync(path.join(repo, 'src/assets/projects/b/b-00.png'), 'imagem-b0');
  writeFileSync(
    path.join(repo, 'src/data/content.js'),
    `import a0 from '../assets/projects/a/a-00.png';
import a1 from '../assets/projects/a/a-01.png';
import b0 from '../assets/projects/b/b-00.png';

export const about = { projectsDelivered: 6 };

export const projects = [
  {
    id: 'proj-1',
    title: 'Canecas da Dri',
    description: 'Sistema de estoque',
    stack: ['Python'],
    status: 'Em funcionamento',
    images: [a0, a1],
    caseStudy: [{ titulo: 'Início', imagem: a1, descricao: 'Tela inicial' }],
    codeUrl: 'https://github.com/x/canecas',
  },
  {
    id: 'proj-2',
    title: 'Rango do Bicho',
    description: 'Site',
    stack: ['Next.js'],
    status: 'Em desenvolvimento',
    liveUrl: 'https://rango.app',
    images: [b0],
  },
];
`,
  );
  return repo;
}
