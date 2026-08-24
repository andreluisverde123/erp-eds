import PDFDocument from 'pdfkit';

import type { DocumentField, DocumentRow, PurchaseOrderDocument } from './purchase-order-document';

/// Desenho do PDF da Ordem de Compra.
///
/// Só posicionamento: todo o conteúdo já chega formatado de
/// `buildPurchaseOrderDocument`. A regra que este arquivo precisa acertar é
/// uma só — nada pode ser cortado.

const MARGIN = 40;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const GRAY = '#666666';
const LINE = '#cccccc';
const BLACK = '#000000';

/// Larguras da tabela de itens, em proporção da largura útil. Somam 1.
/// Descrição fica com quase metade porque é a única coluna que quebra em
/// várias linhas; as demais têm tamanho previsível.
const COLUMNS = [
  { key: 'description', label: 'Descrição', width: 0.4, align: 'left' },
  { key: 'quantity', label: 'Qtd.', width: 0.09, align: 'right' },
  { key: 'unit', label: 'Un.', width: 0.07, align: 'left' },
  { key: 'unitPrice', label: 'Valor Unit.', width: 0.14, align: 'right' },
  { key: 'totalPrice', label: 'Valor Total', width: 0.15, align: 'right' },
  { key: 'origin', label: 'Origem', width: 0.15, align: 'left' },
] as const;

const CELL_PADDING = 4;
const ROW_FONT_SIZE = 9;
const MIN_ROW_HEIGHT = 18;

/// Mede a altura de um texto dentro de uma largura. Injetada para a regra de
/// altura de linha poder ser testada sem um documento pdfkit.
export type MeasureText = (text: string, width: number) => number;

/// A altura de uma linha da tabela é a da célula MAIS ALTA — de qualquer
/// coluna, não só da descrição.
///
/// Isto existe como função própria porque a versão anterior media só a
/// descrição, e o defeito não aparecia em teste nenhum: uma origem como
/// "SOL-0004 (solic. 20 M3)" quebra em duas linhas numa coluna estreita, a
/// linha continuava com altura de uma, e o texto excedente era desenhado por
/// cima da linha de baixo. Só apareceu ao olhar o PDF gerado.
export function measureRowHeight(
  measure: MeasureText,
  row: DocumentRow,
  widths: number[],
): number {
  return Math.max(
    MIN_ROW_HEIGHT,
    ...COLUMNS.map(
      (column, index) => measure(row[column.key], widths[index]! - CELL_PADDING * 2) + 6,
    ),
  );
}

export interface RenderedPdf {
  buffer: Buffer;
  /// Quantas páginas o documento tem. Existe para o teste conseguir afirmar
  /// que uma ordem com muitos itens realmente paginou, em vez de confiar que
  /// "deve ter paginado".
  pageCount: number;
}

export async function renderPurchaseOrderPdf(
  document: PurchaseOrderDocument,
): Promise<RenderedPdf> {
  // `bufferPages` mantém as páginas na memória até o fim, que é o que permite
  // escrever "Página 1 de 4" — o total só se conhece depois da última linha.
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  const left = MARGIN;
  const usableWidth = doc.page.width - MARGIN * 2;
  const bottomLimit = doc.page.height - MARGIN - 24; // 24 reservados para o rodapé

  drawCompanyHeader(doc, document, left, usableWidth);
  drawInfoBlocks(doc, document, left, usableWidth);
  drawItemsTable(doc, document, left, usableWidth, bottomLimit);
  drawTotal(doc, document, left, usableWidth, bottomLimit);
  drawNotes(doc, document, left, usableWidth, bottomLimit);
  drawTraceability(doc, document, left, usableWidth, bottomLimit);

  const range = doc.bufferedPageRange();
  drawFooters(doc, range, left, usableWidth);

  doc.end();
  await finished;

  return { buffer: Buffer.concat(chunks), pageCount: range.count };
}

type Doc = InstanceType<typeof PDFDocument>;

function drawCompanyHeader(doc: Doc, document: PurchaseOrderDocument, left: number, width: number) {
  const titleWidth = width * 0.38;
  const infoWidth = width - titleWidth - 12;
  const top = doc.y;

  doc.font(FONT_BOLD).fontSize(15).fillColor(BLACK).text(document.companyName, left, top, {
    width: infoWidth,
  });

  doc.font(FONT).fontSize(8).fillColor(GRAY);
  for (const item of document.companyFields) {
    doc.text(`${item.label}: ${item.value}`, left, doc.y, { width: infoWidth });
  }
  const afterCompany = doc.y;

  // Título e número alinhados à direita, na altura do topo do cabeçalho.
  doc
    .font(FONT_BOLD)
    .fontSize(15)
    .fillColor(BLACK)
    .text(document.title, left + width - titleWidth, top, { width: titleWidth, align: 'right' });
  doc
    .font(FONT_BOLD)
    .fontSize(13)
    .text(document.code, left + width - titleWidth, doc.y, {
      width: titleWidth,
      align: 'right',
    });

  const y = Math.max(afterCompany, doc.y) + 10;
  horizontalRule(doc, left, y, width);
  doc.y = y + 10;
}

function drawInfoBlocks(doc: Doc, document: PurchaseOrderDocument, left: number, width: number) {
  const columnWidth = (width - 16) / 2;
  const top = doc.y;

  const rightStart = drawFieldBlock(doc, 'ORDEM DE COMPRA', document.orderFields, left, top, columnWidth);
  const supplierFields: DocumentField[] = [
    { label: 'Razão social', value: document.supplierName },
    ...document.supplierFields,
  ];
  const leftEnd = drawFieldBlock(
    doc,
    'FORNECEDOR',
    supplierFields,
    left + columnWidth + 16,
    top,
    columnWidth,
  );

  doc.y = Math.max(rightStart, leftEnd) + 10;
  horizontalRule(doc, left, doc.y, width);
  doc.y += 10;
}

/// Desenha um bloco rótulo/valor e devolve o `y` em que ele terminou. Os dois
/// blocos são desenhados lado a lado, então quem chama precisa saber qual dos
/// dois ficou mais alto.
function drawFieldBlock(
  doc: Doc,
  title: string,
  fields: DocumentField[],
  x: number,
  y: number,
  width: number,
): number {
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY).text(title, x, y, { width });
  let cursor = doc.y + 2;

  for (const item of fields) {
    doc.font(FONT).fontSize(8).fillColor(GRAY).text(`${item.label}`, x, cursor, { width });
    doc.font(FONT).fontSize(9).fillColor(BLACK).text(item.value, x, doc.y, { width });
    cursor = doc.y + 3;
  }

  return cursor;
}

function columnWidths(usableWidth: number): number[] {
  return COLUMNS.map((column) => column.width * usableWidth);
}

function drawTableHeader(doc: Doc, left: number, y: number, usableWidth: number): number {
  const widths = columnWidths(usableWidth);
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY);

  let x = left;
  COLUMNS.forEach((column, index) => {
    doc.text(column.label, x + CELL_PADDING, y, {
      width: widths[index]! - CELL_PADDING * 2,
      align: column.align,
    });
    x += widths[index]!;
  });

  const lineY = y + 12;
  horizontalRule(doc, left, lineY, usableWidth);
  return lineY + 4;
}

function drawItemsTable(
  doc: Doc,
  document: PurchaseOrderDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  if (document.rows.length === 0) {
    doc.font(FONT).fontSize(9).fillColor(GRAY).text('Esta ordem não tem itens detalhados.', left, doc.y, {
      width: usableWidth,
    });
    doc.y += 8;
    return;
  }

  const widths = columnWidths(usableWidth);
  let y = drawTableHeader(doc, left, doc.y, usableWidth);

  for (const row of document.rows) {
    doc.font(FONT).fontSize(ROW_FONT_SIZE);

    // MEDE ANTES DE DESENHAR. Desenhar primeiro e conferir depois é o que
    // produz linha cortada na virada da página.
    const rowHeight = measureRowHeight(
      (text, width) => doc.heightOfString(text, { width }),
      row,
      widths,
    );

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      // O cabeçalho da tabela se repete: uma página de continuação sem ele
      // seria uma lista de números sem significado.
      y = drawTableHeader(doc, left, MARGIN, usableWidth);
      doc.font(FONT).fontSize(ROW_FONT_SIZE);
    }

    let x = left;
    COLUMNS.forEach((column, index) => {
      doc.fillColor(column.key === 'origin' ? GRAY : BLACK).text(row[column.key], x + CELL_PADDING, y, {
        width: widths[index]! - CELL_PADDING * 2,
        align: column.align,
      });
      x += widths[index]!;
    });

    y += rowHeight;
    doc.strokeColor('#eeeeee').moveTo(left, y - 3).lineTo(left + usableWidth, y - 3).stroke();
  }

  doc.y = y;
}

function drawTotal(
  doc: Doc,
  document: PurchaseOrderDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  // O total NUNCA fica órfão no topo de uma página nem espremido no rodapé:
  // se não couber inteiro, vai para a próxima.
  ensureSpace(doc, 44, bottomLimit);

  const y = doc.y + 4;
  horizontalRule(doc, left, y, usableWidth);

  doc
    .font(FONT_BOLD)
    .fontSize(11)
    .fillColor(BLACK)
    .text('TOTAL DA ORDEM DE COMPRA', left, y + 8, { width: usableWidth * 0.6 });
  doc
    .font(FONT_BOLD)
    .fontSize(13)
    .text(document.total, left + usableWidth * 0.6, y + 6, {
      width: usableWidth * 0.4,
      align: 'right',
    });

  doc.y = y + 30;
  doc
    .font(FONT)
    .fontSize(7)
    .fillColor(GRAY)
    .text('Total calculado automaticamente a partir dos itens desta ordem.', left, doc.y, {
      width: usableWidth,
    });
  doc.y += 6;
}

function drawNotes(
  doc: Doc,
  document: PurchaseOrderDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  if (!document.notes) return;

  doc.font(FONT).fontSize(9);
  const height = doc.heightOfString(document.notes, { width: usableWidth }) + 24;
  ensureSpace(doc, height, bottomLimit);

  horizontalRule(doc, left, doc.y, usableWidth);
  doc.y += 8;
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY).text('OBSERVAÇÕES', left, doc.y, {
    width: usableWidth,
  });
  doc.font(FONT).fontSize(9).fillColor(BLACK).text(document.notes, left, doc.y + 2, {
    width: usableWidth,
  });
  doc.y += 6;
}

function drawTraceability(
  doc: Doc,
  document: PurchaseOrderDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  if (document.traceabilityFields.length === 0) return;

  ensureSpace(doc, 20 + document.traceabilityFields.length * 12, bottomLimit);

  horizontalRule(doc, left, doc.y, usableWidth);
  doc.y += 8;
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY).text('ORIGEM DA COMPRA', left, doc.y, {
    width: usableWidth,
  });
  doc.font(FONT).fontSize(9).fillColor(BLACK);
  for (const item of document.traceabilityFields) {
    doc.text(`${item.label}: ${item.value}`, left, doc.y + 1, { width: usableWidth });
  }
}

/// Página nova quando o bloco inteiro não cabe no que sobrou.
function ensureSpace(doc: Doc, needed: number, bottomLimit: number) {
  if (doc.y + needed > bottomLimit) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

function horizontalRule(doc: Doc, x: number, y: number, width: number) {
  doc.strokeColor(LINE).lineWidth(0.5).moveTo(x, y).lineTo(x + width, y).stroke();
}

function drawFooters(
  doc: Doc,
  range: { start: number; count: number },
  left: number,
  usableWidth: number,
) {
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc
      .font(FONT)
      .fontSize(7)
      .fillColor(GRAY)
      .text(
        `Página ${index + 1} de ${range.count}`,
        left,
        doc.page.height - MARGIN - 10,
        { width: usableWidth, align: 'right' },
      );
  }
}
