import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { prepararMidia } from './midiaArquivo.js';
import { ErroHttp } from '../http/erros.js';

let raiz;
let uploadsDir;

beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), 'midia-'));
  uploadsDir = path.join(raiz, 'uploads');
  mkdirSync(uploadsDir);
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

async function gerarPng(nome, largura, altura) {
  const caminho = path.join(uploadsDir, nome);
  await sharp({ create: { width: largura, height: altura, channels: 3, background: '#c03' } })
    .png()
    .toFile(caminho);
  return caminho;
}

describe('prepararMidia', () => {
  it('converte imagem para jpeg, apaga o original e devolve as dimensões', async () => {
    const original = await gerarPng('original.png', 800, 1000);

    const resultado = await prepararMidia(
      { path: original, filename: 'original.png', mimetype: 'image/png' },
      uploadsDir,
    );

    expect(resultado.tipo).toBe('imagem');
    expect(resultado.arquivo).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(existsSync(path.join(uploadsDir, resultado.arquivo))).toBe(true);
    expect(existsSync(original)).toBe(false);
    expect(resultado.largura).toBe(800);
    expect(resultado.altura).toBe(1000);

    const metadados = await sharp(path.join(uploadsDir, resultado.arquivo)).metadata();
    expect(metadados.format).toBe('jpeg');
  });

  it('reduz imagem larga para 1440 px de largura sem ampliar as pequenas', async () => {
    const grande = await gerarPng('grande.png', 3000, 3000);
    const resultado = await prepararMidia(
      { path: grande, filename: 'grande.png', mimetype: 'image/png' },
      uploadsDir,
    );
    expect(resultado.largura).toBe(1440);
    expect(resultado.altura).toBe(1440);
  });

  it('não amplia imagem menor que 1440 px', async () => {
    const pequena = await gerarPng('pequena.png', 500, 300);
    const resultado = await prepararMidia(
      { path: pequena, filename: 'pequena.png', mimetype: 'image/png' },
      uploadsDir,
    );
    expect(resultado.largura).toBe(500);
    expect(resultado.altura).toBe(300);
  });

  it('devolve vídeo intacto, sem dimensões', async () => {
    const video = path.join(uploadsDir, 'x.mp4');
    writeFileSync(video, Buffer.from([0, 1, 2, 3, 4, 5]));

    const resultado = await prepararMidia({ path: video, filename: 'x.mp4', mimetype: 'video/mp4' }, uploadsDir);

    expect(resultado).toEqual({ arquivo: 'x.mp4', tipo: 'video', largura: null, altura: null });
    expect(readFileSync(video)).toEqual(Buffer.from([0, 1, 2, 3, 4, 5]));
  });

  it('imagem que não pode ser lida vira erro 400 e o original é removido', async () => {
    const corrompida = path.join(uploadsDir, 'ruim.png');
    writeFileSync(corrompida, 'isto não é uma imagem');

    const erro = await prepararMidia(
      { path: corrompida, filename: 'ruim.png', mimetype: 'image/png', originalname: 'foto-ruim.png' },
      uploadsDir,
    ).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(400);
    expect(erro.message).toBe('Não foi possível ler a imagem foto-ruim.png.');
    expect(existsSync(corrompida)).toBe(false);
  });
});
