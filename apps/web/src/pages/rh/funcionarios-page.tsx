import { useCallback, useState } from 'react';
import { Link } from 'react-router';
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
import { EmployeeFormDrawer } from '@/features/rh/components/employee-form-drawer';
import { EmployeesTable } from '@/features/rh/components/employees-table';
import { EMPLOYEE_STATUS_OPTIONS } from '@/features/rh/employee-status';
import { useDeleteEmployee } from '@/features/rh/hooks/use-employee-mutations';
import { useEmployeePositions, useEmployees } from '@/features/rh/hooks/use-employees';
import type { Employee, EmployeeStatus } from '@/features/rh/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function FuncionariosPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | typeof ALL>(ALL);
  const [position, setPosition] = useState(ALL);
  const [constructionSiteId, setConstructionSiteId] = useState(ALL);
  const debouncedSearch = useDebouncedValue(search);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const handleSearchChange = resetPageAnd(setSearch);
  const handleStatusChange = resetPageAnd(setStatus);
  const handlePositionChange = resetPageAnd(setPosition);
  const handleSiteChange = resetPageAnd(setConstructionSiteId);

  const { data, isLoading, isError } = useEmployees({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : status,
    position: position === ALL ? undefined : position,
    constructionSiteId: constructionSiteId === ALL ? undefined : constructionSiteId,
  });

  const { data: positionsData } = useEmployeePositions();
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const deleteMutation = useDeleteEmployee();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | undefined>();
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  function openCreateDrawer() {
    setEditingEmployee(undefined);
    setDrawerOpen(true);
  }

  // useCallback porque é passada direto pra EmployeesTable, que é memoizada.
  const openEditDrawer = useCallback((employee: Employee) => {
    setEditingEmployee(employee);
    setDrawerOpen(true);
  }, []);

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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Funcionários</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de funcionários e sua alocação nas obras.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/rh/funcionarios/alocacoes">Alocações</Link>
          </Button>
          <Button onClick={openCreateDrawer}>
            <Plus />
            Novo Funcionário
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Buscar por nome, CPF ou cargo"
            className="pl-8"
          />
        </div>

        <Select value={constructionSiteId} onValueChange={handleSiteChange}>
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

        <Select value={position} onValueChange={handlePositionChange}>
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Cargo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os cargos</SelectItem>
            {positionsData?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => handleStatusChange(value as EmployeeStatus)}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {EMPLOYEE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar os funcionários. Tente novamente." />
      )}

      {!isError && isLoading && !data && <LoadingState message="Carregando funcionários..." />}

      {data && (
        <>
          <EmployeesTable
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

      <EmployeeFormDrawer
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
