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
import { UserRound } from 'lucide-react';

import { useRhPipelineList } from '@/features/workflow/hooks/use-rh-pipeline';
import { getRhStageBadgeVariant, getRhStageLabel } from '@/features/workflow/rh-stage';
import { StageBadge } from '@/features/workflow/components/stage-badge';
import { RhDetailSheet } from '@/features/workflow/components/rh-detail-sheet';

export function RhWorkflowSection() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useRhPipelineList(page);

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-4">
      {isError && <ErrorState message="Não foi possível carregar o pipeline de RH." />}
      {!isError && isLoading && !data && <LoadingState message="Carregando..." />}

      {data && data.data.length === 0 && (
        <EmptyState icon={UserRound} title="Nenhum funcionário encontrado" />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Responsável</TableHead>
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
                  <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.position}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.responsavel?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StageBadge
                      label={getRhStageLabel(row.stage)}
                      variant={getRhStageBadgeVariant(row.stage)}
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

      <RhDetailSheet
        employeeId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}
