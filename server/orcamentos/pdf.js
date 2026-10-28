import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const LOGO = fileURLToPath(new URL('./marca/logo-mark.png', import.meta.url));
const ALICE = fileURLToPath(new URL('./marca/Alice-Regular.ttf', import.meta.url));

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
  // O mesmo teste está em web/src/pages/Orcamento.jsx, que mostra o aviso na tela.
  if (/parcel/i.test(orcamento.pagamento)) rodape.push('Pagamento parcelado: será cobrada a taxa da maquininha.');
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
    descontos: [
      totais.desconto_combo_centavos > 0 && { rotulo: `Desconto combo (${orcamento.desconto_pct}%)`, valor: `- ${dinheiro(totais.desconto_combo_centavos)}` },
      totais.desconto_valor_centavos > 0 && { rotulo: 'Desconto', valor: `- ${dinheiro(totais.desconto_valor_centavos)}` },
    ].filter(Boolean),
    // 1º mês grátis: valor do mês riscado, sem mexer nos totais.
    brindes: orcamento.itens
      .filter((i) => i.primeiro_mes_gratis && i.valor_mensal_centavos > 0)
      .map((i) => ({ rotulo: `${i.nome} — 1º mês incluso`, riscado: dinheiro(i.valor_mensal_centavos), valor: 'grátis' })),
    // Só mensalidades: sem a linha "R$ 0,00" pago uma vez. Orçamento vazio mantém o R$ 0,00.
    total_unico: totais.total_unico_centavos === 0 && totais.mensalidades.length > 0
      ? null : dinheiro(totais.total_unico_centavos),
    // com desconto, o valor cheio aparece riscado acima do total
    total_sem_desconto: totais.desconto_centavos > 0 ? dinheiro(totais.subtotal_unico_centavos) : null,
    mensalidades: totais.mensalidades.map((m) => ({ nome: m.nome, valor: `${dinheiro(m.valor_centavos)}/mês` })),
    rodape,
  };
}

const TURQUESA = '#2dd4bf';
const ESCURO = '#1e2f45';
const CINZA = '#5f6b7a';
const CINZA_CLARO = '#7a8594';
const LINHA = '#e6ecef';
const COMBO = '#1fb5a3';
const FUNDO_TOTAL = '#eff9f8';

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
    doc.image(LOGO, esq, topo, { width: 150 });
    const yMarca = topo + 50;
    doc.font(ALICE).fontSize(20).fillColor(ESCURO).text(modelo.cabecalho.marca, esq, yMarca, { lineBreak: false });
    doc.font('Helvetica').fontSize(10.5).fillColor(CINZA).text(modelo.cabecalho.sub, esq, yMarca + 24, { lineBreak: false });
    [modelo.cabecalho.numero, modelo.cabecalho.data, modelo.cabecalho.validade].forEach((t, k) => {
      doc.text(t, esq, yMarca - 4 + k * 14, { width: largura, align: 'right', lineBreak: false });
    });
    const yLinha = yMarca + 44;
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
    const linhaItem = ({ nome, frase, valor, riscado }, cor = ESCURO) => {
      doc.font('Helvetica').fontSize(12);
      const hNome = doc.heightOfString(nome, { width: larguraNome });
      doc.fontSize(10.5);
      const hFrase = frase ? doc.heightOfString(frase, { width: larguraNome }) : 0;
      const altura = hNome + hFrase + 14;
      garantirEspaco(altura);
      doc.font('Helvetica').fontSize(12).fillColor(cor).text(nome, esq, y + 7, { width: larguraNome });
      if (frase) doc.fontSize(10.5).fillColor(CINZA_CLARO).text(frase, esq, y + 7 + hNome, { width: larguraNome });
      doc.fontSize(12).fillColor(cor).text(valor, dir - colValor, y + 7, { width: colValor, align: 'right', lineBreak: false });
      if (riscado) {
        // termina 8pt antes do "grátis", alinhado à direita
        const fimRiscado = dir - doc.widthOfString(valor) - 8;
        doc.fillColor(CINZA).text(riscado, fimRiscado - colValor, y + 7, { width: colValor, align: 'right', lineBreak: false, strike: true });
      }
      y += altura;
      doc.lineWidth(1).strokeColor(LINHA).moveTo(esq, y).lineTo(dir, y).stroke();
    };
    modelo.itens.forEach((i) => linhaItem(i));
    modelo.descontos.forEach((d) => linhaItem({ nome: d.rotulo, frase: '', valor: d.valor }, COMBO));
    modelo.brindes.forEach((b) => linhaItem({ nome: b.rotulo, frase: '', valor: b.valor, riscado: b.riscado }, COMBO));

    // Caixa de total
    y += 14;
    const riscado = modelo.total_unico != null && modelo.total_sem_desconto ? 18 : 0;
    const topoMensal = (modelo.total_unico == null ? 12 : 40) + riscado;
    const alturaCaixa = topoMensal + 4 + modelo.mensalidades.length * 18;
    garantirEspaco(alturaCaixa);
    doc.roundedRect(esq, y, largura, alturaCaixa, 6).fill(FUNDO_TOTAL);
    const xi = esq + 14;
    const li = largura - 28;
    if (riscado) {
      doc.font('Helvetica').fontSize(12).fillColor(CINZA)
        .text(modelo.total_sem_desconto, xi, y + 12, { width: li, align: 'right', lineBreak: false, strike: true });
    }
    doc.font('Helvetica-Bold').fontSize(15).fillColor(ESCURO);
    if (modelo.total_unico != null) {
      doc.text('Total (pago uma vez)', xi, y + 13 + riscado, { width: li, lineBreak: false });
      doc.text(modelo.total_unico, xi, y + 13 + riscado, { width: li, align: 'right', lineBreak: false });
    }
    doc.font('Helvetica').fontSize(12).fillColor(ESCURO);
    modelo.mensalidades.forEach((m, k) => {
      const yy = y + topoMensal + k * 18;
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
