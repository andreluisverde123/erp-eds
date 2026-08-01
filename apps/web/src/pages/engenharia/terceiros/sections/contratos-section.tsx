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
import { CONTRACT_BADGE_OPTIONS } from '@/features/terceiros/contract-badge';
import { ContractFormDrawer } from '@/features/terceiros/components/contract-form-drawer';
import { ContractsTable } from '@/features/terceiros/components/contracts-table';
import {
  useCancelContract,
  useDeleteContract,
} from '@/features/terceiros/hooks/use-contract-mutations';
import { useContracts } from '@/features/terceiros/hooks/use-contracts';
import { useContractors } from '@/features/terceiros/hooks/use-contractors';
import type { Contract, ContractBadgeStatus } from '@/features/terceiros/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function ContratosSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [contractorId, setContractorId] = useState(ALL);
  const [constructionSiteId, setConstructionSiteId] = useState(ALL);
  const [badgeStatus, setBadgeStatus] = useState<ContractBadgeStatus | typeof ALL>(ALL);
  const debouncedSearch = useDebouncedValue(search);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useContracts({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    contractorId: contractorId === ALL ? undefined : contractorId,
    constructionSiteId: constructionSiteId === ALL ? undefined : constructionSiteId,
    badgeStatus: badgeStatus === ALL ? undefined : badgeStatus,
  });

  const { data: contractorsData } = useContractors({ limit: 100 });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const cancelMutation = useCancelContract();
  const deleteMutation = useDeleteContract();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cancelingContract, setCancelingContract] = useState<Contract | null>(null);
  const [deletingContract, setDeletingContract] = useState<Contract | null>(null);

  async function confirmCancel() {
    if (!cancelingContract) return;
    await cancelMutation.mutateAsync(cancelingContract.id);
    setCancelingContract(null);
  }

  async function confirmDelete() {
    if (!deletingContract) return;
    await deleteMutation.mutateAsync(deletingContract.id);
    setDeletingContract(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Contratos</h2>
          <p className="text-sm text-muted-foreground">
            Contratos de terceirização por obra e vigência.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus />
          Novo Contrato
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[200px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => resetPageAnd(setSearch)(event.target.value)}
            placeholder="Buscar por número ou empresa"
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
          value={badgeStatus}
          onValueChange={(value) => resetPageAnd(setBadgeStatus)(value as ContractBadgeStatus)}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CONTRACT_BADGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && <ErrorState message="Não foi possível carregar os contratos. Tente novamente." />}

      {!isError && isLoading && !data && <LoadingState message="Carregando contratos..." />}

      {data && (
        <>
          <ContractsTable
            contracts={data.data}
            onCancel={setCancelingContract}
            onDelete={setDeletingContract}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} contratos
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

      <ContractFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <ConfirmDialog
        open={Boolean(cancelingContract)}
        onOpenChange={(open) => !open && setCancelingContract(null)}
        title="Encerrar contrato"
        description={`Tem certeza que deseja encerrar o contrato "${cancelingContract?.code}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Encerrar"
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={confirmCancel}
      />

      <ConfirmDialog
        open={Boolean(deletingContract)}
        onOpenChange={(open) => !open && setDeletingContract(null)}
        title="Excluir contrato"
        description={`Tem certeza que deseja excluir o contrato "${deletingContract?.code}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
