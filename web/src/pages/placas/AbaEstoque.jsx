import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FaixaNumeros } from '../../components/FaixaNumeros.jsx';
import { FormPlacaMontagem } from '../../components/FormPlacaMontagem.jsx';
import { AvisoEstoqueMontagem } from './AbaMontagem.jsx';

function Montadas({ montadas }) {
  return (
    <section className="cartao" aria-labelledby="titulo-montadas">
      <h2 id="titulo-montadas">Montadas, prontas para vender</h2>
      {montadas.length ? (
        <ul className="lista-montadas">
          {montadas.map((m) => (
            <li key={m.modelo_id}>
              <span>
                {m.modelo_nome}
                {m.da_pra_montar !== null && <small className="vazio">{`os materiais dão para mais ${m.da_pra_montar}`}</small>}
              </span>
              <strong className={m.montadas <= 0 ? 'lista-montadas__zerada' : undefined}>{m.montadas}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhum modelo ativo.</p>}
    </section>
  );
}

function Materiais({ materiais }) {
  return (
    <section className="cartao" aria-labelledby="titulo-materiais">
      <h2 id="titulo-materiais">Materiais em estoque</h2>
      {materiais.length ? (
        <ul className="lista-montadas">
          {materiais.map((m) => (
            <li key={m.material_id}>
              <span>{m.nome}</span>
              {m.estoque_atual < 0
                ? <span className="etiqueta etiqueta--atrasada">{m.estoque_atual}</span>
                : <strong>{m.estoque_atual}</strong>}
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhum material cadastrado.</p>}
    </section>
  );
}

// Só o que tem na mão: placas montadas e materiais. Dinheiro (lucro, custos) fica em Vendas e no Financeiro.
export function AbaEstoque({ resumo, erro, seletor, onMudou }) {
  const [montando, setMontando] = useState(false);
  const [avisosEstoque, setAvisosEstoque] = useState([]);

  async function montar(dados) {
    const res = await api('/placas/montagens', { method: 'POST', body: dados });
    setMontando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    onMudou();
  }

  const somar = (lista, campo) => lista.reduce((s, m) => s + Math.max(0, m[campo] ?? 0), 0);

  return (
    <section>
      <div className="barra-visao">
        {seletor}
        <button type="button" className="btn btn--primario barra-visao__acao" onClick={() => setMontando(true)}>+ Montar</button>
      </div>
      <Aviso erro={erro} />
      <AvisoEstoqueMontagem avisos={avisosEstoque} />
      {resumo && (
        <>
          <FaixaNumeros
            itens={[
              { rotulo: 'Montadas prontas', valor: somar(resumo.montadas, 'montadas'), destaque: 'primaria' },
              { rotulo: 'Dá para montar mais', valor: somar(resumo.montadas, 'da_pra_montar') },
              { rotulo: 'Materiais em falta', valor: resumo.materiais.filter((m) => m.estoque_atual < 0).length },
            ]}
          />
          <div className="painel-placas">
            <Montadas montadas={resumo.montadas} />
            <Materiais materiais={resumo.materiais} />
          </div>
          <p className="vazio estoque-placas__rodape">
            Lucro por modelo fica em <Link to="/servicos?aba=placas&placas=vendas&sub=por_modelo">Vendas</Link>; custo das compras de material, no <Link to="/financeiro?aba=custos">Financeiro</Link>.
          </p>
        </>
      )}
      {montando && (
        <Modal titulo="Montar placas" onFechar={() => setMontando(false)}>
          <FormPlacaMontagem onSalvar={montar} />
        </Modal>
      )}
    </section>
  );
}
