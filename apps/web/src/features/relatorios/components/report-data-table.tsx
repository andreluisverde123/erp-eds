import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileQuestion,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { useReportExport } from '../hooks/use-report-export';
import type { PaginatedResult, ReportQuery, ReportType } from '../types';

export interface ReportColumn<T> {
  key: string;
  label: string;
  /// Se definido, o cabeçalho vira clicável e ordena por este campo (ver
  /// `sortBy`/`sortDir` aceitos pelo backend em cada relatório).
  sortKey?: string;
  align?: 'right';
  render: (row: T) => React.ReactNode;
}

interface ReportDataTableProps<T> {
  type: ReportType;
  columns: ReportColumn<T>[];
  data?: PaginatedResult<T>;
  isLoading: boolean;
  isError: boolean;
  query: ReportQuery;
  onQueryChange: (patch: Partial<ReportQuery>) => void;
  emptyMessage?: string;
}

/// Tabela de relatório reutilizada pelas 5 telas (Obras/Compras/Financeiro/
/// RH/Terceiros) — cada uma só define suas colunas e filtros próprios;
/// ordenação, paginação e exportação Excel/PDF ficam centralizadas aqui.
export function ReportDataTable<T extends { id: string }>({
  type,
  columns,
  data,
  isLoading,
  isError,
  query,
  onQueryChange,
  emptyMessage,
}: ReportDataTableProps<T>) {
  const exportMutation = useReportExport();

  function handleSort(sortKey: string) {
    if (query.sortBy === sortKey) {
      onQueryChange({
        sortBy: sortKey,
        sortDir: query.sortDir === 'asc' ? 'desc' : 'asc',
        page: 1,
      });
    } else {
      onQueryChange({ sortBy: sortKey, sortDir: 'asc', page: 1 });
    }
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate({ type, query, format: 'xlsx' })}
        >
          <FileSpreadsheet />
          Exportar Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate({ type, query, format: 'pdf' })}
        >
          <FileText />
          Exportar PDF
        </Button>
      </div>

      {isError && <ErrorState message="Não foi possível carregar o relatório. Tente novamente." />}

      {!isError && isLoading && !data && <LoadingState message="Carregando relatório..." />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={FileQuestion}
          title={emptyMessage ?? 'Nenhum registro encontrado.'}
          className="min-h-[30vh]"
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={column.align === 'right' ? 'text-right' : undefined}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => handleSort(column.sortKey!)}
                      >
                        {column.label}
                        {query.sortBy === column.sortKey ? (
                          query.sortDir === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={column.align === 'right' ? 'text-right' : undefined}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total}
              </p>
              <div className="flex items-center gap-2">
                <PaginationPrevious
                  disabled={meta.page <= 1}
                  onClick={() => onQueryChange({ page: Math.max(1, meta.page - 1) })}
                />
                <PaginationNext
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => onQueryChange({ page: Math.min(meta.totalPages, meta.page + 1) })}
                />
              </div>
            </Pagination>
          )}
        </>
      )}
    </div>
  );
}
