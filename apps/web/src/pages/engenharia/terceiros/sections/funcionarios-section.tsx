import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  Button,
  ErrorState,
  Input,
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
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { ContractEmployeeFormDrawer } from '@/features/terceiros/components/contract-employee-form-drawer';
import { ContractEmployeesTable } from '@/features/terceiros/components/contract-employees-table';
import { useDeleteContractEmployee } from '@/features/terceiros/hooks/use-contract-employee-mutations';
import { useContractEmployees } from '@/features/terceiros/hooks/use-contract-employees';
import { useContractors } from '@/features/terceiros/hooks/use-contractors';
import type { ContractEmployee } from '@/features/terceiros/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function FuncionariosSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [contractorId, setContractorId] = useState(ALL);
  const [constructionSiteId, setConstructionSiteId] = useState(ALL);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | typeof ALL>(ALL);
  const debouncedSearch = useDebouncedValue(search);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useContractEmployees({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    contractorId: contractorId === ALL ? undefined : contractorId,
    constructionSiteId: constructionSiteId === ALL ? undefined : constructionSiteId,
    status: status === ALL ? undefined : status,
  });

  const { data: contractorsData } = useContractors({ limit: 100 });
  const { data: sitesData } = useConstructionSites({ limit: 100 });
  const deleteMutation = useDeleteContractEmployee();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<ContractEmployee | undefined>();
  const [deletingEmployee, setDeletingEmployee] = useState<ContractEmployee | null>(null);

  function openCreateDrawer() {
    setEditingEmployee(undefined);
    setDrawerOpen(true);
  }

  function openEditDrawer(employee: ContractEmployee) {
    setEditingEmployee(employee);
    setDrawerOpen(true);
  }

  async function confirmDelete() {
    if (!deletingEmployee) return;
    await deleteMutation.mutateAsync(deletingEmployee.id);
    setDeletingEmployee(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Funcionários Terceirizados
          </h2>
          <p className="text-sm text-muted-foreground">
            Equipes das empresas terceirizadas alocadas nos contratos.
          </p>
        </div>
        <Button onClick={openCreateDrawer}>
          <Plus />
          Novo Funcionário
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[200px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => resetPageAnd(setSearch)(event.target.value)}
            placeholder="Buscar por nome ou empresa"
            className="pl-8"
          />
        </div>

        <Select value={contractorId} onValueChange={resetPageAnd(setContractorId)}>
          <SelectTrigger className="sm:w-[190px]">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as empresas</SelectItem>
            {contractorsData?.data.map((contractor) => (
              <SelectItem key={contractor.id} value={contractor.id}>
                {contractor.tradeName ?? contractor.legalName}
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

        <Select
          value={status}
          onValueChange={(value) => resetPageAnd(setStatus)(value as 'ACTIVE' | 'INACTIVE')}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="INACTIVE">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar os funcionários. Tente novamente." />
      )}

      {!isError && isLoading && !data && <LoadingState message="Carregando funcionários..." />}

      {data && (
        <>
          <ContractEmployeesTable
            employees={data.data}
            onEdit={openEditDrawer}
            onDelete={setDeletingEmployee}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} funcionários
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

      <ContractEmployeeFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        employee={editingEmployee}
      />

      <ConfirmDialog
        open={Boolean(deletingEmployee)}
        onOpenChange={(open) => !open && setDeletingEmployee(null)}
        title="Excluir funcionário"
        description={`Tem certeza que deseja excluir "${deletingEmployee?.name}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
