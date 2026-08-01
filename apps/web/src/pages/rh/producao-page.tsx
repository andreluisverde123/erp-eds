import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  ErrorState,
  LoadingState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { ProductionEntriesTable } from '@/features/rh/components/production-entries-table';
import { ProductionEntryFormDrawer } from '@/features/rh/components/production-entry-form-drawer';
import { useDeleteProductionEntry } from '@/features/rh/hooks/use-production-entry-mutations';
import { useProductionEntries } from '@/features/rh/hooks/use-production-entries';
import { useEmployees } from '@/features/rh/hooks/use-employees';
import type { ProductionEntry } from '@/features/rh/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function ProducaoPage() {
  const [page, setPage] = useState(1);
  const [employeeId, setEmployeeId] = useState(ALL);
  const [constructionSiteId, setConstructionSiteId] = useState(ALL);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useProductionEntries({
    page,
    limit: PAGE_SIZE,
    employeeId: employeeId === ALL ? undefined : employeeId,
    constructionSiteId: constructionSiteId === ALL ? undefined : constructionSiteId,
  });

  const { data: employeesData } = useEmployees({ limit: 100 });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const deleteMutation = useDeleteProductionEntry();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<ProductionEntry | null>(null);

  async function confirmDelete() {
    if (!deletingEntry) return;
    await deleteMutation.mutateAsync(deletingEntry.id);
    setDeletingEntry(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Produção</h1>
          <p className="text-sm text-muted-foreground">
            Apontamentos de produtividade dos funcionários nas obras.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus />
          Registrar Produção
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={constructionSiteId} onValueChange={resetPageAnd(setConstructionSiteId)}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Obra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as obras</SelectItem>
            {sitesData?.data.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={employeeId} onValueChange={resetPageAnd(setEmployeeId)}>
          <SelectTrigger className="sm:w-[200px]">
            <SelectValue placeholder="Funcionário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os funcionários</SelectItem>
            {employeesData?.data.map((employee) => (
              <SelectItem key={employee.id} value={employee.id}>
                {employee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar os apontamentos de produção. Tente novamente." />
      )}

      {!isError && isLoading && !data && <LoadingState message="Carregando produção..." />}

      {data && (
        <>
          <ProductionEntriesTable productionEntries={data.data} onDelete={setDeletingEntry} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} apontamentos
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

      <ProductionEntryFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <ConfirmDialog
        open={Boolean(deletingEntry)}
        onOpenChange={(open) => !open && setDeletingEntry(null)}
        title="Excluir apontamento"
        description="Tem certeza que deseja excluir este apontamento de produção?"
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
