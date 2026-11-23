// Popula o CRM com dados fictícios através da API (a mesma validação do app).
// Uso: com a API rodando (npm run dev), `node scripts/seed-ficticio.mjs [http://127.0.0.1:5174]`
const BASE = process.argv[2] ?? 'http://127.0.0.1:5174';

async function api(metodo, caminho, corpo) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-CRM': '1' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await res.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!res.ok) throw new Error(`${metodo} ${caminho} -> ${res.status} ${texto}`);
  return json;
}

const hoje = new Date();
const dia = (delta) => {
  const d = new Date(hoje);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};
const reais = (v) => Math.round(v * 100);

const existentes = await api('GET', '/api/clientes');
if (existentes.length) {
  console.error(`O banco já tem ${existentes.length} cliente(s). Abortando para não duplicar.`);
  process.exit(1);
}

const dadosClientes = [
  ['Clínica Sorriso Vivo', 'Dra. Helena Prado', 'helena@sorrisovivo.example', '(11) 99100-1001', '@sorrisovivo', 'Indicação'],
  ['Padaria Pão Dourado', 'Seu Marcos', 'contato@paodourado.example', '(11) 99100-1002', '@paodourado', 'Instagram'],
  ['Studio Forma Pilates', 'Camila Duarte', 'camila@formapilates.example', '(21) 99100-1003', '@formapilates', 'Instagram'],
  ['Auto Center Rápido', 'Rogério Lima', 'rogerio@autocenter.example', '(31) 99100-1004', '@autocenterrapido', 'Google'],
  ['Barbearia Navalha', 'Diego Souza', 'diego@navalha.example', '(11) 99100-1005', '@barbearianavalha', 'Indicação'],
  ['Escritório Alves & Costa', 'Patrícia Alves', 'patricia@alvescosta.example', '(41) 99100-1006', '', 'Site'],
  ['Pet Shop Amigo Fiel', 'Juliana Reis', 'juliana@amigofiel.example', '(11) 99100-1007', '@amigofielpet', 'Instagram'],
  ['Restaurante Sabor da Terra', 'Tiago Nunes', 'tiago@sabordaterra.example', '(51) 99100-1008', '@sabordaterra', 'Indicação'],
];
const clientes = [];
for (const [nome, responsavel, email, telefone, instagram, origem] of dadosClientes) {
  clientes.push(await api('POST', '/api/clientes', { nome, responsavel, email, telefone, instagram, origem }));
}
const [sorriso, padaria, pilates, auto, barbearia, alves, pet, sabor] = clientes;

// [cliente, título, etapa, valor, extras]
const projetosBase = [
  [sorriso, 'Site institucional da clínica', 'entregue', 4200, { data_inicio: dia(-90), prazo_entrega: dia(-45), postou_instagram: 1 }],
  [padaria, 'Cardápio digital com pedidos', 'andamento', 2800, { data_inicio: dia(-20), prazo_entrega: dia(12) }],
  [pilates, 'Landing page de matrículas', 'andamento', 1900, { data_inicio: dia(-8), prazo_entrega: dia(7) }],
  [auto, 'Sistema de ordens de serviço', 'valor_definido', 7500, { prazo_entrega: dia(45) }],
  [barbearia, 'Site com agendamento online', 'apresentado', 3100, {}],
  [alves, 'Portal do cliente', 'prototipo', 6400, {}],
  [pet, 'Loja virtual', 'ideia', 5200, {}],
  [sabor, 'Site do restaurante', 'perdido', 2500, {}],
  [sorriso, 'Landing page de clareamento', 'teste', 1500, { teste_inicio: dia(-3) }],
];
const projetos = [];
for (const [cliente, titulo, etapa, valor, extras] of projetosBase) {
  projetos.push(await api('POST', '/api/projetos', {
    cliente_id: cliente.id, titulo, etapa, valor_total_centavos: reais(valor), ...extras,
  }));
}
const [pSorriso, pPadaria, pPilates, pAuto, , , , , pClareamento] = projetos;

// Parcelas: um projeto quitado, um parcelado em andamento, um com parcela atrasada.
await api('POST', `/api/projetos/${pSorriso.id}/parcelas`, { descricao: 'Entrada', valor_centavos: reais(2100), vencimento: dia(-90), pago_em: dia(-90) });
await api('POST', `/api/projetos/${pSorriso.id}/parcelas`, { descricao: 'Entrega', valor_centavos: reais(2100), vencimento: dia(-45), pago_em: dia(-44) });
await api('POST', `/api/projetos/${pPadaria.id}/parcelas`, { descricao: 'Entrada', valor_centavos: reais(1400), vencimento: dia(-20), pago_em: dia(-19) });
await api('POST', `/api/projetos/${pPadaria.id}/parcelas`, { descricao: 'Entrega', valor_centavos: reais(1400), vencimento: dia(12) });
await api('POST', `/api/projetos/${pPilates.id}/parcelas`, { descricao: 'Entrada', valor_centavos: reais(950), vencimento: dia(-8), pago_em: dia(-8) });
await api('POST', `/api/projetos/${pPilates.id}/parcelas`, { descricao: 'Entrega', valor_centavos: reais(950), vencimento: dia(-2) });
await api('POST', `/api/projetos/${pAuto.id}/parcelas/lote`, { quantidade: 3, valor_centavos: reais(2500), primeira_vencimento: dia(15) });
await api('POST', `/api/projetos/${pClareamento.id}/parcelas`, { descricao: 'Pagamento', valor_centavos: reais(1500), vencimento: dia(20) });

// Tarefas
const tarefas = [
  ['Enviar proposta revisada para Auto Center', dia(2), pAuto],
  ['Gravar vídeo de apresentação do cardápio', dia(4), pPadaria],
  ['Cobrar parcela atrasada do Studio Forma', dia(-1), pPilates],
  ['Ajustar cores da landing de clareamento', dia(1), pClareamento],
  ['Pedir depoimento para a Clínica Sorriso Vivo', dia(7), pSorriso],
];
for (const [texto, prazo, projeto] of tarefas) {
  await api('POST', '/api/tarefas', { texto, prazo, projeto_id: projeto.id, cliente_id: projeto.cliente_id });
}
await api('POST', '/api/tarefas', { texto: 'Renovar domínio do portfólio', prazo: dia(10) });
await api('POST', '/api/tarefas', { texto: 'Postar case do site da clínica', prazo: dia(-5), concluida: 1, projeto_id: pSorriso.id, cliente_id: pSorriso.cliente_id });

console.log(`Pronto: ${clientes.length} clientes, ${projetos.length} projetos, parcelas e tarefas fictícias criados.`);
