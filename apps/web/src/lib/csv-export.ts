export interface CsvColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/// Constrói um CSV a partir de dados já carregados na tela (sem bater no
/// servidor) e dispara o download com o mesmo mecanismo de Blob + <a>
/// temporário já usado em features/relatorios/api.ts's downloadReportExport.
export function exportToCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(','),
  );
  const csv = [header, ...lines].join('\r\n');

  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
