import { describe, it, expect, afterEach } from 'vitest';
import { rotularTabelas } from './rotularTabelas.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('rotularTabelas', () => {
  it('copia o nome da coluna para cada célula, contando colSpan', () => {
    document.body.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Cliente</th><th>Valor</th><th></th></tr></thead>
        <tbody>
          <tr><td>Ana</td><td>R$ 10</td><td>ações</td></tr>
          <tr><td colspan="2">Divisória</td><td>x</td></tr>
        </tbody>
      </table>`;
    const parar = rotularTabelas();
    const [a, b] = document.querySelectorAll('tbody tr');
    expect([...a.children].map((td) => td.dataset.rotulo)).toEqual(['Cliente', 'Valor', '']);
    expect([...b.children].map((td) => td.dataset.rotulo)).toEqual(['Cliente', '']);
    parar();
  });

  it('rotula linhas que entram depois', async () => {
    document.body.innerHTML = '<table class="tabela"><thead><tr><th>Nome</th></tr></thead><tbody></tbody></table>';
    const parar = rotularTabelas();
    document.querySelector('tbody').insertAdjacentHTML('beforeend', '<tr><td>Rango</td></tr>');
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok)));
    expect(document.querySelector('td').dataset.rotulo).toBe('Nome');
    parar();
  });

  it('ignora tabela sem cabeçalho', () => {
    document.body.innerHTML = '<table class="tabela"><tbody><tr><td>jan</td></tr></tbody></table>';
    rotularTabelas()();
    expect(document.querySelector('td').dataset.rotulo).toBeUndefined();
  });
});
