import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  ErrorState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableSkeleton,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { EmployeeAllocationForm } from '@/features/rh/components/employee-allocation-form';
import { EmployeeAllocationsTable } from '@/features/rh/components/employee-allocations-table';
import {
  useDeleteEmployeeAllocation,
  useUpdateEmployeeAllocation,
} from '@/features/rh/hooks/use-employee-allocation-mutations';
import { useEmployeeAllocations } from '@/features/rh/hooks/use-employee-allocations';
import { useEmployees } from '@/features/rh/hooks/use-employees';
import type { EmployeeAllocation } from '@/features/rh/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function AlocacoesPage() {
  const [page, setPage] = useState(1);
  const [employeeId, setEmployeeId] = useState(ALL);
  const [constructionSiteId, setConstructionSiteId] = useState(ALL);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useEmployeeAllocations({
    page,
    limit: PAGE_SIZE,
    employeeId: employeeId === ALL ? undefined : employeeId,
    constructionSiteId: constructionSiteId === ALL ? undefined : constructionSiteId,
  });

  const { data: employeesData } = useEmployees({ limit: 100 });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const [endingAllocation, setEndingAllocation] = useState<EmployeeAllocation | null>(null);
  const [deletingAllocation, setDeletingAllocation] = useState<EmployeeAllocation | null>(null);

  const endMutation = useUpdateEmployeeAllocation(endingAllocation?.id ?? '');
  const deleteMutation = useDeleteEmployeeAllocation();

  async function confirmEnd() {
    if (!endingAllocation) return;
    await endMutation.mutateAsync({ endDate: new Date().toISOString().slice(0, 10) });
    setEndingAllocation(null);
  }

  async function confirmDelete() {
    if (!deletingAllocation) return;
    await deleteMutation.mutateAsync(deletingAllocation.id);
    setDeletingAllocation(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5 text-muted-foreground" asChild>
          <Link to="/rh/funcionarios">
            <ArrowLeft className="size-4" />
            Funcionários
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Alocação</h1>
        <p className="text-sm text-muted-foreground">
          Vincule funcionários às obras e centros de custo.
        </p>
      </div>

      <EmployeeAllocationForm />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
      </div>

      {isError && <ErrorState message="Não foi possível carregar as alocações. Tente novamente." />}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={6} rows={PAGE_SIZE} message="Carregando alocações..." />
      )}

      {data && (
        <>
          <EmployeeAllocationsTable
            allocations={data.data}
            onEnd={setEndingAllocation}
            onDelete={setDeletingAllocation}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} alocações
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

      <ConfirmDialog
        open={Boolean(endingAllocation)}
        onOpenChange={(open) => !open && setEndingAllocation(null)}
        title="Encerrar alocação"
        description={`Encerrar a alocação de "${endingAllocation?.employee.name}" na obra "${endingAllocation?.constructionSite.name}" hoje?`}
        confirmLabel="Encerrar"
        isLoading={endMutation.isPending}
        onConfirm={confirmEnd}
      />

      <ConfirmDialog
        open={Boolean(deletingAllocation)}
        onOpenChange={(open) => !open && setDeletingAllocation(null)}
        title="Excluir alocação"
        description={`Tem certeza que deseja excluir esta alocação de "${deletingAllocation?.employee.name}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
