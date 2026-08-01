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

import { ContractorFormDrawer } from '@/features/terceiros/components/contractor-form-drawer';
import { ContractorsTable } from '@/features/terceiros/components/contractors-table';
import { CONTRACTOR_STATUS_OPTIONS } from '@/features/terceiros/contractor-status';
import { useDeleteContractor } from '@/features/terceiros/hooks/use-contractor-mutations';
import { useContractors } from '@/features/terceiros/hooks/use-contractors';
import type { Contractor, ContractorStatus } from '@/features/terceiros/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function EmpresasSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractorStatus | typeof ALL>(ALL);
  const [city, setCity] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const debouncedCity = useDebouncedValue(city);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useContractors({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : status,
    city: debouncedCity || undefined,
  });

  const deleteMutation = useDeleteContractor();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState<Contractor | undefined>();
  const [deletingContractor, setDeletingContractor] = useState<Contractor | null>(null);

  function openCreateDrawer() {
    setEditingContractor(undefined);
    setDrawerOpen(true);
  }

  function openEditDrawer(contractor: Contractor) {
    setEditingContractor(contractor);
    setDrawerOpen(true);
  }

  async function confirmDelete() {
    if (!deletingContractor) return;
    await deleteMutation.mutateAsync(deletingContractor.id);
    setDeletingContractor(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Empresas Terceirizadas
          </h2>
          <p className="text-sm text-muted-foreground">
            Cadastro de empresas terceirizadas que atendem as obras.
          </p>
        </div>
        <Button onClick={openCreateDrawer}>
          <Plus />
          Nova Empresa
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => resetPageAnd(setSearch)(event.target.value)}
            placeholder="Buscar por razão social, fantasia ou CNPJ"
            className="pl-8"
          />
        </div>

        <Input
          value={city}
          onChange={(event) => resetPageAnd(setCity)(event.target.value)}
          placeholder="Cidade"
          className="sm:w-[160px]"
        />

        <Select
          value={status}
          onValueChange={(value) => resetPageAnd(setStatus)(value as ContractorStatus)}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CONTRACTOR_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar as empresas terceirizadas. Tente novamente." />
      )}

      {!isError && isLoading && !data && <LoadingState message="Carregando empresas..." />}

      {data && (
        <>
          <ContractorsTable
            contractors={data.data}
            onEdit={openEditDrawer}
            onDelete={setDeletingContractor}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} empresas
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

      <ContractorFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        contractor={editingContractor}
      />

      <ConfirmDialog
        open={Boolean(deletingContractor)}
        onOpenChange={(open) => !open && setDeletingContractor(null)}
        title="Excluir empresa terceirizada"
        description={`Tem certeza que deseja excluir "${deletingContractor?.legalName}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
