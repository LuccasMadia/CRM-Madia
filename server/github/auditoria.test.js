import { describe, it, expect } from 'vitest';
import { montarAuditoria, nomeDoRepositorio } from './auditoria.js';

const repo = (nome, extra = {}) => ({
  nome_completo: `lucas/${nome}`, privado: true, arquivado: false, fork: false, ultimo_commit_em: null, url: `https://github.com/lucas/${nome}`, ...extra,
});
const projeto = (id, extra = {}) => ({
  id, titulo: `Projeto ${id}`, etapa: 'andamento', ficticio: 0, privado: 0, servico: 'site_sistema', github_repo: null, ...extra,
});
const alertasDe = (r) => r.itens.find((i) => i.repo.nome_completo === 'lucas/a').alertas;

describe('montarAuditoria', () => {
  it('repositório público de projeto real antes de entregue não alerta (a Vercel precisa dele assim)', () => {
    const r = montarAuditoria({ repositorios: [repo('a', { privado: false })], projetos: [projeto(1, { github_repo: 'lucas/a', etapa: 'teste' })] });
    expect(alertasDe(r)).toEqual([]);
    expect(r.alertas).toEqual([]);
    expect(r.itens[0]).toMatchObject({ visibilidade: 'publico', projeto: { id: 1, titulo: 'Projeto 1', etapa: 'teste' } });
  });

  it('público + projeto real entregue → publico_entregue', () => {
    const r = montarAuditoria({ repositorios: [repo('a', { privado: false })], projetos: [projeto(1, { github_repo: 'lucas/a', etapa: 'entregue', titulo: 'Cardápio Ana' })] });
    expect(alertasDe(r)).toEqual(['publico_entregue']);
    expect(r.alertas).toEqual([{ codigo: 'publico_entregue', texto: 'Cardápio Ana já foi entregue e o repositório lucas/a está público', link: '/projetos/1' }]);
  });

  it('público + projeto interno → publico_interno em qualquer etapa', () => {
    const r = montarAuditoria({ repositorios: [repo('a', { privado: false })], projetos: [projeto(1, { github_repo: 'lucas/a', etapa: 'andamento', ficticio: 1, privado: 1 })] });
    expect(alertasDe(r)).toEqual(['publico_interno']);
  });

  it('público + projeto fictício (vitrine) não alerta, nem entregue', () => {
    const r = montarAuditoria({ repositorios: [repo('a', { privado: false })], projetos: [projeto(1, { github_repo: 'lucas/a', etapa: 'entregue', ficticio: 1 })] });
    expect(alertasDe(r)).toEqual([]);
  });

  it('privado nunca gera alerta de visibilidade, mesmo entregue', () => {
    const r = montarAuditoria({ repositorios: [repo('a')], projetos: [projeto(1, { github_repo: 'lucas/a', etapa: 'entregue' })] });
    expect(alertasDe(r)).toEqual([]);
  });

  it('repositório sem projeto alerta; arquivado e fork não', () => {
    const r = montarAuditoria({ repositorios: [repo('a'), repo('b', { arquivado: true }), repo('c', { fork: true })], projetos: [] });
    expect(alertasDe(r)).toEqual(['sem_projeto']);
    expect(r.alertas).toEqual([{ codigo: 'sem_projeto', texto: 'Repositório lucas/a não tem projeto no CRM', link: '/servicos?aba=sites&ver=github' }]);
  });

  it('projeto real em versão final, teste ou entregue sem repositório alerta', () => {
    const r = montarAuditoria({
      repositorios: [],
      projetos: [
        projeto(1, { etapa: 'andamento' }), projeto(2, { etapa: 'teste' }), projeto(3, { etapa: 'entregue' }),
        projeto(4, { etapa: 'prototipo' }), projeto(5, { etapa: 'andamento', ficticio: 1 }), projeto(6, { etapa: 'andamento', servico: 'google_meu_negocio' }),
      ],
    });
    expect(r.projetos_sem_repo.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(r.alertas.map((a) => a.codigo)).toEqual(['projeto_sem_repo', 'projeto_sem_repo', 'projeto_sem_repo']);
    expect(r.alertas[0]).toEqual({ codigo: 'projeto_sem_repo', texto: 'Projeto 1 não tem repositório no GitHub', link: '/projetos/1' });
  });

  it('sugere o vínculo pelo nome (sem acento, maiúscula ou hífen) e não liga sozinho', () => {
    const r = montarAuditoria({ repositorios: [repo('cardapio-da-dri')], projetos: [projeto(7, { titulo: 'Cardápio da Dri' })] });
    expect(r.itens[0].projeto).toBeNull();
    expect(r.itens[0].sugestao).toEqual({ id: 7, titulo: 'Cardápio da Dri' });
  });

  it('o vínculo compara o repositório sem diferenciar maiúsculas', () => {
    const r = montarAuditoria({ repositorios: [repo('Site-Ana')], projetos: [projeto(1, { github_repo: 'Lucas/site-ana' })] });
    expect(r.itens[0].projeto.id).toBe(1);
    expect(r.projetos_sem_repo).toEqual([]);
  });
});

describe('sem commit há muito tempo', () => {
  it('projeto real ligado e não entregue, sem commit há 30 dias ou mais, alerta sem_commit', () => {
    const r = montarAuditoria({
      hoje: '2026-11-25',
      repositorios: [
        repo('a', { ultimo_commit_em: '2026-10-20T10:00:00Z' }), repo('b', { ultimo_commit_em: '2026-11-20T10:00:00Z' }),
        repo('c', { ultimo_commit_em: '2026-09-01T00:00:00Z' }), repo('d', { ultimo_commit_em: null }), repo('e', { ultimo_commit_em: '2026-09-01T00:00:00Z' }),
      ],
      projetos: [
        projeto(1, { github_repo: 'lucas/a', etapa: 'andamento' }), projeto(2, { github_repo: 'lucas/b' }),
        projeto(3, { github_repo: 'lucas/c', etapa: 'entregue' }), projeto(4, { github_repo: 'lucas/d' }),
        projeto(5, { github_repo: 'lucas/e', ficticio: 1 }),
      ],
    });
    expect(r.alertas.filter((a) => a.codigo === 'sem_commit')).toEqual([{ codigo: 'sem_commit', texto: 'Projeto 1 sem commit há 36 dias', link: '/projetos/1' }]);
    expect(r.itens.find((i) => i.repo.nome_completo === 'lucas/a').alertas).toEqual(['sem_commit']);
  });
});

describe('nomeDoRepositorio', () => {
  it('usa minúsculas, sem acento, com hífens', () => {
    expect(nomeDoRepositorio('Cardápio da Dri', new Set())).toBe('cardapio-da-dri');
    expect(nomeDoRepositorio('  Loja & Café! ', new Set())).toBe('loja-cafe');
  });
  it('nome repetido ganha sufixo e título vazio vira projeto', () => {
    expect(nomeDoRepositorio('Cardápio da Dri', new Set(['cardapio-da-dri']))).toBe('cardapio-da-dri-2');
    expect(nomeDoRepositorio('Cardápio da Dri', new Set(['cardapio-da-dri', 'cardapio-da-dri-2']))).toBe('cardapio-da-dri-3');
    expect(nomeDoRepositorio('!!!', new Set())).toBe('projeto');
  });
});
