import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { FaixaNumeros } from '../../components/FaixaNumeros.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, hojeISO, diasDesde } from '../../lib/datas.js';

const entregueNoMes = (p) => p.etapa === 'entregue' && p.data_entrega?.slice(0, 7) === hojeISO().slice(0, 7);

// Números de cada serviço, além do "A receber" que todos têm.
const NUMEROS = {
  site_sistema: [
    ['Em andamento', (p) => p.etapa === 'andamento'],
    ['Entregues no mês', entregueNoMes],
  ],
  google_meu_negocio: [
    ['Pendentes', (p) => p.etapa !== 'entregue' && p.etapa !== 'perdido'],
    ['Configurados no mês', entregueNoMes],
  ],
};

const linkDoProjeto = (p) => (p.servico === 'site_sistema' ? `/projetos/${p.projeto_id}` : `/clientes/${p.cliente_id}?aba=gmn`);

function Vencimento({ parcela }) {
  const faltam = -diasDesde(parcela.vencimento);
  if (parcela.estado === 'atrasada') return <span className="etiqueta etiqueta--atrasada">Atrasada</span>;
  if (faltam <= 7) return <span className="etiqueta etiqueta--proposta">{faltam === 0 ? 'Vence hoje' : `Vence em ${faltam} ${faltam === 1 ? 'dia' : 'dias'}`}</span>;
  return <span className="etiqueta">{formatarData(parcela.vencimento)}</span>;
}

export function PainelReceber({ servico }) {
  const { dados: projetos } = useCarregar(() => api(`/projetos?servico=${servico}`), [servico]);
  const { dados: parcelas, erro, recarregar } = useCarregar(() => api(`/parcelas?servico=${servico}`), [servico]);
  const envio = useEnvio();
  const abertas = (parcelas ?? []).filter((p) => !p.pago_em);
  const total = abertas.reduce((s, p) => s + p.valor_centavos, 0);

  function receber(parcela) {
    envio.executar(async () => {
      await api(`/parcelas/${parcela.id}`, { method: 'PUT', body: { pago_em: hojeISO() } });
      recarregar();
    });
  }

  return (
    <div className="painel-receber">
      <Aviso erro={erro ?? envio.erro} />
      <FaixaNumeros
        itens={[
          parcelas && !abertas.length
            ? { rotulo: 'A receber', valor: '✓ Tudo recebido', destaque: 'ok' }
            : { rotulo: 'A receber', valor: parcelas ? formatarDinheiro(total) : '—', destaque: 'primaria' },
          ...NUMEROS[servico].map(([rotulo, conta]) => ({ rotulo, valor: projetos ? projetos.filter(conta).length : '—' })),
        ]}
      />
      {abertas.length > 0 && (
        <section className="cartao" aria-labelledby={`titulo-receber-${servico}`}>
          <h2 id={`titulo-receber-${servico}`}>A receber</h2>
          <table className="tabela">
              <thead><tr><th>Cliente</th><th>Projeto</th><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th></th></tr></thead>
              <tbody>
                {abertas.map((p) => (
                  <tr key={p.id}>
                    <td>{p.cliente_nome}</td>
                    <td><Link to={linkDoProjeto(p)}>{p.projeto_titulo}</Link></td>
                    <td>{p.descricao ?? '—'}</td>
                    <td><Vencimento parcela={p} /></td>
                    <td className="num">{formatarDinheiro(p.valor_centavos)}</td>
                    <td className="num">
                      <button type="button" className="btn btn--primario btn--pequeno" aria-label={`Recebi de ${p.cliente_nome} — ${p.descricao ?? 'parcela'}`} onClick={() => receber(p)}>Recebi</button>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
