import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { SeletorCategorias } from '../../components/SeletorCategorias.jsx';
import { SeletorNicho } from '../../components/SeletorNicho.jsx';
import { centavosParaTexto, paraCentavos } from '../../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { CobrancaMensal, comDiaSugerido } from './CobrancaMensal.jsx';
import { PreviaSite } from './PreviaSite.jsx';

function valoresIniciais(projeto) {
  return {
    titulo: projeto.titulo,
    cliente_id: String(projeto.cliente_id),
    nicho_id: projeto.nicho_id ? String(projeto.nicho_id) : '',
    categorias: (projeto.categorias ?? []).map((c) => c.id),
    descricao: projeto.descricao ?? '',
    notas: projeto.notas ?? '',
    data_inicio: projeto.data_inicio ?? '',
    prazo_entrega: projeto.prazo_entrega ?? '',
    data_entrega: projeto.data_entrega ?? '',
    valor: centavosParaTexto(projeto.valor_total_centavos),
    mensalidade_ativa: Boolean(projeto.mensalidade_ativa),
    mensalidade_valor: projeto.mensalidade_valor_centavos ? centavosParaTexto(projeto.mensalidade_valor_centavos) : '',
    mensalidade_dia_vencimento: projeto.mensalidade_dia_vencimento ? String(projeto.mensalidade_dia_vencimento) : '',
    dia_manual: Boolean(projeto.mensalidade_dia_vencimento),
    mensalidade_inicio_modo: projeto.mensalidade_inicio_modo ?? 'entrega',
    mensalidade_inicio_data: projeto.mensalidade_inicio_data ?? '',
    postou_instagram: Boolean(projeto.postou_instagram),
    ficticio: Boolean(projeto.ficticio),
  };
}

export function AbaGeral({ projeto, onSalvo }) {
  const navegar = useNavigate();
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { dados: categorias } = useCarregar(() => api('/categorias'), []);
  const [valores, setValores] = useState(() => valoresIniciais(projeto));
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const alterar = (parcial) => setValores((v) => comDiaSugerido({ ...v, ...parcial }));
  const texto = (nome) => ({ value: valores[nome], onChange: (e) => alterar({ [nome]: e.target.value }) });

  // Só sites e sistemas têm categorias (GMN/placas ainda abrem esta página pelas tarefas do Início).
  const temCategorias = projeto.servico === 'site_sistema';

  function salvar(e) {
    e.preventDefault();
    if (temCategorias && !valores.categorias.length) {
      setErros([{ campo: 'categorias', mensagem: 'Escolha pelo menos uma categoria' }]);
      return;
    }
    const valorCentavos = paraCentavos(valores.valor);
    if (Number.isNaN(valorCentavos)) {
      setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const mensalidadeCentavos = valores.mensalidade_ativa ? paraCentavos(valores.mensalidade_valor) : 0;
    if (valores.mensalidade_ativa && (mensalidadeCentavos === null || Number.isNaN(mensalidadeCentavos))) {
      setErros([{ campo: 'mensalidade_valor_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const { valor: _v, mensalidade_valor: _mv, dia_manual: _dm, categorias: categoriasEscolhidas, ...resto } = valores;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, {
        method: 'PUT',
        body: {
          ...resto,
          ...(temCategorias ? { categorias: categoriasEscolhidas } : {}),
          cliente_id: Number(resto.cliente_id),
          nicho_id: resto.nicho_id ? Number(resto.nicho_id) : null,
          valor_total_centavos: valorCentavos ?? 0,
          mensalidade_valor_centavos: mensalidadeCentavos ?? 0,
          mensalidade_dia_vencimento: valores.mensalidade_ativa && valores.mensalidade_dia_vencimento ? Number(valores.mensalidade_dia_vencimento) : null,
          mensalidade_inicio_data: resto.mensalidade_inicio_modo === 'data' ? resto.mensalidade_inicio_data : null,
        },
      });
      onSalvo();
    });
  }

  function excluir() {
    if (!window.confirm(`Excluir o projeto "${projeto.titulo}"? Parcelas, tarefas e dados do portfólio também serão excluídos.`)) return;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
      navegar('/funil');
    });
  }

  return (
    <form onSubmit={salvar} className="visao-geral" noValidate>
      <div className="visao-geral__principal">
        <section className="cartao">
          <h2 className="cartao__titulo">Sobre</h2>
          <Campo rotulo="Título" nome="titulo" erros={erros} {...texto('titulo')} />
          <div className="grade-campos">
            <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
              <select {...texto('cliente_id')}>
                {(clientes ?? [{ id: projeto.cliente_id, nome: projeto.cliente_nome }]).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Campo>
            <SeletorNicho valor={valores.nicho_id} onChange={(nicho_id) => alterar({ nicho_id })} />
          </div>
          {temCategorias && (
            <SeletorCategorias
              categorias={categorias ?? projeto.categorias ?? []}
              selecionadas={valores.categorias}
              onChange={(ids) => alterar({ categorias: ids })}
              erro={erros.find((e) => e.campo === 'categorias')?.mensagem}
            />
          )}
          <Campo rotulo="Descrição (interna)" nome="descricao" erros={erros}><textarea rows={3} {...texto('descricao')} /></Campo>
          <Campo rotulo="Notas" nome="notas" erros={erros}><textarea rows={4} {...texto('notas')} /></Campo>
        </section>
        <section className="cartao">
          <h2 className="cartao__titulo">Prazos</h2>
          <div className="grade-campos grade-campos--3">
            <Campo rotulo="Início" nome="data_inicio" erros={erros} type="date" {...texto('data_inicio')} />
            <Campo rotulo="Prazo de entrega" nome="prazo_entrega" erros={erros} type="date" {...texto('prazo_entrega')} />
            <Campo rotulo="Data de entrega" nome="data_entrega" erros={erros} type="date" {...texto('data_entrega')} />
          </div>
        </section>
        <section className="cartao">
          <h2 className="cartao__titulo">Cobrança</h2>
          <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" {...texto('valor')} />
          <CobrancaMensal valores={valores} alterar={alterar} erros={erros} />
        </section>
      </div>
      <aside className="visao-geral__lado">
        <PreviaSite projeto={projeto} />
        <section className="cartao">
          <p className="visao-geral__etapa">
            <span className={`etapa etapa--${projeto.etapa}`}>{ROTULO_ETAPA[projeto.etapa]}</span>
            <Link to="/funil">alterar no Funil</Link>
          </p>
          <label className="campo--check">
            <input type="checkbox" checked={valores.postou_instagram} onChange={(e) => alterar({ postou_instagram: e.target.checked })} />
            Postou no Instagram
          </label>
          <label className="campo--check">
            <input type="checkbox" checked={valores.ficticio} onChange={(e) => alterar({ ficticio: e.target.checked })} />
            Projeto fictício (só portfólio)
          </label>
        </section>
      </aside>
      <div className="visao-geral__rodape">
        <Aviso erro={erros.length ? null : erro} />
        <button className="btn btn--primario" disabled={enviando}>Salvar projeto</button>
        <button type="button" className="btn btn--link-perigo" onClick={excluir}>Excluir projeto</button>
      </div>
    </form>
  );
}
