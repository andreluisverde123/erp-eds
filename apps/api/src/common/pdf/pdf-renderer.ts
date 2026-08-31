import PDFDocument from 'pdfkit';

import type {
  DocumentBlock,
  DocumentColumn,
  DocumentRow,
  PrintableDocument,
} from './printable-document';

/// Desenho de um documento imprimível.
///
/// Só posicionamento: todo o conteúdo já chega formatado do builder do
/// documento (`buildPurchaseOrderDocument`, `buildPurchaseRequestDocument`).
/// A regra que este arquivo precisa acertar é uma só — nada pode ser cortado.

const MARGIN = 40;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const GRAY = '#666666';
const LINE = '#cccccc';
const BLACK = '#000000';

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
  columns: readonly DocumentColumn[],
  widths: number[],
): number {
  return Math.max(
    MIN_ROW_HEIGHT,
    ...columns.map(
      (column, index) => measure(row[column.key] ?? '', widths[index]! - CELL_PADDING * 2) + 6,
    ),
  );
}

export interface RenderedPdf {
  buffer: Buffer;
  /// Quantas páginas o documento tem. Existe para o teste conseguir afirmar
  /// que um documento com muitos itens realmente paginou, em vez de confiar
  /// que "deve ter paginado".
  pageCount: number;
}

export async function renderDocumentPdf(document: PrintableDocument): Promise<RenderedPdf> {
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
  drawFooterBlock(doc, document, left, usableWidth, bottomLimit);
  drawSignatures(doc, document, left, usableWidth, bottomLimit);

  const range = doc.bufferedPageRange();
  drawFooters(doc, range, left, usableWidth);

  doc.end();
  await finished;

  return { buffer: Buffer.concat(chunks), pageCount: range.count };
}

type Doc = InstanceType<typeof PDFDocument>;

const TITLE_SIZES = [15, 14, 13, 12, 11];

/// O maior corpo em que o título cabe numa linha só. Devolve o menor da lista
/// quando nenhum couber — um título gigante quebra, mas nunca some.
///
/// Quem chama define o corpo definitivo logo em seguida, então não há estado
/// de fonte a restaurar aqui.
function fitTitleSize(doc: Doc, title: string, width: number): number {
  return (
    TITLE_SIZES.find((size) => {
      doc.fontSize(size);
      return doc.widthOfString(title) <= width;
    }) ?? TITLE_SIZES[TITLE_SIZES.length - 1]!
  );
}

function drawCompanyHeader(doc: Doc, document: PrintableDocument, left: number, width: number) {
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
  //
  // O corpo do título ENCOLHE para caber em uma linha. "ORDEM DE COMPRA" cabe
  // a 15pt; "SOLICITAÇÃO DE COMPRA" não, e quebrava em "SOLICITAÇÃO DE /
  // COMPRA" — legível, mas feio o bastante para parecer defeito. Encolher é
  // preferível a alargar a coluna, que empurraria os dados da empresa.
  doc
    .font(FONT_BOLD)
    .fillColor(BLACK)
    .fontSize(fitTitleSize(doc, document.title, titleWidth));
  doc.text(document.title, left + width - titleWidth, top, { width: titleWidth, align: 'right' });

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

function drawInfoBlocks(doc: Doc, document: PrintableDocument, left: number, width: number) {
  if (document.blocks.length === 0) return;

  const columnWidth = (width - 16) / 2;
  const top = doc.y;

  const ends = document.blocks
    .slice(0, 2)
    .map((block, index) =>
      drawFieldBlock(doc, block, left + index * (columnWidth + 16), top, columnWidth),
    );

  doc.y = Math.max(...ends) + 10;
  horizontalRule(doc, left, doc.y, width);
  doc.y += 10;
}

/// Desenha um bloco rótulo/valor e devolve o `y` em que ele terminou. Os dois
/// blocos são desenhados lado a lado, então quem chama precisa saber qual dos
/// dois ficou mais alto.
function drawFieldBlock(
  doc: Doc,
  block: DocumentBlock,
  x: number,
  y: number,
  width: number,
): number {
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY).text(block.title, x, y, { width });
  let cursor = doc.y + 2;

  for (const item of block.fields) {
    doc.font(FONT).fontSize(8).fillColor(GRAY).text(`${item.label}`, x, cursor, { width });
    doc.font(FONT).fontSize(9).fillColor(BLACK).text(item.value, x, doc.y, { width });
    cursor = doc.y + 3;
  }

  return cursor;
}

function columnWidths(columns: readonly DocumentColumn[], usableWidth: number): number[] {
  return columns.map((column) => column.width * usableWidth);
}

function drawTableHeader(
  doc: Doc,
  columns: readonly DocumentColumn[],
  left: number,
  y: number,
  usableWidth: number,
): number {
  const widths = columnWidths(columns, usableWidth);
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY);

  let x = left;
  columns.forEach((column, index) => {
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
  document: PrintableDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  if (document.rows.length === 0) {
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor(GRAY)
      .text(document.emptyRowsMessage, left, doc.y, { width: usableWidth });
    doc.y += 8;
    return;
  }

  const { columns } = document;
  const widths = columnWidths(columns, usableWidth);
  let y = drawTableHeader(doc, columns, left, doc.y, usableWidth);

  for (const row of document.rows) {
    doc.font(FONT).fontSize(ROW_FONT_SIZE);

    // MEDE ANTES DE DESENHAR. Desenhar primeiro e conferir depois é o que
    // produz linha cortada na virada da página.
    const rowHeight = measureRowHeight(
      (text, width) => doc.heightOfString(text, { width }),
      row,
      columns,
      widths,
    );

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      // O cabeçalho da tabela se repete: uma página de continuação sem ele
      // seria uma lista de números sem significado.
      y = drawTableHeader(doc, columns, left, MARGIN, usableWidth);
      doc.font(FONT).fontSize(ROW_FONT_SIZE);
    }

    let x = left;
    columns.forEach((column, index) => {
      doc.fillColor(column.muted ? GRAY : BLACK).text(row[column.key] ?? '', x + CELL_PADDING, y, {
        width: widths[index]! - CELL_PADDING * 2,
        align: column.align,
      });
      x += widths[index]!;
    });

    y += rowHeight;
    doc
      .strokeColor('#eeeeee')
      .moveTo(left, y - 3)
      .lineTo(left + usableWidth, y - 3)
      .stroke();
  }

  doc.y = y;
}

function drawTotal(
  doc: Doc,
  document: PrintableDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  if (!document.total) return;

  const lines = document.total.lines ?? [];

  // O bloco do total NUNCA fica órfão no topo de uma página nem espremido no
  // rodapé: se não couber INTEIRO — etapas da conta incluídas —, vai para a
  // próxima. Quebrar entre "subtotal" e "total" seria pior que uma folha a
  // mais.
  ensureSpace(doc, 44 + lines.length * 13, bottomLimit);

  let y = doc.y + 4;
  horizontalRule(doc, left, y, usableWidth);
  y += 8;

  // As etapas ficam alinhadas à direita, na mesma coluna do total, para a
  // conta ser lida de cima para baixo numa coluna só.
  for (const line of lines) {
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor(GRAY)
      .text(line.label, left + usableWidth * 0.45, y, {
        width: usableWidth * 0.3,
        align: 'right',
      });
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor(BLACK)
      .text(line.value, left + usableWidth * 0.75, y, {
        width: usableWidth * 0.25,
        align: 'right',
      });
    y += 13;
  }

  if (lines.length > 0) {
    horizontalRule(doc, left + usableWidth * 0.45, y + 1, usableWidth * 0.55);
    y += 6;
  }

  doc
    .font(FONT_BOLD)
    .fontSize(11)
    .fillColor(BLACK)
    .text(document.total.label, left, y, { width: usableWidth * 0.6 });
  doc
    .font(FONT_BOLD)
    .fontSize(13)
    .text(document.total.value, left + usableWidth * 0.6, y - 2, {
      width: usableWidth * 0.4,
      align: 'right',
    });

  doc.y = y + 22;

  if (document.total.caption) {
    doc
      .font(FONT)
      .fontSize(7)
      .fillColor(GRAY)
      .text(document.total.caption, left, doc.y, { width: usableWidth });
  }
  doc.y += 6;
}

function drawNotes(
  doc: Doc,
  document: PrintableDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  if (!document.notes) return;

  doc.font(FONT).fontSize(9);
  const height = doc.heightOfString(document.notes.text, { width: usableWidth }) + 24;
  ensureSpace(doc, height, bottomLimit);

  horizontalRule(doc, left, doc.y, usableWidth);
  doc.y += 8;
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY).text(document.notes.title, left, doc.y, {
    width: usableWidth,
  });
  doc
    .font(FONT)
    .fontSize(9)
    .fillColor(BLACK)
    .text(document.notes.text, left, doc.y + 2, {
      width: usableWidth,
    });
  doc.y += 6;
}

function drawFooterBlock(
  doc: Doc,
  document: PrintableDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  if (!document.footer || document.footer.fields.length === 0) return;

  ensureSpace(doc, 20 + document.footer.fields.length * 12, bottomLimit);

  horizontalRule(doc, left, doc.y, usableWidth);
  doc.y += 8;
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY).text(document.footer.title, left, doc.y, {
    width: usableWidth,
  });
  doc.font(FONT).fontSize(9).fillColor(BLACK);
  for (const item of document.footer.fields) {
    doc.text(`${item.label}: ${item.value}`, left, doc.y + 1, { width: usableWidth });
  }
}

/// Linhas para assinar à mão, lado a lado no fim do documento.
///
/// O bloco inteiro cabe ou vai para a página seguinte: uma assinatura separada
/// do nome que a identifica, ou uma linha sozinha no pé da folha, é pior que
/// uma página a mais.
///
/// O nome vai ABAIXO da linha, não sobre ela — o espaço acima é onde a pessoa
/// escreve. Imprimir o nome em cima é o erro que transforma um campo de
/// assinatura numa etiqueta.
function drawSignatures(
  doc: Doc,
  document: PrintableDocument,
  left: number,
  usableWidth: number,
  bottomLimit: number,
) {
  const signatures = document.signatures ?? [];
  if (signatures.length === 0) return;

  const ALTURA = 58;
  ensureSpace(doc, ALTURA, bottomLimit);

  const y = doc.y + 30;
  const columnWidth = usableWidth / signatures.length;

  for (const [index, signature] of signatures.entries()) {
    const x = left + columnWidth * index;
    // Margem lateral dentro da coluna: sem ela, duas assinaturas vizinhas
    // ficam com as linhas se tocando e parecem uma só.
    const lineWidth = columnWidth - 28;

    doc
      .moveTo(x + 14, y)
      .lineTo(x + 14 + lineWidth, y)
      .lineWidth(0.5)
      .stroke(BLACK);

    if (signature.name) {
      doc.font(FONT_BOLD).fontSize(8).fillColor(BLACK).text(signature.name, x + 14, y + 4, {
        width: lineWidth,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });
    }

    doc
      .font(FONT)
      .fontSize(7.5)
      .fillColor(GRAY)
      .text(signature.role, x + 14, y + (signature.name ? 15 : 4), {
        width: lineWidth,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });
  }

  doc.y = y + 26;
}

/// Página nova quando o bloco inteiro não cabe no que sobrou.
function ensureSpace(doc: Doc, needed: number, bottomLimit: number) {
  if (doc.y + needed > bottomLimit) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

function horizontalRule(doc: Doc, x: number, y: number, width: number) {
  doc
    .strokeColor(LINE)
    .lineWidth(0.5)
    .moveTo(x, y)
    .lineTo(x + width, y)
    .stroke();
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
      .text(`Página ${index + 1} de ${range.count}`, left, doc.page.height - MARGIN - 10, {
        width: usableWidth,
        align: 'right',
      });
  }
}
