import PDFDocument from 'pdfkit';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = (centavos) => moeda.format((centavos ?? 0) / 100);

function dataBr(iso) {
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

function valorDoItem(i) {
  if (i.valor_unico_centavos > 0) return dinheiro(i.valor_unico_centavos);
  if (i.valor_mensal_centavos > 0) return `${dinheiro(i.valor_mensal_centavos)}/mês`;
  return dinheiro(0);
}

// Estrutura só de textos já formatados; o desenho fica em gerarPdf.
export function modeloDocumento(orcamento, { whatsapp } = {}) {
  const { totais } = orcamento;
  const rodape = [
    `Forma de pagamento: ${orcamento.pagamento} · Prazo: ${orcamento.prazo}`,
    whatsapp ? `WhatsApp ${whatsapp} · @madia.consultoria` : '@madia.consultoria',
  ];
  if (orcamento.observacao) rodape.push(orcamento.observacao);
  return {
    cabecalho: {
      marca: 'Madia Consultoria',
      sub: 'por Luccas Madia · luccasmadia.com.br',
      numero: `Orçamento nº ${String(orcamento.numero).padStart(3, '0')}`,
      data: dataBr(orcamento.data),
      validade: `Válido por ${orcamento.validade_dias} dias`,
    },
    para: orcamento.cliente_nome ?? '',
    itens: orcamento.itens.map((i) => ({
      nome: i.quantidade > 1 ? `${i.nome} × ${i.quantidade}` : i.nome,
      frase: i.frase ?? '',
      valor: valorDoItem(i),
    })),
    desconto: totais.desconto_centavos > 0
      ? { rotulo: `Desconto combo (${orcamento.desconto_pct}%)`, valor: `- ${dinheiro(totais.desconto_centavos)}` }
      : null,
    total_unico: dinheiro(totais.total_unico_centavos),
    mensalidades: totais.mensalidades.map((m) => ({ nome: m.nome, valor: `${dinheiro(m.valor_centavos)}/mês` })),
    rodape,
  };
}

const TURQUESA = '#2dd4bf';
const ESCURO = '#1a1a1a';
const CINZA = '#666666';
const CINZA_CLARO = '#777777';
const LINHA = '#eeeeee';
const COMBO = '#0f9e8c';
const FUNDO_TOTAL = '#f3fbfa';

export function gerarPdf(modelo) {
  return new Promise((resolve, reject) => {
    const margem = 50;
    const doc = new PDFDocument({ size: 'A4', margin: margem, info: { Title: modelo.cabecalho.numero, Author: 'Madia Consultoria' } });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const esq = margem;
    const dir = doc.page.width - margem;
    const largura = dir - esq;
    const colValor = 130;
    const larguraNome = largura - colValor - 10;

    // Cabeçalho
    const topo = margem;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(ESCURO).text(modelo.cabecalho.marca, esq, topo, { lineBreak: false });
    doc.font('Helvetica').fontSize(10.5).fillColor(CINZA).text(modelo.cabecalho.sub, esq, topo + 24, { lineBreak: false });
    doc.font('Helvetica').fontSize(10.5).fillColor(CINZA);
    [modelo.cabecalho.numero, modelo.cabecalho.data, modelo.cabecalho.validade].forEach((t, k) => {
      doc.text(t, esq, topo + k * 14, { width: largura, align: 'right', lineBreak: false });
    });
    const yLinha = topo + 50;
    doc.lineWidth(3).strokeColor(TURQUESA).moveTo(esq, yLinha).lineTo(dir, yLinha).stroke();

    // Para
    let y = yLinha + 22;
    doc.font('Helvetica').fontSize(12).fillColor(ESCURO).text('Para', esq, y, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(15).text(modelo.para, esq, y + 16, { width: largura, lineBreak: false });
    y += 52;

    const garantirEspaco = (altura) => {
      if (y + altura > doc.page.height - margem) { doc.addPage(); y = margem; }
    };

    // Itens
    const linhaItem = ({ nome, frase, valor }, cor = ESCURO) => {
      doc.font('Helvetica').fontSize(12);
      const hNome = doc.heightOfString(nome, { width: larguraNome });
      doc.fontSize(10.5);
      const hFrase = frase ? doc.heightOfString(frase, { width: larguraNome }) : 0;
      const altura = hNome + hFrase + 14;
      garantirEspaco(altura);
      doc.font('Helvetica').fontSize(12).fillColor(cor).text(nome, esq, y + 7, { width: larguraNome });
      if (frase) doc.fontSize(10.5).fillColor(CINZA_CLARO).text(frase, esq, y + 7 + hNome, { width: larguraNome });
      doc.fontSize(12).fillColor(cor).text(valor, dir - colValor, y + 7, { width: colValor, align: 'right', lineBreak: false });
      y += altura;
      doc.lineWidth(1).strokeColor(LINHA).moveTo(esq, y).lineTo(dir, y).stroke();
    };
    modelo.itens.forEach((i) => linhaItem(i));
    if (modelo.desconto) linhaItem({ nome: modelo.desconto.rotulo, frase: '', valor: modelo.desconto.valor }, COMBO);

    // Caixa de total
    y += 14;
    const alturaCaixa = 22 + 20 + modelo.mensalidades.length * 18;
    garantirEspaco(alturaCaixa);
    doc.roundedRect(esq, y, largura, alturaCaixa, 6).fill(FUNDO_TOTAL);
    const xi = esq + 14;
    const li = largura - 28;
    doc.font('Helvetica-Bold').fontSize(15).fillColor(ESCURO);
    doc.text('Total (pago uma vez)', xi, y + 13, { width: li, lineBreak: false });
    doc.text(modelo.total_unico, xi, y + 13, { width: li, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(12);
    modelo.mensalidades.forEach((m, k) => {
      const yy = y + 40 + k * 18;
      doc.text(m.nome, xi, yy, { width: li - colValor, lineBreak: false });
      doc.text(m.valor, xi, yy, { width: li, align: 'right', lineBreak: false });
    });
    y += alturaCaixa + 22;

    // Rodapé
    doc.font('Helvetica').fontSize(10.5);
    const hRodape = modelo.rodape.reduce((s, t) => s + doc.heightOfString(t, { width: largura }) + 2, 0);
    garantirEspaco(hRodape + 12);
    doc.lineWidth(1).strokeColor(LINHA).moveTo(esq, y).lineTo(dir, y).stroke();
    y += 10;
    doc.fillColor(CINZA);
    modelo.rodape.forEach((t) => {
      doc.text(t, esq, y, { width: largura });
      y += doc.heightOfString(t, { width: largura }) + 2;
    });

    doc.end();
  });
}
