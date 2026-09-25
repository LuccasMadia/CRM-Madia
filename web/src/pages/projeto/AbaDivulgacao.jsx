import { AbaConteudos } from './AbaConteudos.jsx';
import { AbaPortfolio } from './AbaPortfolio.jsx';

export function AbaDivulgacao({ projeto }) {
  return (
    <>
      <AbaConteudos projetoId={projeto.id} />
      <AbaPortfolio projeto={projeto} />
    </>
  );
}
