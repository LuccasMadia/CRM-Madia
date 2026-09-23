import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

export function renderizar(elemento, { rota = '/', padrao = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path={padrao} element={elemento} />
        <Route path="*" element={<p>Outra página</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
