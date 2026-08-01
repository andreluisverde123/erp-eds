import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';

export interface ExportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

const MAX_EXPORT_ROWS = 5000;

/// Teto de linhas por exportação — protege memória/tempo de resposta contra
/// um filtro acidentalmente amplo demais. Uma exportação maior que isso é
/// um caso de uso legítimo (extrair todos os dados), mas fora de escopo
/// desta etapa; ver evoluções futuras (exportação assíncrona/paginada).
export function capExportRows<T>(rows: T[]): T[] {
  return rows.slice(0, MAX_EXPORT_ROWS);
}

export async function streamExcel(
  res: Response,
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, string>[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Relatório');

  sheet.columns = columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: 24,
    style: column.align === 'right' ? { alignment: { horizontal: 'right' } } : undefined,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(rows);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export function streamPdf(
  res: Response,
  filename: string,
  title: string,
  columns: ExportColumn[],
  rows: Record<string, string>[],
): void {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).text(title);
  doc
    .fontSize(9)
    .fillColor('#666666')
    .text(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
  doc.moveDown();
  doc.fillColor('#000000');

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - left - doc.page.margins.right;
  const columnWidth = pageWidth / columns.length;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  function drawHeader(y: number): number {
    doc.font('Helvetica-Bold').fontSize(9);
    columns.forEach((column, index) => {
      doc.text(column.label, left + index * columnWidth, y, { width: columnWidth - 6 });
    });
    const lineY = y + 14;
    doc
      .moveTo(left, lineY)
      .lineTo(left + pageWidth, lineY)
      .strokeColor('#cccccc')
      .stroke();
    doc.font('Helvetica').fontSize(9);
    return lineY + 6;
  }

  let y = drawHeader(doc.y);

  for (const row of rows) {
    if (y > bottomLimit - 16) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }
    columns.forEach((column, index) => {
      doc.text(row[column.key] ?? '', left + index * columnWidth, y, {
        width: columnWidth - 6,
        align: column.align ?? 'left',
      });
    });
    y += 16;
  }

  doc.end();
}
