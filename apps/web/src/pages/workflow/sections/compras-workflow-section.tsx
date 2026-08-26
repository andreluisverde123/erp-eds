import { useState } from 'react';
import {
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
import { ShoppingCart } from 'lucide-react';

import { useComprasPipelineList } from '@/features/workflow/hooks/use-compras-pipeline';
import {
  getComprasStageBadgeVariant,
  getComprasStageLabel,
} from '@/features/workflow/compras-stage';
import { StageBadge } from '@/features/workflow/components/stage-badge';
import { ComprasDetailSheet } from '@/features/workflow/components/compras-detail-sheet';

export function ComprasWorkflowSection() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useComprasPipelineList(page);

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-4">
      {isError && <ErrorState message="Não foi possível carregar o pipeline de Compras." />}
      {!isError && isLoading && !data && <LoadingState message="Carregando..." />}

      {data && data.data.length === 0 && (
        <EmptyState icon={ShoppingCart} title="Nenhuma solicitação encontrada" />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Solicitação</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Etapa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(row.id)}
                >
                  <TableCell className="font-medium text-foreground">{row.code}</TableCell>
                  <TableCell className="text-muted-foreground">{row.constructionSite.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.requestedBy.name}</TableCell>
                  <TableCell>
                    <StageBadge
                      label={getComprasStageLabel(row.stage)}
                      variant={getComprasStageBadgeVariant(row.stage)}
                    />
                  </TableCell>
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
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                />
                <PaginationNext
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
                />
              </div>
            </Pagination>
          )}
        </>
      )}

      <ComprasDetailSheet
        requestId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}
