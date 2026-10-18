import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Conteudo } from './Conteudo.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { formatarData, hojeISO } from '../lib/datas.js';

const hoje = hojeISO();
const ESTADO = { conectado: true, usuario: 'luccasmadia', ultima_sync: '2026-10-16T15:00:00.000Z', ultimo_erro: null, sincronizando: false };
const PRONTOS = [
  { id: 7, titulo: 'Reels sexta', tipo: 'reels', estado: 'pronto', data_planejada: hoje, arte: null },
  { id: 8, titulo: 'Carrossel terça', tipo: 'carrossel', estado: 'pronto', data_planejada: null, arte: 'a.png' },
];
const MIDIAS = [
  {
    id: 'm1', tipo: 'reels', legenda: 'Reels Popy', publicado_em: `${hoje}T15:00:00.000Z`, capa_url: '/uploads/instagram/m1.jpg',
    permalink: 'https://www.instagram.com/reel/m1/', curtidas: 134, comentarios: 12, alcance: 1870, visualizacoes: 2310,
    salvamentos: null, compartilhamentos: 9, projeto_id: null, conteudo_id: null, conteudo_titulo: null,
  },
];
const SEGUIDORES = [{ dia: '2026-10-01', seguidores: 1242 }, { dia: '2026-10-16', seguidores: 1284 }];

function rotas(extra = {}) {
  return {
    'GET /instagram/estado': ESTADO,
    'GET /instagram/grid': { prontos: PRONTOS, midias: MIDIAS },
    'GET /instagram/seguidores': SEGUIDORES,
    'GET /conteudos?estado=rascunho': [{ id: 9, titulo: 'Ideia bastidores', tipo: 'post', estado: 'rascunho' }],
    'GET /projetos': [{ id: 3, titulo: 'Popy' }],
    'GET /instagram/midias/m1/candidatos': [],
    ...extra,
  };
}
const abrir = () => renderizar(<Conteudo />, { rota: '/conteudo', padrao: '/conteudo' });

describe('Conteudo', () => {
  it('grid mostra prontos antes das capas; rascunhos ficam fora do grid', async () => {
    mockApi(rotas());
    abrir();
    const grid = await screen.findByRole('list', { name: 'Grid do Instagram' });
    const itens = within(grid).getAllByRole('listitem');
    expect(itens).toHaveLength(3);
    expect(within(itens[0]).getByText('Reels sexta')).toBeInTheDocument();
    expect(within(itens[1]).getByRole('img', { name: 'Carrossel terça' })).toHaveAttribute('src', '/uploads/a.png');
    expect(within(itens[2]).getByRole('img', { name: 'Reels Popy' })).toHaveAttribute('src', '/uploads/instagram/m1.jpg');
    expect(within(grid).queryByText('Ideia bastidores')).not.toBeInTheDocument();
    const rascunhos = screen.getByRole('region', { name: 'Rascunhos' });
    expect(within(rascunhos).getByText('Ideia bastidores')).toBeInTheDocument();
  });

  it('resumo mostra seguidores e crescimento em 30 dias', async () => {
    mockApi(rotas());
    abrir();
    expect(await screen.findByText('1.284 seguidores')).toBeInTheDocument();
    expect(screen.getByText('+42 em 30 dias')).toBeInTheDocument();
  });

  it('clicar num post mostra os números no painel', async () => {
    mockApi(rotas());
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver post Reels Popy' }));
    const painel = screen.getByRole('complementary', { name: 'Detalhes do post' });
    expect(within(painel).getByText('Curtidas').nextSibling).toHaveTextContent('134');
    expect(within(painel).getByText('Salvamentos').nextSibling).toHaveTextContent('—');
    expect(within(painel).getByRole('link', { name: 'Abrir no Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/reel/m1/');
  });

  it('liga um post a um planejado sugerido', async () => {
    const { chamadas } = mockApi(rotas({
      'GET /instagram/midias/m1/candidatos': [PRONTOS[0], PRONTOS[1]],
      'POST /instagram/midias/m1/vinculo': {},
    }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver post Reels Popy' }));
    expect(await screen.findByText('Era um destes planejados?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ligar' }));
    expect(chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/instagram/midias/m1/vinculo').corpo).toEqual({ conteudo_id: 7 });
  });

  it('post ligado mostra o planejado e permite desfazer', async () => {
    const ligado = { ...MIDIAS[0], conteudo_id: 7, conteudo_titulo: 'Reels sexta' };
    const { chamadas } = mockApi(rotas({
      'GET /instagram/grid': { prontos: [], midias: [ligado] },
      'DELETE /instagram/midias/m1/vinculo': {},
    }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver post Reels Popy' }));
    expect(screen.getByText('Ligado a: Reels sexta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/instagram/midias/m1/vinculo')).toBe(true);
  });

  it('escolhe o projeto do post', async () => {
    const { chamadas } = mockApi(rotas({ 'PUT /instagram/midias/m1': {} }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver post Reels Popy' }));
    await user.selectOptions(await screen.findByLabelText('Projeto do post'), '3');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ projeto_id: 3 });
  });

  it('Atualizar agora sincroniza e recarrega o grid', async () => {
    const { chamadas } = mockApi(rotas({ 'POST /instagram/sincronizar': { novas: 1, atualizadas: 0 } }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Atualizar agora' }));
    await screen.findByRole('button', { name: 'Atualizar agora' });
    const depois = chamadas.slice(chamadas.findIndex((c) => c.metodo === 'POST'));
    expect(depois.some((c) => c.caminho === '/instagram/grid')).toBe(true);
  });

  it('erro da última sincronização aparece como aviso', async () => {
    mockApi(rotas({ 'GET /instagram/estado': { ...ESTADO, ultimo_erro: 'O acesso ao Instagram expirou. Reconecte em Configurações.' } }));
    abrir();
    expect(await screen.findByText(/Reconecte em Configurações/)).toBeInTheDocument();
  });

  it('desconectado convida a conectar e ainda mostra os prontos', async () => {
    mockApi(rotas({ 'GET /instagram/estado': { ...ESTADO, conectado: false }, 'GET /instagram/grid': { prontos: PRONTOS, midias: [] } }));
    abrir();
    expect(await screen.findByRole('link', { name: 'Conecte seu Instagram' })).toHaveAttribute('href', '/config');
    expect(screen.getByText('Reels sexta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar agora' })).not.toBeInTheDocument();
  });

  it('move um pronto para depois na fila', async () => {
    const { chamadas } = mockApi(rotas({ 'PUT /conteudos/ordem': null }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mover Reels sexta para depois' }));
    expect(chamadas.find((c) => c.caminho === '/conteudos/ordem').corpo).toEqual({ ids: [8, 7] });
  });

  it('clicar num pronto abre o formulário de edição', async () => {
    mockApi(rotas());
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Editar Reels sexta' }));
    expect(screen.getByRole('dialog', { name: 'Editar planejado' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Reels sexta');
  });

  it('cria um planejado novo', async () => {
    const { chamadas } = mockApi(rotas({ 'POST /conteudos': { id: 10 } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Planejar' }));
    await user.type(screen.getByLabelText('Título'), 'Novo reels');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: '+ Planejar' });
    expect(chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/conteudos').corpo).toMatchObject({ titulo: 'Novo reels', tipo: 'post' });
  });

  it('se a arte falha ao subir, salvar de novo atualiza o planejado em vez de criar outro', async () => {
    const { chamadas } = mockApi(rotas({
      'POST /conteudos': { id: 10, titulo: 'Novo reels', tipo: 'post', estado: 'rascunho' },
      'POST /conteudos/10/arte': resposta(500, { erro: 'Falha no upload' }),
      'PUT /conteudos/10': { id: 10 },
    }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Planejar' }));
    await user.type(screen.getByLabelText('Título'), 'Novo reels');
    await user.upload(screen.getByLabelText('Arte'), new File(['png'], 'arte.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Falha no upload')).toBeInTheDocument();
    chamadas.length = 0;
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: '+ Planejar' });
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/conteudos')).toBe(false);
    expect(chamadas.some((c) => c.metodo === 'PUT' && c.caminho === '/conteudos/10')).toBe(true);
  });

  it('desconectado, clicar num post já sincronizado mostra os números', async () => {
    mockApi(rotas({ 'GET /instagram/estado': { ...ESTADO, conectado: false } }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver post Reels Popy' }));
    const painel = screen.getByRole('complementary', { name: 'Detalhes do post' });
    expect(within(painel).getByText('Curtidas').nextSibling).toHaveTextContent('134');
  });

  it('calendário mostra planejados com data e publicados no dia', async () => {
    mockApi(rotas());
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Calendário' }));
    const dia = screen.getByLabelText(formatarData(hoje));
    expect(within(dia).getByRole('button', { name: 'Reels sexta' })).toBeInTheDocument();
    expect(within(dia).getByRole('button', { name: 'Reels Popy' })).toBeInTheDocument();
  });
});

describe('Conteudo — datas', () => {
  it('mostra a data do post no dia local, não no dia UTC', async () => {
    const iso = '2026-10-17T01:00:00.000Z'; // 21h do dia 16 em UTC-4
    const diaLocal = new Date(iso).toLocaleDateString('sv-SE');
    mockApi(rotas({ 'GET /instagram/grid': { prontos: [], midias: [{ ...MIDIAS[0], publicado_em: iso }] } }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver post Reels Popy' }));
    const painel = screen.getByRole('complementary', { name: 'Detalhes do post' });
    expect(within(painel).getByText(`Reels · ${formatarData(diaLocal)}`)).toBeInTheDocument();
  });
});

describe('Conteudo — vínculo ao trocar de post', () => {
  it('a escolha do planejado não passa de um post para outro', async () => {
    const outra = { ...MIDIAS[0], id: 'm2', legenda: 'Outro post' };
    const { chamadas } = mockApi(rotas({
      'GET /instagram/grid': { prontos: PRONTOS, midias: [MIDIAS[0], outra] },
      'GET /instagram/midias/m1/candidatos': [PRONTOS[0], PRONTOS[1]],
      'GET /instagram/midias/m2/candidatos': [PRONTOS[0], PRONTOS[1]],
      'POST /instagram/midias/m2/vinculo': {},
    }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver post Reels Popy' }));
    await user.selectOptions(await screen.findByLabelText('Era um destes planejados?'), '8');
    await user.click(screen.getByRole('button', { name: 'Ver post Outro post' }));
    await screen.findByLabelText('Era um destes planejados?');
    await user.click(screen.getByRole('button', { name: 'Ligar' }));
    expect(chamadas.find((c) => c.caminho === '/instagram/midias/m2/vinculo').corpo).toEqual({ conteudo_id: 7 });
  });
});

describe('Conteudo — reconectar', () => {
  it('erro de sync traz link para Configurações', async () => {
    mockApi(rotas({ 'GET /instagram/estado': { ...ESTADO, ultimo_erro: 'O acesso ao Instagram expirou. Reconecte em Configurações.' } }));
    abrir();
    expect(await screen.findByRole('link', { name: 'Abrir Configurações' })).toHaveAttribute('href', '/config');
  });
});
