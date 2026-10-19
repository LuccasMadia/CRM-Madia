// Números de um serviço numa faixa só, mais discreta que os cards do Início.
// itens: [{ rotulo, valor, destaque?: 'primaria' | 'ok' }]
export function FaixaNumeros({ itens }) {
  return (
    <div className="faixa-numeros">
      {itens.map(({ rotulo, valor, destaque }) => (
        <div key={rotulo} className={`faixa-numeros__item${destaque ? ` faixa-numeros__item--${destaque}` : ''}`}>
          <small>{rotulo}</small>
          <strong>{valor}</strong>
        </div>
      ))}
    </div>
  );
}
