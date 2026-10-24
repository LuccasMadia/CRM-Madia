import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Modal } from '../Modal.jsx';
import { Aviso } from '../Aviso.jsx';
import { Carregando } from '../Carregando.jsx';
import { formatarData } from '../../lib/datas.js';
import { notificar } from '../../lib/notificacoes.js';
import { plural, TIPOS_TAREFA } from '../../lib/tarefas.js';

// Modelos de tarefas; se não carregarem, as telas seguem sem oferecer modelo.
export function useModelosTarefas() {
  const { dados } = useCarregar(() => api('/tarefas-modelos'), []);
  return dados ?? [];
}

// O padrão de um serviço é o primeiro modelo daquele tipo (a lista já vem por nome).
export const modeloPadrao = (modelos, tipo) => modelos.find((m) => m.tipo === tipo) ?? null;

// Caixinha "Criar tarefas do modelo X" dos formulários de criação; some quando não há modelo do tipo.
export function CaixaModeloTarefas({ modelo, marcado, onMudar }) {
  if (!modelo) return null;
  return (
    <label className="campo--check caixa-modelo">
      <input type="checkbox" checked={marcado} onChange={(e) => onMudar(e.target.checked)} />
      {`Criar tarefas do modelo ${modelo.nome} (${modelo.itens.length})`}
    </label>
  );
}

// "Aplicar modelo" na aba Tarefas do projeto: escolhe o modelo (o do serviço vem primeiro),
// mostra o que será criado e o que já existe, e cria só o que falta.
export function AplicarModelo({ projetoId, servico, onFechar, onAplicado }) {
  const modelos = useCarregar(() => api('/tarefas-modelos'), []);
  const [escolhido, setEscolhido] = useState('');
  const lista = modelos.dados ?? [];
  const modeloId = escolhido || String(modeloPadrao(lista, servico)?.id ?? lista[0]?.id ?? '');
  const previa = useCarregar(
    () => (modeloId ? api(`/projetos/${projetoId}/aplicar-modelo?modelo_id=${modeloId}`) : Promise.resolve(null)), [modeloId],
  );
  const envio = useEnvio();
  const novos = previa.dados?.itens.filter((i) => !i.ja_existe) ?? [];

  function aplicar() {
    envio.executar(async () => {
      const { criadas } = await api(`/projetos/${projetoId}/aplicar-modelo`, { method: 'POST', body: { modelo_id: Number(modeloId) } });
      notificar(criadas ? `${plural(criadas, 'tarefa criada', 'tarefas criadas')} do modelo.` : 'Nenhuma tarefa nova: todas já existiam.');
      onAplicado();
      onFechar();
    });
  }

  return (
    <Modal titulo="Aplicar modelo de tarefas" onFechar={onFechar}>
      <div className="aplicar-modelo">
        <Aviso erro={modelos.erro ?? previa.erro ?? envio.erro} />
        {!modelos.dados ? (!modelos.erro && <Carregando />) : !lista.length ? (
          <p className="vazio">Nenhum modelo cadastrado. Crie um em Configurações › Modelos de tarefas.</p>
        ) : (
          <>
            <div className="campo">
              <label htmlFor="modelo-aplicar">Modelo</label>
              <select id="modelo-aplicar" value={modeloId} onChange={(e) => setEscolhido(e.target.value)}>
                {lista.map((m) => <option key={m.id} value={m.id}>{`${m.nome} · ${TIPOS_TAREFA[m.tipo].rotulo}`}</option>)}
              </select>
            </div>
            {previa.dados && (
              <ol className="aplicar-modelo__previa" aria-label="Prévia das tarefas">
                {previa.dados.itens.map((i) => (
                  <li key={i.texto} className={i.ja_existe ? 'aplicar-modelo__item aplicar-modelo__item--existe' : 'aplicar-modelo__item'}>
                    <span>{i.texto}</span>
                    <small>{i.ja_existe ? 'já existe, não repete' : i.prazo ? `prazo ${formatarData(i.prazo)}` : 'sem prazo'}</small>
                  </li>
                ))}
              </ol>
            )}
            <div className="form--linha">
              <button type="button" className="btn btn--primario" disabled={envio.enviando || !novos.length} onClick={aplicar}>
                {novos.length ? `Criar ${plural(novos.length, 'tarefa', 'tarefas')}` : 'Nada novo para criar'}
              </button>
              <button type="button" className="btn btn--fantasma" onClick={onFechar}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// "Criar lembrete de cobrança" nos lugares de a receber: a tarefa nasce ligada e fecha sozinha ao receber.
export function BotaoLembreteCobranca({ parcelaId = null, placaVendaId = null, nome }) {
  const envio = useEnvio();
  const [feito, setFeito] = useState(false);
  function criar() {
    envio.executar(async () => {
      const t = await api('/tarefas/lembrete-cobranca', { method: 'POST', body: parcelaId ? { parcela_id: parcelaId } : { placa_venda_id: placaVendaId } });
      setFeito(true);
      notificar(t.ja_existia ? 'Já existe um lembrete aberto para esta cobrança.' : `Lembrete criado em Tarefas: "${t.texto}".`);
    });
  }
  return (
    <>
      <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Criar lembrete de cobrança de ${nome}`} title={envio.erro?.message}
        disabled={envio.enviando || feito} onClick={criar}>
        {feito ? 'Lembrete criado' : 'Criar lembrete'}
      </button>
      {envio.erro && <span className="campo__erro" role="alert">{envio.erro.message}</span>}
    </>
  );
}
