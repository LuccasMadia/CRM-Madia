import { describe, it, expect } from 'vitest';
import { githubFalso } from '../test/githubFalso.js';
import { criarClienteFigma, ErroFigma } from './cliente.js';

const BASE = 'https://api.figma.com/v1';

describe('cliente do Figma', () => {
  it('lê o usuário e o arquivo mandando o token no cabeçalho do Figma', async () => {
    const { fetch, requisicoes } = githubFalso({
      [`${BASE}/me`]: { handle: 'lucas', email: 'x@y.z' },
      [`${BASE}/files/AbC123?depth=1`]: { name: 'Site Ana', lastModified: '2026-11-20T10:00:00Z', thumbnailUrl: 'https://t' },
    });
    const cliente = criarClienteFigma({ token: 'figd_tok', fetch });
    expect(await cliente.usuario()).toBe('lucas');
    expect(await cliente.arquivo('AbC123')).toEqual({ nome: 'Site Ana', editado_em: '2026-11-20T10:00:00Z', url: 'https://www.figma.com/design/AbC123' });
    expect(requisicoes[0].headers['X-Figma-Token']).toBe('figd_tok');
  });

  it('403 vira erro de token inválido com a mensagem do Figma em português', async () => {
    const { fetch } = githubFalso({ [`${BASE}/me`]: { status: 403, corpo: {} } });
    const erro = await criarClienteFigma({ token: 'x', fetch }).usuario().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroFigma);
    expect(erro.tokenInvalido).toBe(true);
    expect(erro.message).toBe('Token do Figma inválido ou sem permissão. Cole um novo em Configurações → Figma.');
  });

  it('404 do arquivo vira "não encontrado" e falha de rede vira mensagem de internet', async () => {
    const { fetch } = githubFalso({ [`${BASE}/files/Nada?depth=1`]: { status: 404, corpo: {} } });
    const naoAchou = await criarClienteFigma({ token: 'x', fetch }).arquivo('Nada').catch((e) => e);
    expect(naoAchou).toMatchObject({ status: 404, message: 'Arquivo do Figma não encontrado.' });
    const semRede = await criarClienteFigma({ token: 'x', fetch: () => Promise.reject(new Error('rede')) }).usuario().catch((e) => e);
    expect(semRede.message).toBe('Não foi possível falar com o Figma. Verifique a internet.');
  });
});
